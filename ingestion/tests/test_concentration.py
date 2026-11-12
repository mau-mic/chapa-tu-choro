"""Synthetic transport/geometry fixtures only; never bundled as official data."""
from ingestion.migrate import schema_sql

import os
from datetime import date
import unittest
from pathlib import Path
from unittest.mock import patch
from ingestion.concentration import (
    Source,
    BASE,
    select_sources,
    normalize,
    extract,
    load,
    run,
    main,
    SourceValidationError,
    ConcentrationImportError,
)

FIELDS = {
    k: k
    for k in [
        "objectid",
        "id_dgc",
        "año_hecho",
        "mes_hecho",
        "id_dist_hecho",
        "ubigeo_hecho_delito",
        "lat_hecho",
        "long_hecho",
        "id_modalidad_hecho",
        "estado_coord",
    ]
}
SOURCE = Source(
    "active-2026", BASE + "SIDPOL_DELITOS_TOTAL/FeatureServer/25", 2026, None
)
EXTORTION = Source(
    "archive-2025-extortion",
    BASE + "EXTORSION_IDSUBTIPO_10508/FeatureServer/1",
    2025,
    "extortion",
)


def fixture(oid=1, **updates):
    p = {
        "objectid": oid,
        "id_dgc": 10,
        "año_hecho": 2026,
        "mes_hecho": 1,
        "id_dist_hecho": "150101",
        "ubigeo_hecho_delito": 150101,
        "lat_hecho": -12.05,
        "long_hecho": -77.05,
        "id_modalidad_hecho": 1050201,
        "estado_coord": "CON COORDENADA",
    }
    p.update(updates)
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [-77.05, -12.05]},
        "properties": p,
    }


