"""Real PostGIS tests use disposable schemas; only synthetic test fixtures are inserted."""
from ingestion.migrate import schema_sql
import json
import os
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch
from ingestion.import_districts import import_geojson
from ingestion.import_sidpol import import_file
from ingestion.tests.test_parsing import HEADER


@unittest.skipUnless(os.getenv('CTC_TEST_DATABASE_URL'), 'Set CTC_TEST_DATABASE_URL for PostGIS integration tests')
class PostgisImportTests(unittest.TestCase):
    def setUp(self):
        import psycopg
        self.psycopg = psycopg
        tracking_patch=patch('ingestion.tracking._connect',self.connect)
        tracking_patch.start()
        self.addCleanup(tracking_patch.stop)
        self.url = os.environ['CTC_TEST_DATABASE_URL']
        self.schema = 'ctc_test_' + uuid.uuid4().hex
        self.tmp = tempfile.TemporaryDirectory()
        self.csv = Path(self.tmp.name) / 'fixture.csv'
        self.geo = Path(self.tmp.name) / 'fixture.geojson'
        with psycopg.connect(self.url, autocommit=True) as conn:
            conn.execute('CREATE EXTENSION IF NOT EXISTS postgis SCHEMA public')
            conn.execute(f'CREATE SCHEMA {self.schema}')
            sql = schema_sql().replace('SET search_path TO public, extensions;', f'SET search_path TO {self.schema}, public, extensions;')
            conn.execute(sql)

    def connect(self):
        return self.psycopg.connect(self.url, options=f'-c search_path={self.schema},public,extensions')

    def tearDown(self):
        with self.psycopg.connect(self.url, autocommit=True) as conn:
            conn.execute(f'DROP SCHEMA {self.schema} CASCADE')
        self.tmp.cleanup()

    def test_imports_are_idempotent_and_counts_match_input(self):
        self.geo.write_text(json.dumps({'type': 'FeatureCollection', 'features': [{
            'type': 'Feature', 'properties': {'UBIGEO': '150101', 'NOMBDIST': 'TEST'},
            'geometry': {'type': 'Polygon', 'coordinates': [[[-77,-12],[-77.1,-12],[-77.1,-12.1],[-77,-12]]]}
        }]}))
        self.csv.write_text(HEADER + '2024,1,TEST,TEST,TEST,150101,TEST,3\n' + '2024,1,TEST,TEST,TEST,150101,TEST,4\n' + '2024,1,TEST,TEST,TEST,070101,TEST,2\n')
        with patch('ingestion.import_sidpol.connect', self.connect), patch('ingestion.import_districts.connect', self.connect):
            self.assertEqual(1, import_geojson(self.geo)['districts_imported'])
            import_geojson(self.geo)
            result = import_file(self.csv)
            self.assertEqual(3, result['selected_rows'])
            self.assertEqual(1, result['unmatched_districts'])
            self.assertEqual('skipped', import_file(self.csv)['status'])
            with self.connect() as conn:
                self.assertEqual((2, 9), conn.execute('SELECT COUNT(*),SUM(reports) FROM monthly_reports').fetchone())
                self.assertEqual(2, conn.execute('SELECT COUNT(*) FROM import_runs').fetchone()[0])
            original_bytes = self.csv.read_bytes()
            # A revised count replaces the existing key; it is not added a second time.
            self.csv.write_text(HEADER + '2024,1,TEST,TEST,TEST,150101,TEST,5\n')
            import_file(self.csv)
            with self.connect() as conn:
                self.assertEqual(7, conn.execute('SELECT SUM(reports) FROM monthly_reports').fetchone()[0])
                self.assertEqual([('070101',2),('150101',5)],conn.execute('SELECT ubigeo,reports FROM monthly_reports ORDER BY ubigeo').fetchall())
                self.assertEqual(2,conn.execute("SELECT count(*) FROM import_runs WHERE source_kind='sidpol-national'").fetchone()[0])
            self.csv.write_bytes(original_bytes)
            self.assertEqual('skipped',import_file(self.csv)['status'])
            with self.connect() as conn:
                self.assertEqual(5,conn.execute("SELECT reports FROM monthly_reports WHERE ubigeo='150101'").fetchone()[0])

    def test_conflicting_geographic_names_roll_back_the_whole_import(self):
        self.csv.write_text(HEADER + '2024,1,TEST,TEST,ONE,150101,TEST,3\n' + '2024,1,TEST,TEST,TWO,150101,TEST,4\n')
        with patch('ingestion.import_sidpol.connect', self.connect):
            with self.assertRaisesRegex(ValueError, 'Conflicting geographic names'):
                import_file(self.csv)
        with self.connect() as conn:
            self.assertEqual(0, conn.execute('SELECT COUNT(*) FROM monthly_reports').fetchone()[0])
            self.assertEqual(0, conn.execute('SELECT COUNT(*) FROM import_runs').fetchone()[0])

    def test_complete_etl_is_idempotent_against_real_postgis(self):
        from ingestion.etl import EtlSettings, run_etl
        from ingestion.tests.test_etl import fixture_fetch
        with patch('ingestion.download_official.fetch', fixture_fetch), patch('ingestion.etl.connect', self.connect):
            first = run_etl(EtlSettings(Path(self.tmp.name) / 'etl'))
            second = run_etl(EtlSettings(Path(self.tmp.name) / 'etl'))
        self.assertEqual('succeeded', first['status'])
        self.assertEqual('skipped', second['load']['statistics']['status'])
        with self.connect() as conn:
            self.assertEqual((1, 7), conn.execute('SELECT COUNT(*), SUM(reports) FROM monthly_reports').fetchone())
            self.assertEqual(1, conn.execute('SELECT COUNT(*) FROM district_boundaries').fetchone()[0])
            self.assertEqual(3, conn.execute('SELECT COUNT(*) FROM import_runs').fetchone()[0])
            self.assertTrue(all(row[0].startswith('https://') for row in conn.execute('SELECT source_name FROM import_runs')))

    def test_etl_report_load_failure_rolls_back_boundaries_and_both_audits(self):
        from ingestion.etl import EtlError, EtlSettings, run_etl
        from ingestion.tests.test_etl import fixture_fetch
        def overflowing_fetch(url, destination, **kwargs):
            result = fixture_fetch(url, destination, **kwargs)
            if url.endswith('.csv'):
                # Each source count is valid; aggregation exceeds the SQL integer column.
                destination.write_text(HEADER + '2024,1,TEST,TEST,TEST,150101,TEST,2147483647\n' * 2)
            return result
        with patch('ingestion.download_official.fetch', overflowing_fetch), patch('ingestion.etl.connect', self.connect):
            with self.assertRaises(EtlError) as failure:
                run_etl(EtlSettings(Path(self.tmp.name) / 'etl'))
        self.assertEqual('load', failure.exception.stage)
        with self.connect() as conn:
            for table in ('monthly_reports', 'district_boundaries', 'import_runs'):
                self.assertEqual(0, conn.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0])

    def test_national_import_does_not_skip_a_previous_lima_only_checksum(self):
        from ingestion.import_sidpol import sha256_file
        self.csv.write_text(HEADER + '2024,1,TEST,TEST,TEST,040101,TEST,9\n')
        with self.connect() as conn:
            conn.execute("INSERT INTO import_runs(source_kind,source_name,sha256,selected_rows) VALUES ('sidpol','OLD LIMA SCOPE',%s,0)", (sha256_file(self.csv),))
        with patch('ingestion.import_sidpol.connect', self.connect):
            result = import_file(self.csv)
        self.assertEqual('imported', result['status'])
        with self.connect() as conn:
            self.assertEqual(9, conn.execute("SELECT reports FROM monthly_reports WHERE ubigeo='040101'").fetchone()[0])

    def test_province_label_variations_preserve_counts_under_the_same_ubigeo(self):
        self.csv.write_text(HEADER + '2024,1,TEST,PROVINCE ONE,TEST,160801,TEST,3\n'
                             + '2024,1,TEST,PROVINCE TWO,TEST,160801,TEST,4\n')
        with patch('ingestion.import_sidpol.connect', self.connect):
            import_file(self.csv)
        with self.connect() as conn:
            self.assertEqual((1, 7), conn.execute('SELECT COUNT(*),SUM(reports) FROM monthly_reports').fetchone())

    def test_invalid_polygon_topology_is_rejected_without_audit_or_boundary_writes(self):
        self.geo.write_text(json.dumps({'type': 'FeatureCollection', 'features': [{
            'type': 'Feature', 'properties': {'UBIGEO': '040101', 'NOMBDIST': 'TEST'},
            'geometry': {'type': 'Polygon', 'coordinates': [[[-77,-12],[-76,-11],[-77,-11],[-76,-12],[-77,-12]]]}
        }]}))
        with patch('ingestion.import_districts.connect', self.connect):
            with self.assertRaisesRegex(ValueError, 'Invalid or empty district geometry'):
                import_geojson(self.geo)
        with self.connect() as conn:
            self.assertEqual(0, conn.execute('SELECT COUNT(*) FROM district_boundaries').fetchone()[0])
            self.assertEqual(0, conn.execute('SELECT COUNT(*) FROM import_runs').fetchone()[0])
