"""Validate and import the supplied INEI 2018–2026 projection workbook.

No network discovery or census rebasing is inferred. Original bytes are unchanged.
"""

import argparse
import hashlib
import json
import re
from contextlib import nullcontext
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from zipfile import BadZipFile

from openpyxl import load_workbook
from psycopg import Connection
from psycopg import Error as DatabaseError

from .common import connect
from .tracking import TrackingRun

SOURCE = "https://www.gob.pe/institucion/inei/informes-publicaciones/6894980-peru-poblacion-total-proyectada-al-30-de-junio-de-cada-ano-segun-departamento-provincia-y-distrito-2018-2025"
YEARS = tuple(range(2018, 2027))


@dataclass(frozen=True)
class PopulationObservation:
    ubigeo: str
    name: str
    year: int
    people: int | None
    note: str = ""


def read_population(path: Path) -> list[PopulationObservation]:
    return _read_population(path.read_bytes())


def _read_population(content: bytes) -> list[PopulationObservation]:
    # Read formulas as formulas: an external or uncached formula must fail validation.
    book = load_workbook(
        BytesIO(content), read_only=True, data_only=False, keep_links=False
    )
    try:
        if book.sheetnames != ["POB. PROYECTADA 2018-2026"]:
            raise ValueError("Unexpected population workbook sheets")
        rows = iter(book.worksheets[0].iter_rows(values_only=True))
        headers = [next(rows) for _ in range(5)]
        if headers[3][0] != "UBIGEO" or tuple(headers[4][2:11]) != YEARS:
            raise ValueError("Unexpected population headers or years")
        records: list[PopulationObservation] = []
        seen: set[str] = set()
        for row in rows:
            raw = row[0] if row else None
            if raw is None or not re.fullmatch(r"\d{6}", str(raw)):
                # Official notes/titles begin outside the data range; malformed data
                # rows are not silently discarded if they contain year observations.
                if len(row) >= 11 and any(v is not None for v in row[2:11]):
                    raise ValueError("Invalid population UBIGEO")
                continue
            code = str(raw)
            if code in seen:
                raise ValueError("Duplicate population UBIGEO")
            seen.add(code)
            if (
                code[:2] == "00"
                and code != "000000"
                or code[2:4] == "00"
                and code[4:] != "00"
            ):
                raise ValueError("Invalid population hierarchy code")
            name = re.sub(r"\s+\d+/(?:\s*\d+/)*\s*$", "", str(row[1] or "")).strip()
            if not name:
                raise ValueError("Missing population geographic name")
            for year, value in zip(YEARS, row[2:11], strict=True):
                note = ""
                if isinstance(value, str) and re.fullmatch(
                    r"Distrito creado en 20\d{2}", value.strip()
                ):
                    if code.endswith("00") or year > int(value.strip()[-4:]):
                        raise ValueError("Unavailable parent population")
                    people = None
                    note = value.strip()
                elif (
                    isinstance(value, (int, float))
                    and not isinstance(value, bool)
                    and value > 0
                    and value == int(value)
                ):
                    people = int(value)
                    if people > 9223372036854775807:
                        raise ValueError("Population exceeds bigint range")
                else:
                    raise ValueError(f"Invalid population for {code}/{year}")
                records.append(PopulationObservation(code, name, year, people, note))
        if "000000" not in seen:
            raise ValueError("Missing national population")
        by_key = {(r.ubigeo, r.year): r for r in records}
        for year in YEARS:
            totals: dict[str, int] = {}
            for record in records:
                if record.year != year or record.ubigeo.endswith("00"):
                    continue
                for parent in (
                    "000000",
                    record.ubigeo[:2] + "0000",
                    record.ubigeo[:4] + "00",
                ):
                    if parent not in seen:
                        raise ValueError("Missing population parent")
                    totals[parent] = totals.get(parent, 0) + (record.people or 0)
            for code in seen:
                if code.endswith("00") and by_key[code, year].people != totals.get(
                    code, 0
                ):
                    raise ValueError(f"Inconsistent population total for {code}/{year}")
        return records
    finally:
        book.close()