class ConcentrationTests(unittest.TestCase):
    def setUp(self):
        tracking_patch = patch('ingestion.concentration.TrackingRun')
        tracking = tracking_patch.start()
        tracking.return_value.__enter__.return_value.id = '11111111-1111-4111-8111-111111111111'
        self.addCleanup(tracking_patch.stop)

    def test_reviewed_extortion_archive_has_no_fabricated_business_identifier(self):
        fields = {k: v for k, v in FIELDS.items() if k != "id_dgc"}
        feature = fixture(año_hecho=2025, id_modalidad_hecho=1050803)
        del feature["properties"]["id_dgc"]
        row, reason, _ = normalize(feature, fields, EXTORTION, 1)
        self.assertEqual(1, row[0])
        self.assertIsNone(row[1])
        self.assertEqual(["extortion"], row[-1])
        self.assertIsNone(reason)
        # Schema drift in another archive, null IDs in a declared field, and
        # invalid OIDs remain failures rather than gaining this exception.
        with self.assertRaises(SourceValidationError):
            normalize(fixture(), fields, SOURCE, 1)
        with self.assertRaises(SourceValidationError):
            normalize(feature, FIELDS, EXTORTION, 1)
        with self.assertRaises(SourceValidationError):
            normalize(
                {**feature, "properties": {**feature["properties"], "objectid": None}},
                fields,
                EXTORTION,
                1,
            )

    def test_extortion_extraction_retains_pagination_and_other_schema_checks(self):
        fields = {k: v for k, v in FIELDS.items() if k != "id_dgc"}
        meta = {
            "geometryType": "esriGeometryPoint",
            "fields": [{"name": k} for k in fields],
        }
        features = [
            fixture(i, año_hecho=2025, id_modalidad_hecho=1050803) for i in (1, 2)
        ]
        for feature in features:
            del feature["properties"]["id_dgc"]
        responses = [
            meta,
            {"count": 2},
            {
                "type": "FeatureCollection",
                "features": [features[0]],
                "exceededTransferLimit": True,
            },
            {"type": "FeatureCollection", "features": [features[1]]},
            meta,
            {"count": 2},
        ]
        with patch("ingestion.concentration.request", side_effect=responses) as request:
            rows, _, quality = extract(EXTORTION, 1)
        self.assertEqual([None, None], [row[1] for row in rows])
        self.assertFalse(quality["distinctBusinessIdentifiersAvailable"])
        self.assertIsNone(quality["businessIdentifierField"])
        self.assertNotIn(
            "id_dgc", request.call_args_list[2].args[1]["outFields"].split(",")
        )
        responses[3] = {"type": "FeatureCollection", "features": [features[0]]}
        with patch(
            "ingestion.concentration.request", side_effect=responses
        ), self.assertRaisesRegex(SourceValidationError, "Repeated row ID"):
            extract(EXTORTION, 1)
        meta["fields"] = [f for f in meta["fields"] if f["name"] != "mes_hecho"]
        with patch(
            "ingestion.concentration.request", return_value=meta
        ), self.assertRaisesRegex(SourceValidationError, "mes_hecho"):
            extract(EXTORTION, 1)

    def test_failure_context_is_actionable_and_does_not_expose_exception_data(self):
        with patch(
            "ingestion.concentration.extract",
            side_effect=SourceValidationError(
                "Source field schema changed; missing: id_dgc"
            ),
        ), self.assertRaises(ConcentrationImportError) as caught:
            run(2025, 1, "extortion", today=date(2026,11,13))
        self.assertEqual("archive-2025-extortion", caught.exception.details["source"])
        self.assertEqual(1, caught.exception.details["month"])
        self.assertEqual("extract", caught.exception.details["stage"])
        self.assertIn("id_dgc", caught.exception.details["reason"])
        with patch(
            "ingestion.concentration.extract", return_value=([], "a" * 64, {})
        ), patch(
            "ingestion.concentration.load",
            side_effect=RuntimeError("secret database details"),
        ), self.assertRaises(
            ConcentrationImportError
        ) as caught:
            run(2025, 1, "extortion", today=date(2026,11,13))
        self.assertEqual("load", caught.exception.details["stage"])
        self.assertNotIn("secret", str(caught.exception))

    def test_cli_prints_safe_failure_details_and_exits_nonzero(self):
        import contextlib
        import io
        import json

        error = ConcentrationImportError(
            EXTORTION,
            1,
            "extract",
            SourceValidationError("Source field schema changed"),
        )
        stderr = io.StringIO()
        with patch("sys.argv", ["concentration", "--year", "2025"]), patch(
            "ingestion.concentration.run", side_effect=error
        ), contextlib.redirect_stderr(stderr), self.assertRaises(SystemExit) as caught:
            main()
        self.assertEqual(1, caught.exception.code)
        self.assertEqual(error.details, json.loads(stderr.getvalue()))

    def test_one_authoritative_source_and_no_2025_combined_total(self):
        self.assertEqual(["active-2026"], [s.key for s in select_sources(2026, today=date(2026, 11, 13))])
        self.assertEqual(
            {"archive-2025-" + s.category for s in select_sources(2025, today=date(2026, 11, 13))},
            {s.key for s in select_sources(2025, today=date(2026, 11, 13))},
        )
        with self.assertRaises(ValueError):
            select_sources(2025, "all", today=date(2026, 11, 13))
        with self.assertRaises(ValueError):
            select_sources(2024, today=date(2026, 11, 13))

    def test_calendar_rollover_requires_reviewed_registry_and_window(self):
        self.assertEqual(["active-2026"],[s.key for s in select_sources(2026,today=date(2027,1,1))])
        for year, today in [(2025,date(2027,1,1)),(2027,date(2027,1,1)),(2026,date(2028,1,1))]:
            with self.subTest(year=year,today=today),self.assertRaises(SourceValidationError):
                select_sources(year,today=today)

    def test_classifications_do_not_duplicate_all_row(self):
        row, reason, _ = normalize(fixture(), FIELDS, SOURCE, 1)
        self.assertEqual(["all", "robbery"], row[-1])
        self.assertIsNone(reason)

    def test_unlocated_geometry_is_not_a_valid_location(self):
        row, reason, _ = normalize(
            fixture(estado_coord="SIN COORDENADA"), FIELDS, SOURCE, 1
        )
        self.assertFalse(row[5])
        self.assertEqual("unlocated_or_unknown_status", reason)

    def test_mismatched_ubigeo_and_geometry_are_reported(self):
        _, reason, _ = normalize(fixture(ubigeo_hecho_delito=40101), FIELDS, SOURCE, 1)
        self.assertEqual("invalid_ubigeo", reason)
        _, reason, _ = normalize(fixture(lat_hecho=-13), FIELDS, SOURCE, 1)
        self.assertEqual("coordinate_mismatch", reason)

    def test_wrong_period_fails_instead_of_relabeling(self):
        with self.assertRaises(ValueError):
            normalize(fixture(año_hecho=2025), FIELDS, SOURCE, 1)

    def test_pagination_and_repeat_id_are_fail_closed(self):
        meta = {
            "geometryType": "esriGeometryPoint",
            "fields": [{"name": k} for k in FIELDS],
            "editingInfo": {"dataLastEditDate": 1},
        }
        response = [
            meta,
            {"count": 2},
            {
                "type": "FeatureCollection",
                "features": [fixture()],
                "properties": {"exceededTransferLimit": True},
            },
            {"type": "FeatureCollection", "features": [fixture(2)]},
            meta,
            {"count": 2},
        ]
        with patch("ingestion.concentration.request", side_effect=response) as request:
            rows, _, _ = extract(SOURCE, 1)
            self.assertEqual(2, len(rows))
            self.assertEqual(1, request.call_args_list[3].args[1]["resultOffset"])
        response[3] = {"type": "FeatureCollection", "features": [fixture()]}
        with patch(
            "ingestion.concentration.request", side_effect=response
        ), self.assertRaises(ValueError):
            extract(SOURCE, 1)

    def test_truncation_and_source_changes_never_load(self):
        meta = {
            "geometryType": "esriGeometryPoint",
            "fields": [{"name": k} for k in FIELDS],
        }
        with patch(
            "ingestion.concentration.request",
            side_effect=[
                meta,
                {"count": 2},
                {"type": "FeatureCollection", "features": [fixture()]},
                meta,
                {"count": 2},
            ],
        ), self.assertRaises(ValueError):
            extract(SOURCE, 1)

    def test_lambda_dispatch_is_scoped_and_ignores_event_urls(self):
        from ingestion.lambda_handler import handler

        with patch.dict(
            os.environ,
            {
                "INGESTION_DATASET": "concentration",
                "CONCENTRATION_YEAR": "2025",
                "CONCENTRATION_MONTH": "9",
                "CONCENTRATION_CATEGORY": "robbery",
            },
        ), patch("ingestion.concentration.run", return_value={"results": []}) as run:
            self.assertEqual(
                {"results": []}, handler({"url": "https://untrusted.test"}, None)
            )
        run.assert_called_once_with(2025, 9, "robbery")

    def test_archive_category_codes_are_explicit_not_inferred_from_titles(self):
        archive = Source(
            "archive-2025-robbery",
            BASE + "ROBO_IDSUBTIPO_10502/FeatureServer/3",
            2025,
            "robbery",
        )
        row, reason, _ = normalize(
            fixture(año_hecho=2025, id_modalidad_hecho=999), FIELDS, archive, 1
        )
        self.assertEqual([], row[-1])
        self.assertFalse(row[5])
        self.assertEqual("outside_category_predicate", reason)

    def test_archive_has_single_category_even_if_ids_overlap(self):
        archive = Source(
            "archive-2025-robbery",
            BASE + "ROBO_IDSUBTIPO_10502/FeatureServer/3",
            2025,
            "robbery",
        )
        row, _, _ = normalize(fixture(año_hecho=2025), FIELDS, archive, 1)
        self.assertEqual(["robbery"], row[-1])


