import tempfile
import unittest
from pathlib import Path
from ingestion.common import ubigeo
from ingestion.import_sidpol import iter_records, validate_file, sha256_file, is_lima_or_callao

HEADER = 'ANIO,MES,DPTO_HECHO_NEW,PROV_HECHO,DIST_HECHO,UBIGEO_HECHO,P_MODALIDADES,cantidad\n'


class SidpolParserTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / 'sample.csv'

    def tearDown(self):
        self.tmp.cleanup()

    def test_ubigeo_normalization(self):
        self.assertEqual('070101', ubigeo('70101'))
        with self.assertRaises(ValueError):
            ubigeo('LIMA')

    def test_scan_entire_file_not_first_twenty_rows(self):
        body = ''.join('2026,9,LIMA,LIMA,LIMA,150101,ROBO,3\n' for _ in range(26))
        self.path.write_text(HEADER + body)
        self.assertEqual((26, 26), validate_file(self.path))
        self.assertEqual(26, len(list(iter_records(self.path))))

    def test_invalid_tail_row_is_detected(self):
        self.path.write_text(HEADER + '2026,9,LIMA,LIMA,LIMA,150101,ROBO,3\n' +
                             '2026,13,LIMA,LIMA,LIMA,150101,ROBO,3\n')
        with self.assertRaisesRegex(ValueError, 'line 3'):
            validate_file(self.path)

    def test_hash_is_deterministic(self):
        self.path.write_text(HEADER)
        self.assertEqual(sha256_file(self.path), sha256_file(self.path))

    def test_lima_callao_scope(self):
        self.assertTrue(is_lima_or_callao('150101'))
        self.assertTrue(is_lima_or_callao('070101'))
        self.assertFalse(is_lima_or_callao('040101'))


if __name__ == '__main__':
    unittest.main()
