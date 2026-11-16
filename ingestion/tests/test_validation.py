"""Synthetic fixtures for parser validation only; never used as application data."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from ingestion.import_districts import read_features, import_geojson
from ingestion.import_sidpol import import_file, validate_file, audit_file
from ingestion.common import ubigeo
from ingestion.tests.test_parsing import HEADER


class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / 'test-data'

    def tearDown(self):
        self.tmp.cleanup()

    def write_geojson(self, geometry=None):
        self.path.write_text(json.dumps({'type': 'FeatureCollection', 'features': [{
            'type': 'Feature', 'properties': {'UBIGEO': '150101', 'NOMBDIST': 'TEST DISTRICT'},
            'geometry': geometry or {'type': 'Polygon', 'coordinates': [[[-77, -12], [-77.1, -12], [-77.1, -12.1], [-77, -12]]]}
        }]}))

    def test_reject_projected_coordinates_before_database_access(self):
        self.write_geojson({'type': 'Polygon', 'coordinates': [[[200000, 8000000]] * 4]})
        with patch('ingestion.import_districts.connect') as connect:
            with self.assertRaisesRegex(ValueError, 'WGS84'):
                import_geojson(self.path)
            connect.assert_not_called()

    def test_reject_duplicate_ubigeo(self):
        self.write_geojson()
        data = json.loads(self.path.read_text())
        data['features'] *= 2
        self.path.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, 'Duplicate district'):
            list(read_features(self.path))

    def test_accept_polygon_and_normalize_callao_code(self):
        self.write_geojson()
        data = json.loads(self.path.read_text())
        data['features'][0]['properties']['UBIGEO'] = 70101
        self.path.write_text(json.dumps(data))
        self.assertEqual('070101', list(read_features(self.path))[0][0])

    def test_reject_open_ring_and_null_geometry(self):
        for geometry in ({'type': 'Polygon', 'coordinates': [[[-77, -12], [-77.1, -12], [-77.1, -12.1], [-77.2, -12]]]}, {'type': 'Point', 'coordinates': [-77, -12]}):
            self.write_geojson(geometry)
            with self.assertRaises(ValueError):
                list(read_features(self.path))

    def test_bad_csv_is_rejected_before_database_access(self):
        self.path.write_text(HEADER + '2024,2,TEST,TEST,TEST,150101,TEST,-1\n')
        with patch('ingestion.import_sidpol.connect') as connect:
            with self.assertRaisesRegex(ValueError, 'line 2'):
                import_file(self.path)
            connect.assert_not_called()

    def test_reject_missing_required_headers_and_extra_cells(self):
        for text in ('ANIO,MES\n2024,1\n', HEADER + '2024,2,TEST,TEST,TEST,150101,TEST,1,extra\n'):
            self.path.write_text(text)
            with self.assertRaises(ValueError):
                validate_file(self.path)

    def test_reject_non_ascii_and_zero_ubigeo(self):
        for code in ('０００００１', '', '0', '1501000'):
            with self.assertRaises(ValueError):
                ubigeo(code)

    def test_audit_counts_all_rejected_records_without_importing_valid_rows(self):
        self.path.write_text(HEADER + '2024,1,TEST,TEST,TEST,150101,TEST,3\n'
                             + '2024,13,TEST,TEST,TEST,150101,TEST,3\n'
                             + '2024,1,TEST,TEST,TEST,150101,TEST,-2\n')
        report = audit_file(self.path)
        self.assertEqual(3, report['scanned_rows'])
        self.assertEqual(2, report['rejected_rows'])
        self.assertEqual(1, report['selected_rows'])
        self.assertIn('line 4', report['errors'][1])