def import_population(path: Path, *, connection: Connection | None = None) -> dict:
    content = path.read_bytes()
    records = _read_population(content)
    digest = hashlib.sha256(content).hexdigest()
    report = {
        "sha256": digest,
        "scanned_rows": len(records),
        "selected_rows": len(records),
        "rejected_rows": 0,
        "unavailable_values": sum(r.people is None for r in records),
    }
    with (
        nullcontext(connection) if connection is not None else connect() as db,
        db.transaction(),
    ):
        db.execute("SET LOCAL statement_timeout='60s'")
        db.execute("SET LOCAL lock_timeout='15s'")
        db.execute("SELECT pg_advisory_xact_lock(17294003)")
        if db.execute(
            "SELECT 1 FROM population_releases WHERE sha256=%s", (digest,)
        ).fetchone():
            # Replaying an old release cannot reactivate it over a newer version.
            return {**report, "status": "skipped", "selected_rows": 0}
        db.execute(
            "INSERT INTO population_releases(sha256,source_url) VALUES(%s,%s)",
            (digest, SOURCE),
        )
        # COPY FROM cannot target an RLS-protected table as a restricted role.
        # Stage the bulk input, then insert through the normal grants/policies.
        db.execute(
            "CREATE TEMP TABLE population_staging (LIKE population_observations) ON COMMIT DROP"
        )
        with (
            db.cursor() as cursor,
            cursor.copy(
                "COPY population_staging(release_sha256,year,ubigeo,name,people,note) FROM STDIN"
            ) as copy,
        ):
            for record in records:
                copy.write_row(
                    (
                        digest,
                        record.year,
                        record.ubigeo,
                        record.name,
                        record.people,
                        record.note,
                    )
                )
        db.execute(
            """INSERT INTO population_observations(release_sha256,year,ubigeo,name,people,note)
               SELECT release_sha256,year,ubigeo,name,people,note FROM population_staging"""
        )
        # A caller may import another release before its outer transaction commits.
        db.execute("DROP TABLE pg_temp.population_staging")
        unmatched = db.execute(
            """SELECT count(DISTINCT p.ubigeo) FROM population_observations p
                LEFT JOIN district_boundaries d ON d.ubigeo=p.ubigeo
                WHERE p.release_sha256=%s AND right(p.ubigeo,2)<>'00' AND d.ubigeo IS NULL""",
            (digest,),
        ).fetchone()
        reports_unmatched = db.execute(
            """SELECT count(DISTINCT (r.year,r.ubigeo)) FROM monthly_reports r
                LEFT JOIN population_observations p ON p.release_sha256=%s AND p.year=r.year AND p.ubigeo=r.ubigeo
                WHERE p.people IS NULL""",
            (digest,),
        ).fetchone()
        db.execute("UPDATE population_releases SET active=false WHERE active")
        db.execute(
            "UPDATE population_releases SET active=true WHERE sha256=%s", (digest,)
        )
        return {
            **report,
            "status": "imported",
            "unmatched_districts": unmatched[0] if unmatched else 0,
            "report_district_years_without_population": reports_unmatched[0]
            if reports_unmatched
            else 0,
        }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    try:
        if args.check_only:
            records = read_population(args.path)
            print(
                json.dumps(
                    {
                        "observations": len(records),
                        "unavailable_values": sum(r.people is None for r in records),
                        "years": YEARS,
                    }
                )
            )
            return
        with TrackingRun("manual", ["inei-population"]) as tracking:
            tracking.stage("transform")
            read_population(args.path)
            tracking.stage("load")
            with connect() as db, db.transaction():
                result = import_population(args.path, connection=db)
                tracking.complete(db, {"inei-population": result})
            print(json.dumps(result))
    except (ValueError, OSError, RuntimeError, DatabaseError, BadZipFile) as error:
        parser.exit(
            1,
            json.dumps(
                {
                    "status": "failed",
                    "error_type": type(error).__name__,
                    "detail": str(error)
                    if isinstance(error, ValueError)
                    else "Check the workbook path, database configuration and ingestion tracking history.",
                }
            )
            + "\n",
        )


if __name__ == "__main__":
    main()
