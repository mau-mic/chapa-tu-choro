"""Synthetic workbook fixtures; no invented records are used by the app."""

import os
import tempfile
import unittest
import uuid
from pathlib import Path

from openpyxl import Workbook

from ingestion.population import import_population, read_population


class PopulationWorkbookTests(unittest.TestCase):
    def test_cli_failure_does_not_disclose_database_exception_details(self):
        from contextlib import redirect_stderr
        from io import StringIO
        from unittest.mock import patch

        from ingestion.population import main

        output = StringIO()
        with (
            patch("sys.argv", ["population", "unused.xlsx", "--check-only"]),
            patch(
                "ingestion.population.read_population",
                side_effect=RuntimeError("secret-dsn"),
            ),
            redirect_stderr(output),
            self.assertRaises(SystemExit) as error,
        ):
            main()
        self.assertEqual(1, error.exception.code)
        self.assertNotIn("secret-dsn", output.getvalue())
        self.assertIn("RuntimeError", output.getvalue())

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "population.xlsx"

    def write(self, rows):
        book = Workbook()
        sheet = book.active
        sheet.title = "POB. PROYECTADA 2018-2026"
        sheet.append(["CUADRO Nº 01"])
        sheet.append(["PERÚ: POBLACIÓN TOTAL PROYECTADA AL 30 DE JUNIO DE CADA AÑO"])
        sheet.append(["Información de carácter referencial"])
        sheet.append(
            ["UBIGEO", "Departamento, provincia y distrito", "Población proyectada 1/"]
        )
        sheet.append([None, None, *range(2018, 2027)])
        sheet.append([])
        for code, name, values in rows:
            sheet.append([code, name, *values])
        book.save(self.path)
        book.close()

    def fixture(self):
        return [
            ("000000", "PERÚ", [100] * 9),
            ("150000", "LIMA", [100] * 9),
            ("150100", "LIMA", [100] * 9),
            ("150101", "LIMA", [100] * 9),
        ]

    def test_preserves_codes_years_and_unavailable_districts(self):
        rows = self.fixture()
        rows.append(
            ("150102", "NEW DISTRICT 2/", ["Distrito creado en 2025"] * 7 + [5, 6])
        )
        for index in range(3):
            rows[index][2][-2:] = [105, 106]
        self.write(rows)
        result = read_population(self.path)
        self.assertEqual(45, len(result))
        self.assertEqual(
            ("150102", 2018, None),
            (result[-9].ubigeo, result[-9].year, result[-9].people),
        )
        self.assertEqual(6, result[-1].people)
        self.assertEqual("NEW DISTRICT", result[-1].name)
        self.assertEqual("Distrito creado en 2025", result[-9].note)

    def test_rejects_duplicate_codes(self):
        rows = self.fixture()
        self.write(rows + [rows[-1]])
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            read_population(self.path)

    def test_rejects_inconsistent_totals(self):
        rows = self.fixture()
        rows[-1][2][0] = 99
        self.write(rows)
        with self.assertRaisesRegex(ValueError, "total"):
            read_population(self.path)

    def test_rejects_arbitrary_text_and_zero_or_fractional_population(self):
        for bad in ["unknown", 0, -1, 1.5, "=1+1"]:
            with self.subTest(value=bad):
                rows = self.fixture()
                rows[-1][2][0] = bad
                self.write(rows)
                with self.assertRaises(ValueError):
                    read_population(self.path)

    def test_rejects_missing_parent_and_wrong_years(self):
        self.write(self.fixture()[1:])
        with self.assertRaisesRegex(ValueError, "national"):
            read_population(self.path)

        self.write(self.fixture())
        from openpyxl import load_workbook

        book = load_workbook(self.path)
        book.active["C5"] = 2017
        book.save(self.path)
        book.close()
        with self.assertRaisesRegex(ValueError, "years"):
            read_population(self.path)

    @unittest.skipUnless(
        os.getenv("CTC_TEST_DATABASE_URL"), "Requires isolated PostGIS"
    )
    def test_import_is_atomic_versioned_idempotent_and_reports_unmatched(self):
        import psycopg
        from psycopg import sql

        from ingestion.migrate import schema_sql

        schema = "population_test_" + uuid.uuid4().hex
        with psycopg.connect(
            os.environ["CTC_TEST_DATABASE_URL"], autocommit=True
        ) as admin:
            admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
            try:
                admin.execute(schema_sql(schema))
                with psycopg.connect(
                    os.environ["CTC_TEST_DATABASE_URL"],
                    options=f"-c search_path={schema},public,extensions",
                ) as db:
                    db.execute(
                        "INSERT INTO monthly_reports VALUES(2025,1,'070101','T','T','T','T',3)"
                    )
                    db.commit()
                    self.write(self.fixture())
                    original = self.path.read_bytes()
                    first = import_population(self.path, connection=db)
                    self.assertEqual("imported", first["status"])
                    self.assertEqual(1, first["unmatched_districts"])
                    self.assertEqual(
                        1, first["report_district_years_without_population"]
                    )
                    self.assertEqual(
                        "skipped", import_population(self.path, connection=db)["status"]
                    )
                    self.assertEqual(
                        36,
                        db.execute(
                            "SELECT count(*) FROM population_observations"
                        ).fetchall()[0][0],
                    )
                    db.commit()
                    rows = self.fixture()
                    for row in rows:
                        row[2][0] = 101
                    self.write(rows)
                    second = import_population(self.path, connection=db)
                    self.assertNotEqual(first["sha256"], second["sha256"])
                    self.path.write_bytes(original)
                    self.assertEqual(
                        "skipped", import_population(self.path, connection=db)["status"]
                    )
                    self.assertEqual(
                        second["sha256"],
                        db.execute(
                            "SELECT sha256 FROM population_releases WHERE active"
                        ).fetchall()[0][0],
                    )
                    self.assertEqual(
                        (2, 72),
                        (
                            db.execute(
                                "SELECT count(*) FROM population_releases"
                            ).fetchall()[0][0],
                            db.execute(
                                "SELECT count(*) FROM population_observations"
                            ).fetchall()[0][0],
                        ),
                    )
                    self.assertTrue(
                        db.execute(
                            "SELECT relrowsecurity FROM pg_class WHERE oid='population_observations'::regclass"
                        ).fetchall()[0][0]
                    )
                    rows[-1][2][0] = 0
                    self.write(rows)
                    with self.assertRaises(ValueError):
                        import_population(self.path, connection=db)
                    self.assertEqual(
                        second["sha256"],
                        db.execute(
                            "SELECT sha256 FROM population_releases WHERE active"
                        ).fetchall()[0][0],
                    )
            finally:
                admin.execute(
                    sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema))
                )