@unittest.skipUnless(os.getenv("CTC_TEST_DATABASE_URL"), "Requires disposable PostGIS")
class ConcentrationDatabaseTests(unittest.TestCase):
    def test_atomic_idempotent_aggregation_and_geometry_rejection(self):
        import uuid
        import psycopg

        uri = os.environ["CTC_TEST_DATABASE_URL"]
        schema = "density_test_" + uuid.uuid4().hex
        with psycopg.connect(uri) as admin:
            admin.execute("CREATE SCHEMA " + schema)
            admin.commit()
            try:
                with psycopg.connect(
                    uri, options=f"-c search_path={schema},public,extensions"
                ) as connection:
                    sql = (
                        schema_sql()
                        .replace(
                            "SET search_path TO public, extensions;",
                            f"SET search_path TO {schema},public,extensions;",
                        )
                    )
                    connection.execute(sql)
                    connection.execute(
                        "INSERT INTO district_boundaries VALUES('150101','TEST',ST_Multi(ST_GeomFromText('POLYGON((-77.1 -12.1,-77 -12.1,-77 -12,-77.1 -12,-77.1 -12.1))',4326)))"
                    )

                def connect():
                    return psycopg.connect(
                        uri, options=f"-c search_path={schema},public,extensions"
                    )

                rows = [
                    normalize(fixture(i), FIELDS, SOURCE, 1)[0] for i in range(1, 7)
                ]
                rows.append((7, 10, "150101", -75, -10, True, ["all", "robbery"]))
                with patch("ingestion.concentration.connect", connect):
                    result = load(SOURCE, 1, (rows, "a" * 64, {}))
                    self.assertEqual(6, result["mappedRows"])
                    self.assertEqual(1, result["quality"]["outsideDeclaredDistrict"])
                    self.assertEqual(
                        "unchanged", load(SOURCE, 1, (rows, "a" * 64, {}))["status"]
                    )
                    load(SOURCE, 1, (rows[:5], "b" * 64, {}))
                    broken = [(*rows[0][:-1], ["unregistered-category"])]
                    with self.assertRaises(psycopg.Error):
                        load(SOURCE, 1, (broken, "c" * 64, {}))
                with connect() as c:
                    self.assertEqual(
                        [(5,)],
                        c.execute(
                            "SELECT SUM(records) FROM concentration_cells WHERE category='all'"
                        ).fetchall(),
                    )
                    self.assertEqual(
                        1,
                        c.execute(
                            "SELECT COUNT(*) FROM concentration_imports"
                        ).fetchone()[0],
                    )
                    self.assertEqual(
                        0,
                        c.execute("SELECT COUNT(*) FROM monthly_reports").fetchone()[0],
                    )
                    self.assertEqual(
                        (1, 5),
                        c.execute(
                            "SELECT COUNT(*),SUM(records) FROM concentration_locations WHERE category='all'"
                        ).fetchone(),
                    )
                    self.assertTrue(
                        c.execute(
                            "SELECT relrowsecurity FROM pg_class WHERE oid='concentration_locations'::regclass"
                        ).fetchone()[0]
                    )
                    columns = {
                        r[0]
                        for r in c.execute(
                            "SELECT column_name FROM information_schema.columns WHERE table_schema=%s AND table_name='concentration_locations'",
                            (schema,),
                        )
                    }
                    self.assertFalse(
                        columns & {"oid", "business", "id_dgc", "direccion_hecho"}
                    )
                    # Simulate the previous schema and verify the upgrade preserves
                    # existing imports while allowing an unavailable audit count.
                    c.execute(
                        "ALTER TABLE concentration_imports ALTER COLUMN distinct_source_ids SET NOT NULL"
                    )
                    migration = (
                        Path("db/archive/003_concentration.sql")
                        .read_text()
                        .replace(
                            "SET search_path TO public, extensions;",
                            f"SET search_path TO {schema},public,extensions;",
                        )
                    )
                    c.execute(migration)
                    c.execute(migration)
                missing_ids = [
                    normalize(
                        fixture(i, año_hecho=2025, id_modalidad_hecho=1050803),
                        {k: v for k, v in FIELDS.items() if k != "id_dgc"},
                        EXTORTION,
                        1,
                    )[0]
                    for i in range(1, 7)
                ]
                with patch("ingestion.concentration.connect", connect):
                    self.assertEqual(
                        6, load(EXTORTION, 1, (missing_ids, "d" * 64, {}))["mappedRows"]
                    )
                    self.assertEqual(
                        "unchanged",
                        load(EXTORTION, 1, (missing_ids, "d" * 64, {}))["status"],
                    )
                with connect() as c:
                    self.assertEqual(
                        (6, None),
                        c.execute(
                            "SELECT source_rows,distinct_source_ids FROM concentration_imports WHERE source_key='archive-2025-extortion'"
                        ).fetchone(),
                    )
                    self.assertEqual(
                        5,
                        c.execute(
                            "SELECT SUM(records) FROM concentration_cells WHERE category='all'"
                        ).fetchone()[0],
                    )
            finally:
                admin.execute("DROP SCHEMA " + schema + " CASCADE")
