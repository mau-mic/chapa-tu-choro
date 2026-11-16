"""Real isolated database tests; all rows and geometries are explicitly synthetic."""
from ingestion.migrate import schema_sql

import json
from datetime import date
import os
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch
from ingestion.tracking import TrackingRun, TrackingError


@unittest.skipUnless(os.getenv("CTC_TEST_DATABASE_URL"), "Requires isolated PostGIS")
class TrackingDatabaseTests(unittest.TestCase):
    def setUp(self):
        import psycopg

        self.psycopg = psycopg
        self.uri = os.environ["CTC_TEST_DATABASE_URL"]
        self.schema = "tracking_" + uuid.uuid4().hex
        with psycopg.connect(self.uri) as db:
            db.execute("CREATE SCHEMA " + self.schema)
            db.execute(
                schema_sql()
                .replace(
                    "SET search_path TO public, extensions;",
                    f"SET search_path TO {self.schema}, public, extensions;",
                )
            )
        for module in (
            "ingestion.tracking._connect",
            "ingestion.etl.connect",
            "ingestion.concentration.connect",
        ):
            p = patch(module, self.connect)
            p.start()
            self.addCleanup(p.stop)

    def connect(self):
        return self.psycopg.connect(
            self.uri,
            options=f"-c search_path={self.schema},public,extensions",
            prepare_threshold=None,
        )

    def tearDown(self):
        with self.psycopg.connect(self.uri) as db:
            db.execute("DROP SCHEMA " + self.schema + " CASCADE")

    def test_migration_is_repeatable_preserves_catalog_edits_and_existing_data(self):
        with self.connect() as db:
            db.execute(
                "UPDATE ingestion_sources SET notes='maintainer review' WHERE source_key='active-2026'"
            )
            count = db.execute("SELECT COUNT(*) FROM ingestion_sources").fetchone()[0]
            for _ in range(2):
                db.execute(
                    Path("db/archive/005_source_catalog_tracking.sql")
                    .read_text()
                    .replace(
                        "SET search_path TO public, extensions;",
                        f"SET search_path TO {self.schema},public,extensions;",
                    )
                )
            self.assertEqual(
                count,
                db.execute("SELECT COUNT(*) FROM ingestion_sources").fetchone()[0],
            )
            self.assertEqual(
                "maintainer review",
                db.execute(
                    "SELECT notes FROM ingestion_sources WHERE source_key='active-2026'"
                ).fetchone()[0],
            )
            self.assertEqual(
                "unresolved",
                db.execute(
                    "SELECT usage_status FROM ingestion_sources WHERE source_key='active-2026'"
                ).fetchone()[0],
            )
            self.assertEqual(
                3,
                db.execute(
                    "SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=%s AND c.relname IN ('ingestion_sources','ingestion_runs','ingestion_run_sources') AND c.relrowsecurity",
                    (self.schema,),
                ).fetchone()[0],
            )

    def test_extract_failure_is_durable_and_does_not_store_exception_payloads(self):
        with self.assertRaises(RuntimeError):
            with TrackingRun("statistics", ["sidpol-national"]) as run:
                run.stage("extract")
                raise RuntimeError("password=VERY_SECRET")
        with self.connect() as db:
            row = db.execute(
                "SELECT status,stage,error_type,finished_at FROM ingestion_runs WHERE run_id=%s",
                (run.id,),
            ).fetchone()
            self.assertEqual(("failed", "extract", "RuntimeError"), row[:3])
            self.assertIsNotNone(row[3])
            self.assertNotIn(
                "VERY_SECRET",
                json.dumps(
                    db.execute(
                        "SELECT row_to_json(r) FROM ingestion_runs r"
                    ).fetchone()[0],
                    default=str,
                ),
            )

    def test_read_only_cli_includes_source_receipts_and_validates_limit(self):
        import contextlib
        import io
        from ingestion.tracking import main

        with TrackingRun("statistics", ["sidpol-national"]) as run:
            run.finish({"sidpol-national": {"status": "unchanged", "sha256": "a" * 64}})
        for resource in ("sources", "runs"):
            output = io.StringIO()
            with patch(
                "sys.argv", ["tracking", resource, "--limit", "1"]
            ), contextlib.redirect_stdout(output):
                main()
            rows = json.loads(output.getvalue())
            self.assertEqual(1, len(rows))
            if resource == "runs":
                self.assertEqual(run.id, rows[0]["run_id"])
                self.assertEqual("unchanged", rows[0]["sources"][0]["outcome"])
                self.assertEqual("a" * 64, rows[0]["sources"][0]["sha256"])
        with patch(
            "sys.argv", ["tracking", "runs", "--limit", "201"]
        ), contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as failure:
                main()
        self.assertEqual(2, failure.exception.code)

    def test_rls_blocks_non_owner_even_if_table_select_is_granted(self):
        # Simulate permissive service defaults without relying on Supabase roles.
        role = "tracking_reader_" + uuid.uuid4().hex
        with TrackingRun("statistics", ["sidpol-national"]) as run:
            run.finish({"sidpol-national": {"status": "unchanged"}})
        with self.connect() as db:
            db.execute("CREATE ROLE " + role)
            db.execute(f"GRANT USAGE ON SCHEMA {self.schema} TO {role}")
            for table in (
                "ingestion_sources",
                "ingestion_runs",
                "ingestion_run_sources",
            ):
                db.execute(f"GRANT SELECT ON {table} TO {role}")
        try:
            with self.connect() as db:
                db.execute("SET LOCAL ROLE " + role)
                for table in (
                    "ingestion_sources",
                    "ingestion_runs",
                    "ingestion_run_sources",
                ):
                    self.assertEqual(
                        0, db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                    )
        finally:
            with self.connect() as db:
                db.execute("DROP OWNED BY " + role)
                db.execute("DROP ROLE " + role)

    def test_success_receipt_and_data_roll_back_together_then_failure_survives(self):
        with self.assertRaises(RuntimeError):
            with TrackingRun("statistics", ["sidpol-national"]) as run:
                run.stage("load")
                with self.connect() as db:
                    db.execute(
                        "INSERT INTO monthly_reports VALUES(2026,1,'150101','TEST','TEST','TEST','TEST',9)"
                    )
                    run.complete(
                        db,
                        {
                            "sidpol-national": {
                                "status": "imported",
                                "selected_rows": 9,
                                "sha256": "a" * 64,
                            }
                        },
                    )
                    raise RuntimeError("force data rollback")
        with self.connect() as db:
            self.assertEqual(
                0, db.execute("SELECT COUNT(*) FROM monthly_reports").fetchone()[0]
            )
            self.assertEqual(
                "failed",
                db.execute(
                    "SELECT status FROM ingestion_runs WHERE run_id=%s", (run.id,)
                ).fetchone()[0],
            )
            self.assertEqual(
                "failed",
                db.execute(
                    "SELECT outcome FROM ingestion_run_sources WHERE run_id=%s",
                    (run.id,),
                ).fetchone()[0],
            )

    def test_post_commit_error_does_not_relabel_committed_data_as_failed(self):
        with self.assertRaises(RuntimeError):
            with TrackingRun("statistics", ["sidpol-national"]) as run:
                with self.connect() as db:
                    run.complete(
                        db,
                        {
                            "sidpol-national": {
                                "status": "imported",
                                "selected_rows": 9,
                                "password": "SECRET",
                                "rejected_rows": -1,
                            }
                        },
                    )
                raise RuntimeError("logging failed after commit")
        with self.connect() as db:
            self.assertEqual(
                "succeeded",
                db.execute(
                    "SELECT status FROM ingestion_runs WHERE run_id=%s", (run.id,)
                ).fetchone()[0],
            )
            self.assertEqual(
                {"selected_rows": 9},
                db.execute(
                    "SELECT counters FROM ingestion_run_sources WHERE run_id=%s",
                    (run.id,),
                ).fetchone()[0],
            )

    def test_attempts_are_distinct_and_unchanged_or_unavailable_are_not_failures(self):
        ids = []
        for outcome in ("unchanged", "unavailable"):
            with TrackingRun("concentration", ["active-2026"], 2026, 1) as run:
                run.finish({"active-2026": {"status": outcome}})
            ids.append(run.id)
        self.assertNotEqual(*ids)
        with self.connect() as db:
            self.assertEqual(
                {"unchanged", "unavailable"},
                {r[0] for r in db.execute("SELECT status FROM ingestion_runs")},
            )

    def test_disabled_or_browser_sources_cannot_be_used_for_etl(self):
        with self.connect() as db:
            db.execute(
                "UPDATE ingestion_sources SET enabled=false WHERE source_key='active-2026'"
            )
        for source in ("active-2026", "mininter-basic-stations"):
            with self.assertRaises(TrackingError):
                with TrackingRun("concentration", [source], 2026, 1):
                    pass

    def test_lambda_statistics_pipeline_and_repeat_are_tracked_atomically(self):
        from ingestion.lambda_handler import handler
        from ingestion.tests.test_etl import fixture_fetch

        with patch.dict(os.environ, {}, clear=True), patch(
            "ingestion.download_official.fetch", fixture_fetch
        ):
            first = handler({"source_url": "https://untrusted.example"}, None)
            second = handler({}, None)
        self.assertNotEqual(first["run_id"], second["run_id"])
        with self.connect() as db:
            statuses = {
                str(r[0]): r[1]
                for r in db.execute("SELECT run_id,status FROM ingestion_runs")
            }
            self.assertEqual("succeeded", statuses[first["run_id"]])
            self.assertEqual("succeeded", statuses[second["run_id"]])
            self.assertEqual(
                "unchanged",
                db.execute(
                    "SELECT outcome FROM ingestion_run_sources WHERE run_id=%s AND source_key='sidpol-national'",
                    (second["run_id"],),
                ).fetchone()[0],
            )
            self.assertEqual(
                7, db.execute("SELECT SUM(reports) FROM monthly_reports").fetchone()[0]
            )
            self.assertEqual(
                6,
                db.execute(
                    "SELECT COUNT(*) FROM ingestion_run_sources WHERE outcome IS NOT NULL AND sha256 IS NOT NULL"
                ).fetchone()[0],
            )

    def test_concentration_runner_tracks_import_repeat_failure_and_unavailable(self):
        from ingestion.concentration import run as pipeline, ConcentrationImportError

        with self.connect() as db:
            db.execute(
                "INSERT INTO district_boundaries VALUES('150101','TEST',ST_Multi(ST_GeomFromText('POLYGON((-78 -13,-76 -13,-76 -11,-78 -11,-78 -13))',4326)))"
            )
        extracted = (
            [(1, 1, "150101", -77.0, -12.0, True, ["all", "robbery"])],
            "a" * 64,
            {"rejected": {}},
        )
        with patch("ingestion.concentration.extract", return_value=extracted):
            self.assertEqual("imported", pipeline(2026, 1, today=date(2026,11,13))["results"][0]["status"])
            self.assertEqual("unchanged", pipeline(2026, 1, today=date(2026,11,13))["results"][0]["status"])
        with patch("ingestion.concentration.extract", return_value=None):
            pipeline(2026, 2, today=date(2026,11,13))
        with patch("ingestion.concentration.extract", side_effect=ValueError("SECRET")):
            with self.assertRaises(ConcentrationImportError):
                pipeline(2026, 3, today=date(2026,11,13))
        with self.connect() as db:
            self.assertEqual(
                {"succeeded", "unchanged", "unavailable", "failed"},
                {r[0] for r in db.execute("SELECT status FROM ingestion_runs")},
            )
            self.assertEqual(
                1,
                db.execute("SELECT COUNT(*) FROM concentration_imports").fetchone()[0],
            )

    def test_manual_commands_are_tracked_and_check_only_is_not_a_write_attempt(self):
        import contextlib
        import io
        import tempfile
        from ingestion import import_sidpol, import_districts
        from ingestion.tests.test_etl import CSV

        with tempfile.TemporaryDirectory() as directory, patch(
            "ingestion.common.connect", self.connect
        ):
            geo = Path(directory) / "districts.geojson"
            csv = Path(directory) / "SIDPOL.csv"
            geo.write_text(
                json.dumps(
                    {
                        "type": "FeatureCollection",
                        "features": [
                            {
                                "type": "Feature",
                                "properties": {"UBIGEO": "150101", "NOMBDIST": "TEST"},
                                "geometry": {
                                    "type": "Polygon",
                                    "coordinates": [
                                        [
                                            [-78, -13],
                                            [-76, -13],
                                            [-76, -11],
                                            [-78, -11],
                                            [-78, -13],
                                        ]
                                    ],
                                },
                            }
                        ],
                    }
                )
            )
            csv.write_text(CSV)
            for main, args in [
                (import_districts.main, [str(geo), "--check-only"]),
                (import_districts.main, [str(geo)]),
                (import_sidpol.main, [str(csv)]),
            ]:
                with patch("sys.argv", ["test", *args]), contextlib.redirect_stdout(
                    io.StringIO()
                ):
                    main()
        with self.connect() as db:
            self.assertEqual(
                2,
                db.execute(
                    "SELECT COUNT(*) FROM ingestion_runs WHERE pipeline='manual' AND status='succeeded'"
                ).fetchone()[0],
            )
            self.assertEqual(
                7, db.execute("SELECT SUM(reports) FROM monthly_reports").fetchone()[0]
            )

    def test_freshness_uses_latest_nonempty_source_period_and_preserves_unknown_layers(self):
        from datetime import date
        from ingestion.freshness import report
        with self.connect() as db:
            db.execute("INSERT INTO monthly_reports VALUES(2026,9,'150101','TEST','TEST','TEST','TEST',0)")
            db.execute("INSERT INTO import_runs(source_kind,source_name,sha256,selected_rows) VALUES('sidpol-national','TEST',%s,1)", ('a'*64,))
            for source, year, month, rows in [('active-2026',2026,10,3),('active-2026',2026,12,0),('archive-2025-robbery',2025,9,2)]:
                db.execute("INSERT INTO concentration_imports(source_key,year,month,source_url,sha256,source_rows,quality) VALUES(%s,%s,%s,'https://example.test',%s,%s,'{}')",(source,year,month,'b'*64,rows))
        result = {s['source_key']:s for s in report(date(2026,11,13))['sources']}
        self.assertEqual({'year':2026,'month':9},result['sidpol-national']['latest_data_period'])
        self.assertEqual({'year':2026,'month':10},result['active-2026']['latest_data_period'])
        self.assertEqual({'year':2025,'month':9},result['archive-2025-robbery']['latest_data_period'])
        self.assertEqual('unknown',result['inei-districts']['status'])
        self.assertEqual('unknown',result['mininter-basic-stations']['status'])
        with self.connect() as db:
            db.execute("UPDATE monthly_reports SET month=12")
        result = {s['source_key']:s for s in report(date(2026,11,13))['sources']}
        self.assertEqual('invalid_future_period',result['sidpol-national']['status'])

    def expire(self, run):
        with self.connect() as db:
            db.execute("UPDATE ingestion_runs SET heartbeat_at=clock_timestamp()-interval '10 minutes',lease_expires_at=clock_timestamp()-interval '1 minute' WHERE run_id=%s", (run.id,))

    def test_expired_worker_cannot_commit_data_or_renew(self):
        with self.assertRaisesRegex(TrackingError, "lease expired"):
            with TrackingRun("statistics", ["sidpol-national"]) as run:
                self.expire(run)
                with self.assertRaises(TrackingError):
                    run.renew()
                with self.connect() as db:
                    db.execute("INSERT INTO monthly_reports VALUES(2026,1,'150101','T','T','T','T',1)")
                    run.complete(db,{"sidpol-national":{"status":"imported"}})
        with self.connect() as db:
            self.assertEqual(0,db.execute("SELECT count(*) FROM monthly_reports").fetchone()[0])
            self.assertEqual("running",db.execute("SELECT status FROM ingestion_runs WHERE run_id=%s",(run.id,)).fetchone()[0])
            self.assertIsNone(db.execute("SELECT outcome FROM ingestion_run_sources WHERE run_id=%s",(run.id,)).fetchone()[0])

    def test_reconcile_only_expired_leases_and_never_success_or_legacy(self):
        from ingestion.tracking import reconcile
        with TrackingRun("statistics", ["sidpol-national"]) as success:
            success.finish({"sidpol-national":{"status":"imported"}})
        self.expire(success)
        legacy = str(uuid.uuid4())
        with self.connect() as db:
            db.execute("INSERT INTO ingestion_runs(run_id,pipeline) VALUES(%s,'statistics')",(legacy,))
        with TrackingRun("statistics", ["sidpol-national"]) as live:
            with self.assertRaises(TrackingError):
                with TrackingRun("statistics", ["sidpol-national"]) as dead:
                    self.expire(dead)
                    self.assertEqual([dead.id], reconcile())
                    dead.finish({"sidpol-national":{"status":"imported"}})
            self.assertEqual([],reconcile())
            live.finish({"sidpol-national":{"status":"unchanged"}})
        with self.connect() as db:
            rows={str(row[0]):row[1:] for row in db.execute("SELECT run_id,status,error_type FROM ingestion_runs")}
            self.assertEqual(("succeeded",None),rows[success.id])
            self.assertEqual(("running",None),rows[legacy])
            self.assertEqual(("failed","LeaseExpired"),rows[dead.id])
            self.assertEqual("failed",db.execute("SELECT outcome FROM ingestion_run_sources WHERE run_id=%s",(dead.id,)).fetchone()[0])

    def test_background_heartbeat_renews_during_work_and_stops_on_exit(self):
        import threading
        renewed=threading.Event()
        with TrackingRun("statistics", ["sidpol-national"],lease_seconds=2,heartbeat_seconds=0.05) as run:
            original=run.renew
            def observe():
                original()
                renewed.set()
            with patch.object(run,"renew",side_effect=observe):
                self.assertTrue(renewed.wait(2),"background renewal must run during work")
            with self.connect() as db:
                self.assertTrue(db.execute("SELECT heartbeat_at>started_at AND lease_expires_at>clock_timestamp() FROM ingestion_runs WHERE run_id=%s",(run.id,)).fetchone()[0])
            run.finish({"sidpol-national":{"status":"unchanged"}})
        self.assertFalse(run._thread.is_alive())

    def test_missing_lease_migration_fails_before_job_starts(self):
        with self.connect() as db:
            db.execute("ALTER TABLE ingestion_runs DROP COLUMN lease_token CASCADE")
        with self.assertRaisesRegex(TrackingError,"002_ingestion_leases"):
            with TrackingRun("statistics",["sidpol-national"]):
                self.fail("job must not run without fencing")
        with self.connect() as db:
            self.assertEqual(0,db.execute("SELECT count(*) FROM ingestion_runs").fetchone()[0])

    def test_missing_migration_fails_before_any_job_data_is_written(self):
        with self.connect() as db:
            db.execute("DROP TABLE ingestion_run_sources")
            db.execute("DROP TABLE ingestion_runs")
        with self.assertRaisesRegex(TrackingError, "001_baseline"):
            with TrackingRun("statistics", ["sidpol-national"]):
                self.fail("A job must not execute without tracking tables")
        with self.connect() as db:
            self.assertEqual(
                0, db.execute("SELECT COUNT(*) FROM monthly_reports").fetchone()[0]
            )


class TrackingSafetyTests(unittest.TestCase):
    def test_concentration_failure_preserves_safe_migration_guidance(self):
        from ingestion.concentration import ConcentrationImportError, Source

        error = ConcentrationImportError(
            Source("test", "https://example.test", 2026, None),
            1,
            "extract",
            TrackingError(
                "Run python -m ingestion.migrate to initialize db/001_baseline.sql before running ingestion"
            ),
        )
        self.assertIn("001_baseline.sql", error.details["reason"])

    def test_database_configuration_error_is_sanitized(self):
        with patch(
            "ingestion.tracking._connect", side_effect=RuntimeError("password=SECRET")
        ):
            with self.assertRaises(TrackingError) as failure:
                with TrackingRun("statistics", ["sidpol-national"]):
                    pass
        self.assertNotIn("SECRET", str(failure.exception))
        self.assertIn("RuntimeError", str(failure.exception))
