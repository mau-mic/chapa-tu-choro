"""Server-only source catalogue and durable execution attempts, CLI/Compose/Lambda."""

import argparse
import json
import logging
import uuid
import threading
from contextlib import contextmanager
from .common import connect as _connect

logger = logging.getLogger(__name__)
COUNTERS = {
    "scanned_rows",
    "selected_rows",
    "rejected_rows",
    "out_of_scope_rows",
    "unmatched_districts",
    "departments_imported",
    "districts_imported",
    "rejected_features",
    "sourceRows",
    "mappedRows",
    "unavailable_values",
    "report_district_years_without_population",
}


class TrackingError(RuntimeError):
    pass


@contextmanager
def connect():
    try:
        with _connect() as db:
            yield db
    except TrackingError:
        raise
    except Exception as error:
        raise TrackingError(
            "Tracking database operation failed: " + type(error).__name__
        ) from None


class TrackingRun:
    def __init__(self, pipeline, sources, year=None, month=None, run_id=None, lease_seconds=300, heartbeat_seconds=60):
        if lease_seconds < 2 or not 0 < heartbeat_seconds < lease_seconds:
            raise ValueError("Heartbeat must be shorter than the lease")
        self.lease_seconds = lease_seconds
        self.heartbeat_seconds = heartbeat_seconds
        self.token = str(uuid.uuid4())
        self._stop = threading.Event()
        self._thread = None
        self.id = run_id or str(uuid.uuid4())
        self.pipeline, self.sources, self.year, self.month = (
            pipeline,
            tuple(sources),
            year,
            month,
        )
        self.current_stage = "configuration"

    def __enter__(self):
        with connect() as db:
            db.execute("SET LOCAL statement_timeout='20s'")
            if not db.execute(
                "SELECT to_regclass(format('%I.ingestion_runs',current_schema())) IS NOT NULL"
            ).fetchone()[0]:
                raise TrackingError(
                    "Run python -m ingestion.migrate to initialize db/001_baseline.sql before running ingestion"
                )
            if not db.execute("SELECT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='ingestion_runs'::regclass AND attname='lease_token' AND NOT attisdropped)").fetchone()[0]:
                raise TrackingError("Run python -m ingestion.migrate to apply db/002_ingestion_leases.sql")
            available = db.execute(
                "SELECT source_key FROM ingestion_sources WHERE source_key=ANY(%s) AND enabled AND access_mode='etl'",
                (list(self.sources),),
            ).fetchall()
            if {r[0] for r in available} != set(self.sources):
                raise TrackingError(
                    "Ingestion source is missing, disabled or not an ETL source"
                )
            db.execute(
                "INSERT INTO ingestion_runs(run_id,pipeline,requested_year,requested_month,lease_token,heartbeat_at,lease_expires_at) VALUES(%s,%s,%s,%s,%s,clock_timestamp(),clock_timestamp()+make_interval(secs=>%s))",
                (self.id, self.pipeline, self.year, self.month, self.token, self.lease_seconds),
            )
            for source in self.sources:
                db.execute(
                    "INSERT INTO ingestion_run_sources(run_id,source_key) VALUES(%s,%s)",
                    (self.id, source),
                )
        self._thread = threading.Thread(target=self._heartbeat, daemon=True)
        self._thread.start()
        return self

    def _heartbeat(self):
        while not self._stop.wait(self.heartbeat_seconds):
            try:
                self.renew()
            except Exception:
                # Completion remains fenced by the database clock; a failed
                # renewal can never resurrect an expired worker.
                logger.error("Ingestion heartbeat failed; run_id=%s", self.id)
                self._stop.set()

    def renew(self):
        with connect() as db:
            db.execute("SET LOCAL statement_timeout='20s'")
            changed = db.execute("UPDATE ingestion_runs SET heartbeat_at=clock_timestamp(),lease_expires_at=clock_timestamp()+make_interval(secs=>%s) WHERE run_id=%s AND lease_token=%s AND status='running' AND lease_expires_at>clock_timestamp() RETURNING run_id", (self.lease_seconds,self.id,self.token)).fetchone()
            if not changed:
                raise TrackingError("Ingestion lease expired or no longer owned")

    def stage(self, stage):
        if stage not in {"configuration", "extract", "transform", "archive", "load"}:
            raise TrackingError("Invalid ingestion stage")
        self.current_stage = stage
        with connect() as db:
            db.execute("SET LOCAL statement_timeout='20s'")
            changed = db.execute(
                "UPDATE ingestion_runs SET stage=%s WHERE run_id=%s AND status='running' AND lease_token=%s AND lease_expires_at>clock_timestamp() RETURNING run_id",
                (stage, self.id, self.token),
            ).fetchone()
            if not changed:
                raise TrackingError("Ingestion lease expired or no longer owned")

    def complete(self, db, results):
        """Call inside the same transaction as data writes (or a no-data outcome)."""
        if set(results) != set(self.sources):
            raise TrackingError("Tracking receipts must include every selected source")
        # Lock/fence before writing receipts, in the same transaction as data.
        owned = db.execute("SELECT run_id FROM ingestion_runs WHERE run_id=%s AND lease_token=%s AND status='running' AND lease_expires_at>clock_timestamp() FOR UPDATE", (self.id,self.token)).fetchone()
        if not owned:
            raise TrackingError("Ingestion lease expired or no longer owned")
        outcomes = []
        for key, result in results.items():
            status = {
                "imported": "succeeded",
                "succeeded": "succeeded",
                "unchanged": "unchanged",
                "skipped": "unchanged",
                "unavailable": "unavailable",
            }.get(result.get("status"))
            if status is None:
                raise TrackingError("Unsupported ingestion outcome")
            outcomes.append(status)
            counters = {
                k: v
                for k, v in result.items()
                if k in COUNTERS
                and isinstance(v, int)
                and not isinstance(v, bool)
                and v >= 0
            }
            # Only safe aggregate counters, never source rows, arbitrary URLs or exception text.
            quality = result.get("quality", {})
            if quality:
                for k in ("missingBoundary", "outsideDeclaredDistrict"):
                    v = quality.get(k)
                    if isinstance(v, int) and v >= 0:
                        counters[k] = v
                rejected = quality.get("rejected", {})
                if rejected and all(
                    isinstance(v, int) and v >= 0 for v in rejected.values()
                ):
                    counters["rejected_rows"] = sum(rejected.values())
            digest = result.get("sha256")
            db.execute(
                "UPDATE ingestion_run_sources SET outcome=%s,sha256=%s,counters=%s::jsonb WHERE run_id=%s AND source_key=%s",
                (status, digest, json.dumps(counters), self.id, key),
            )
        outcome = (
            "succeeded"
            if "succeeded" in outcomes
            else "unavailable" if "unavailable" in outcomes else "unchanged"
        )
        changed = db.execute(
            "UPDATE ingestion_runs SET status=%s,stage=%s,finished_at=now() WHERE run_id=%s AND status='running' AND lease_token=%s AND lease_expires_at>clock_timestamp() RETURNING run_id",
            (outcome, self.current_stage, self.id, self.token),
        ).fetchone()
        if not changed:
            raise TrackingError("Ingestion attempt is already terminal or missing")

    def finish(self, results):
        with connect() as db:
            self.complete(db, results)

    def __exit__(self, kind, error, tb):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=21)
        if kind is not None:
            try:
                with connect() as db:
                    db.execute("SET LOCAL statement_timeout='20s'")
                    # Do not overwrite an atomic success if a post-commit operation fails.
                    changed = db.execute(
                        "UPDATE ingestion_runs SET status='failed',stage=%s,error_type=%s,finished_at=now() WHERE run_id=%s AND status='running' AND lease_token=%s AND lease_expires_at>clock_timestamp() RETURNING run_id",
                        (self.current_stage, kind.__name__[:100], self.id, self.token),
                    ).fetchone()
                    if changed:
                        db.execute(
                            "UPDATE ingestion_run_sources SET outcome='failed' WHERE run_id=%s",
                            (self.id,),
                        )
            except Exception as audit_error:
                logger.error(
                    json.dumps(
                        {
                            "event": "ingestion_tracking_failed",
                            "run_id": self.id,
                            "error_type": type(audit_error).__name__,
                        }
                    )
                )
                raise TrackingError(
                    "Failed to persist ingestion failure; inspect running attempt "
                    + self.id
                ) from None
        else:
            with connect() as db:
                status = db.execute(
                    "SELECT status FROM ingestion_runs WHERE run_id=%s", (self.id,)
                ).fetchone()
            if not status or status[0] == "running":
                raise TrackingError(
                    "Ingestion ended without a committed outcome: " + self.id
                )
        return False


