"""Synthetic source fixtures for ETL orchestration; no public data is fabricated."""
import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch, call

from ingestion.etl import EtlError, EtlSettings, archive_inputs, load_inputs, run_etl
from ingestion.download_official import SIDPOL_CATALOGUE
from ingestion.lambda_handler import handler
from ingestion.tests.test_download_official import district_response
from ingestion.tests.test_parsing import HEADER

CSV = HEADER + '2024,1,TEST,TEST,TEST,150101,TEST,3\n' + '2024,1,TEST,TEST,TEST,150101,TEST,4\n'


def fixture_fetch(url, destination, **kwargs):
    if url == SIDPOL_CATALOGUE:
        destination.write_text('<a href="https://www.datosabiertos.gob.pe/fixture.csv">CSV</a>')
    elif 'geoespacial.inei.gob.pe' in url:
        response = district_response()
        if 'ig_departamento' in url:
            response['features'][0]['properties'] = {'ccdd': '15', 'nombdep': 'TEST DEPARTMENT'}
        destination.write_text(json.dumps(response))
    else:
        destination.write_text(CSV)
    return url


class EtlTests(unittest.TestCase):
    def setUp(self):
        tracking_patch = patch('ingestion.etl.TrackingRun')
        tracking = tracking_patch.start()
        tracking.return_value.__enter__.return_value.id = '11111111-1111-4111-8111-111111111111'
        self.addCleanup(tracking_patch.stop)
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.settings = EtlSettings(self.root)

    def tearDown(self):
        self.tmp.cleanup()

    def test_request_transform_and_load_share_one_run_and_cleanup(self):
        with patch('ingestion.download_official.fetch', fixture_fetch), \
                patch('ingestion.etl.load_inputs', return_value={'statistics': {'status': 'imported'}}) as load:
            result = run_etl(self.settings)
            path = load.call_args.args[0]
        self.assertEqual('succeeded', result['status'])
        self.assertEqual(2, result['transform']['selected_rows'])
        self.assertEqual(1, result['transform']['aggregate_keys'])
        self.assertEqual(7, result['transform']['source_reports'])
        self.assertEqual([], result['transform']['unmatched_districts'])
        self.assertIn('https://www.datosabiertos.gob.pe/fixture.csv', result['sources']['sidpol']['source_url'])
        self.assertFalse(path.exists())
        self.assertEqual([], list(self.root.iterdir()))

    def test_failed_second_source_never_opens_database_or_archives(self):
        with patch('ingestion.download_official.fetch', fixture_fetch), \
                patch('ingestion.etl.download_sidpol', side_effect=ValueError('HTTP 418')), \
                patch('ingestion.etl.connect') as connect, patch('ingestion.etl.archive_inputs') as archive:
            with self.assertRaises(EtlError) as failure:
                run_etl(self.settings)
        self.assertEqual('extract', failure.exception.stage)
        connect.assert_not_called()
        archive.assert_not_called()
        self.assertEqual([], list(self.root.iterdir()))

    def test_invalid_source_pair_is_rejected_before_load(self):
        def invalid_fetch(url, destination, **kwargs):
            result = fixture_fetch(url, destination, **kwargs)
            if url.endswith('.csv'):
                destination.write_text(CSV + '2024,1,TEST,TEST,CONFLICT,150101,TEST,1\n')
            return result
        with patch('ingestion.download_official.fetch', invalid_fetch), patch('ingestion.etl.load_inputs') as load:
            with self.assertRaises(EtlError) as failure:
                run_etl(self.settings)
        self.assertEqual('transform', failure.exception.stage)
        load.assert_not_called()

    def test_required_archive_failure_prevents_database_writes(self):
        with patch('ingestion.download_official.fetch', fixture_fetch), \
                patch('ingestion.etl.archive_inputs', side_effect=RuntimeError('S3 unavailable')), \
                patch('ingestion.etl.load_inputs') as load:
            with self.assertRaises(EtlError) as failure:
                run_etl(EtlSettings(self.root, archive_bucket='test-bucket'))
        self.assertEqual('archive', failure.exception.stage)
        load.assert_not_called()

    def test_load_passes_the_same_connection_and_propagates_failure_to_outer_transaction(self):
        connection = MagicMock()
        connection.execute.return_value.fetchone.return_value = (0,)
        connection.transaction.return_value.__enter__.return_value = None
        with patch('ingestion.etl.connect') as connect, patch('ingestion.etl.import_geojson') as districts, \
                patch('ingestion.etl.import_file', side_effect=RuntimeError('load failure')) as statistics:
            connect.return_value.__enter__.return_value = connection
            with self.assertRaises(RuntimeError):
                load_inputs(self.root)
        districts.assert_has_calls([call(self.root / 'departments.geojson', name_key='NOMBDEP', level='department', connection=connection),
                                   call(self.root / 'districts.geojson', connection=connection)])
        statistics.assert_called_once_with(self.root / 'SIDPOL.csv', connection=connection)
        self.assertIs(RuntimeError, connection.transaction.return_value.__exit__.call_args.args[0])

    def test_database_errors_never_log_credentials(self):
        with patch('ingestion.download_official.fetch', fixture_fetch), \
                patch('ingestion.etl.load_inputs', side_effect=RuntimeError('password=VERY_SECRET')), \
                self.assertLogs('ingestion.etl', level='INFO') as captured:
            with self.assertRaises(EtlError) as failure:
                run_etl(self.settings)
        self.assertNotIn('VERY_SECRET', str(failure.exception))
        self.assertNotIn('VERY_SECRET', '\n'.join(captured.output))
        self.assertEqual('load', failure.exception.stage)

    def test_archive_uses_content_hash_keys_and_encryption(self):
        for name in ('SIDPOL.csv', 'SIDPOL.csv.source.json', 'districts.raw.geojson',
                     'districts.geojson', 'districts.geojson.source.json',
                     'departments.raw.geojson', 'departments.geojson', 'departments.geojson.source.json'):
            (self.root / name).write_text(name)
        client = MagicMock()
        with patch.dict('sys.modules', {'boto3': SimpleNamespace(client=lambda _: client)}):
            record = archive_inputs(self.root, 'test-bucket', 'test-run')
        self.assertEqual(8, client.put_object.call_count)
        for call in client.put_object.call_args_list:
            self.assertEqual('test-bucket', call.kwargs['Bucket'])
            self.assertTrue(call.kwargs['Key'].startswith('official/'))
            self.assertEqual('AES256', call.kwargs['ServerSideEncryption'])
        self.assertEqual(8, len(record['objects']))

    def test_lambda_uses_same_pipeline_trusted_environment_and_tmp_directory(self):
        with patch.dict(os.environ, {'SIDPOL_SOURCE_URL': 'https://www.datosabiertos.gob.pe/release.csv',
                                    'DATA_BUCKET': 'test-bucket', 'ETL_WORK_DIR': '/read-only'}, clear=True), \
                patch('ingestion.lambda_handler.run_etl', return_value={'status': 'succeeded'}) as run:
            result = handler({'sidpol_url': 'https://untrusted.example/test.csv'}, None)
        self.assertEqual('succeeded', result['status'])
        settings = run.call_args.args[0]
        self.assertTrue(str(settings.work_dir).startswith('/tmp/'))
        self.assertEqual('https://www.datosabiertos.gob.pe/release.csv', settings.sidpol_url)
        self.assertEqual('test-bucket', settings.archive_bucket)

    def test_lambda_raises_on_failure_for_platform_retries(self):
        with patch('ingestion.lambda_handler.run_etl', side_effect=EtlError('run', 'load', 'Error')):
            with self.assertRaises(EtlError):
                handler({}, None)
