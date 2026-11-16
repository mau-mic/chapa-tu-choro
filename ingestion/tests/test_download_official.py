"""Synthetic HTTP/parser fixtures only; never loaded into the application."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ingestion.download_official import (
    csv_links, download_districts, download_sidpol, normalize_districts, require_official_url,
)
from ingestion.tests.test_parsing import HEADER
from ingestion.common import resolve_source_name
from ingestion.import_sidpol import sha256_file


def district_response():
    return {'type': 'FeatureCollection', 'numberMatched': 1, 'numberReturned': 1,
            'crs': {'properties': {'name': 'urn:ogc:def:crs:EPSG::4326'}},
            'features': [{'type': 'Feature', 'properties': {'ubigeo': '150101', 'nombdist': 'TEST'},
                          'geometry': {'type': 'Polygon', 'coordinates': [[[-77,-12],[-77.1,-12],[-77.1,-12.1],[-77,-12]]]}}]}


class OfficialDownloadTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.output = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_only_https_government_urls_and_redirects_are_allowed(self):
        require_official_url('https://ide.inei.gob.pe/files/Distrito.rar')
        for url in ('http://ide.inei.gob.pe/a', 'https://example.com/a.csv',
                    'https://ide.inei.gob.pe.example.com/a', 'https://user:pass@ide.inei.gob.pe/a'):
            with self.assertRaises(ValueError):
                require_official_url(url)

    def test_csv_discovery_resolves_relative_links_and_deduplicates(self):
        html = '<a href="/files/test.csv">Download</a><a href="/files/test.csv">Again</a><a href="/a.pdf">PDF</a>'
        self.assertEqual(['https://www.datosabiertos.gob.pe/files/test.csv'],
                         csv_links(html, 'https://www.datosabiertos.gob.pe/dataset/test'))

    def test_district_normalization_preserves_official_coordinates_and_names(self):
        response = district_response()
        converted = normalize_districts(response)
        self.assertNotIn('crs', converted)
        self.assertEqual(response['features'][0]['geometry'], converted['features'][0]['geometry'])
        self.assertEqual({'UBIGEO': '150101', 'NOMBDIST': 'TEST'}, converted['features'][0]['properties'])

    def test_district_response_must_be_complete_and_confirm_crs(self):
        for change in ({'numberMatched': 2}, {'crs': None}, {'numberReturned': 2}, {'features': []}):
            with self.assertRaises(ValueError):
                normalize_districts({**district_response(), **change})

    def test_downloaded_districts_are_validated_and_record_provenance(self):
        def fake_fetch(url, target, **kwargs):
            target.write_text(json.dumps(district_response()))
            return url
        with patch('ingestion.download_official.fetch', fake_fetch):
            result = download_districts(self.output)
        self.assertEqual(1, result['districts'])
        self.assertTrue((self.output / 'districts.raw.geojson').exists())
        manifest = json.loads((self.output / 'districts.geojson.source.json').read_text())
        self.assertEqual(result['sha256'], manifest['sha256'])
        self.assertIn('source_url', manifest)

    def test_invalid_download_preserves_existing_data_and_manifest(self):
        target = self.output / 'districts.geojson'
        target.write_text('EXISTING VALIDATED FILE')
        manifest = self.output / 'districts.geojson.source.json'
        manifest.write_text('EXISTING MANIFEST')
        def fake_fetch(url, destination, **kwargs):
            destination.write_text(json.dumps({**district_response(), 'numberMatched': 2}))
            return url
        with patch('ingestion.download_official.fetch', fake_fetch):
            with self.assertRaises(ValueError):
                download_districts(self.output)
        self.assertEqual('EXISTING VALIDATED FILE', target.read_text())
        self.assertEqual('EXISTING MANIFEST', manifest.read_text())

    def test_html_error_is_not_saved_as_csv(self):
        target = self.output / 'SIDPOL.csv'
        target.write_text('EXISTING DATA')
        def fake_fetch(url, destination, **kwargs):
            destination.write_text('<html>Access denied</html>')
            return url
        with patch('ingestion.download_official.fetch', fake_fetch):
            with self.assertRaises(ValueError):
                download_sidpol(self.output, 'https://www.datosabiertos.gob.pe/test.csv')
        self.assertEqual('EXISTING DATA', target.read_text())

    def test_valid_csv_download_is_not_imported_into_database(self):
        def fake_fetch(url, destination, **kwargs):
            destination.write_text(HEADER + '2024,1,TEST,TEST,TEST,150101,TEST,3\n')
            return url
        with patch('ingestion.download_official.fetch', fake_fetch), patch('ingestion.import_sidpol.connect') as connect:
            result = download_sidpol(self.output, 'https://www.datosabiertos.gob.pe/test.csv')
        self.assertEqual('downloaded', result['status'])
        self.assertEqual(1, result['validation']['selected_rows'])
        connect.assert_not_called()

    def test_imports_use_download_source_and_reject_a_stale_manifest(self):
        target = self.output / 'SIDPOL.csv'
        target.write_text('ORIGINAL')
        manifest = target.with_suffix('.csv.source.json')
        manifest.write_text(json.dumps({'sha256': sha256_file(target),
                                        'source_url': 'https://www.datosabiertos.gob.pe/test.csv'}))
        self.assertEqual('https://www.datosabiertos.gob.pe/test.csv',
                         resolve_source_name(target, sha256_file(target)))
        target.write_text('MODIFIED')
        with self.assertRaisesRegex(ValueError, 'provenance does not match'):
            resolve_source_name(target, sha256_file(target))

    def test_district_download_retains_departments_outside_lima_callao(self):
        response = district_response()
        response['features'][0]['properties']['ubigeo'] = '040101'
        result = normalize_districts(response)
        self.assertEqual('040101', result['features'][0]['properties']['UBIGEO'])

    def test_official_department_layer_uses_verified_fields(self):
        response = district_response()
        response['features'][0]['properties'] = {'ccdd': '04', 'nombdep': 'TEST AREQUIPA'}
        result = normalize_districts(response, level='department')
        self.assertEqual({'UBIGEO': '04', 'NOMBDEP': 'TEST AREQUIPA'}, result['features'][0]['properties'])