def reconcile(limit=20):
    """Fail only expired leases. Unleased legacy attempts retain unknown state."""
    if not 1 <= limit <= 200:
        raise ValueError("limit must be between 1 and 200")
    with connect() as db:
        rows = db.execute("""WITH expired AS (
          SELECT run_id FROM ingestion_runs WHERE status='running'
          AND lease_token IS NOT NULL AND lease_expires_at<=clock_timestamp()
          ORDER BY lease_expires_at LIMIT %s FOR UPDATE SKIP LOCKED
        ) UPDATE ingestion_runs r SET status='failed',finished_at=clock_timestamp(),
          error_type='LeaseExpired' FROM expired e WHERE r.run_id=e.run_id
          RETURNING r.run_id""", (limit,)).fetchall()
        for (run_id,) in rows:
            db.execute("UPDATE ingestion_run_sources SET outcome='failed' WHERE run_id=%s", (run_id,))
        return [str(row[0]) for row in rows]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resource", choices=["sources", "runs", "freshness", "reconcile"])
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()
    if not 1 <= args.limit <= 200:
        parser.error("limit must be between 1 and 200")
    if args.resource == "reconcile":
        print(json.dumps({"reconciled": reconcile(args.limit)}))
        return
    if args.resource == "freshness":
        from .freshness import report
        print(json.dumps(report(limit=args.limit)))
        return
    from psycopg.rows import dict_row

    with connect() as db:
        with db.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                (
                    "SELECT * FROM ingestion_sources ORDER BY source_key LIMIT %s"
                    if args.resource == "sources"
                    else """SELECT r.*,COALESCE((SELECT jsonb_agg(jsonb_build_object(
                     'source_key',s.source_key,'outcome',s.outcome,'sha256',s.sha256,'counters',s.counters)
                     ORDER BY s.source_key) FROM ingestion_run_sources s WHERE s.run_id=r.run_id),'[]'::jsonb) AS sources
                     FROM ingestion_runs r ORDER BY r.started_at DESC LIMIT %s"""
                ),
                (args.limit,),
            )
            print(json.dumps(cursor.fetchall(), default=str))


if __name__ == "__main__":
    main()
