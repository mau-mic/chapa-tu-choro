"""Static publication uses aggregate fixtures; no official data or incidents are fabricated."""
import contextlib
import io
import json
import os
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from ingestion.export_statistics import ExportError, main, snapshot, write_snapshot


class ExportSafetyTests(unittest.TestCase):
    def test_failed_export_preserves_previous_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'statistics.json'
            path.write_text('previous edition')
            with patch('ingestion.export_statistics.snapshot', side_effect=ExportError('No imported statistics')):
                with self.assertRaises(ExportError):
                    write_snapshot(path)
            self.assertEqual('previous edition', path.read_text())
            self.assertEqual([path], list(Path(directory).iterdir()))

    def test_cli_does_not_print_database_credentials(self):
        output = io.StringIO()
        with patch('sys.argv', ['export']), patch('ingestion.export_statistics.connect', side_effect=RuntimeError('password=SECRET')), contextlib.redirect_stderr(output):
            with self.assertRaises(SystemExit) as failure:
                main()
        self.assertEqual(1, failure.exception.code)
        self.assertNotIn('SECRET', output.getvalue())
        self.assertIn('RuntimeError', output.getvalue())


@unittest.skipUnless(os.getenv('CTC_TEST_DATABASE_URL'), 'Requires isolated PostGIS')
class ExportDatabaseTests(unittest.TestCase):
    def setUp(self):
        import psycopg
        self.psycopg = psycopg
        self.url = os.environ['CTC_TEST_DATABASE_URL']
        self.schema = 'seo_' + uuid.uuid4().hex
        self.role = 'seo_reader_' + uuid.uuid4().hex
        with psycopg.connect(self.url) as db:
            db.execute('CREATE SCHEMA ' + self.schema)
            db.execute(Path('db/001_baseline.sql').read_text().replace('SET search_path TO public, extensions;', f'SET search_path TO {self.schema},public,extensions;'))
            db.execute("INSERT INTO monthly_reports VALUES (2026,7,'150101','TEST LIMA','TEST PROVINCE','TEST DISTRICT','TEST',0),(2026,9,'150101','TEST LIMA','TEST PROVINCE','TEST DISTRICT','TEST',7),(2026,9,'070101','TEST CALLAO','TEST PROVINCE','TEST DISTRICT','TEST',3)")
            db.execute("INSERT INTO import_runs(source_kind,source_name,sha256,selected_rows) VALUES('sidpol-national','/private/path-must-not-be-published',%s,3)", ('a' * 64,))
            db.execute('CREATE ROLE ' + self.role)
            db.execute(f'GRANT USAGE ON SCHEMA {self.schema} TO {self.role}')
            db.execute(f'GRANT SELECT ON monthly_reports,import_runs,department_boundaries TO {self.role}')
        patcher = patch('ingestion.export_statistics.connect', self.connect)
        patcher.start()
        self.addCleanup(patcher.stop)

    def connect(self):
        # No INSERT/UPDATE, geometry access or access to private tracking/coordinate tables.
        return self.psycopg.connect(self.url, options=f'-c search_path={self.schema},public,extensions -c role={self.role}', prepare_threshold=None)

    def tearDown(self):
        with self.psycopg.connect(self.url) as db:
            db.execute('DROP OWNED BY ' + self.role)
            db.execute('DROP ROLE ' + self.role)
            db.execute('DROP SCHEMA ' + self.schema + ' CASCADE')

    def test_aggregate_export_with_read_only_role_preserves_counts_and_gaps(self):
        value = snapshot()
        self.assertEqual({'year': 2026, 'month': 9}, value['period'])
        latest = sum(d['monthly'][-1]['reports'] for d in value['departments'])
        self.assertEqual(10, latest)
        lima = next(d for d in value['departments'] if d['code'] == '15')
        self.assertEqual([7, 9], [m['month'] for m in lima['monthly']])
        self.assertEqual(0, lima['monthly'][0]['reports'])
        self.assertEqual(7, sum(r['reports'] for r in lima['districts']))
        self.assertEqual(7, sum(r['reports'] for r in lima['categories']))
        serialized = json.dumps(value)
        for private in ('private/path', 'longitude', 'latitude', 'concentration', 'DATABASE_URL'):
            self.assertNotIn(private, serialized)
        with self.connect() as db:
            self.assertEqual((3, 10), db.execute('SELECT COUNT(*),SUM(reports) FROM monthly_reports').fetchone())

    def test_empty_or_unverified_dataset_does_not_replace_published_input(self):
        with self.psycopg.connect(self.url) as db:
            db.execute(f'DELETE FROM {self.schema}.import_runs')
        with self.assertRaisesRegex(ExportError, 'national SIDPOL import'):
            snapshot()
        with self.psycopg.connect(self.url) as db:
            db.execute(f"INSERT INTO {self.schema}.import_runs(source_kind,source_name,sha256,selected_rows) VALUES('sidpol-national','TEST',%s,0)", ('b' * 64,))
            db.execute(f'DELETE FROM {self.schema}.monthly_reports')
        with self.assertRaisesRegex(ExportError, 'No imported statistics'):
            snapshot()

    def test_successful_export_writes_complete_json_atomically(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'new' / 'statistics.json'
            expected = write_snapshot(output)
            self.assertEqual(expected, json.loads(output.read_text()))
            self.assertEqual([output], list(output.parent.iterdir()))
