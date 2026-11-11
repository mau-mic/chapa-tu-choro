"""Read official SIDPOL CSVs; do not invent incident coordinates.

Required source headers (verify against the downloaded release): ANIO,MES,DPTO_HECHO_NEW,PROV_HECHO,
DIST_HECHO,UBIGEO_HECHO,P_MODALIDADES,cantidad.

Examples:
    python -m ingestion.import_sidpol data/SIDPOL.csv --check-only
    python -m ingestion.import_sidpol data/SIDPOL.csv
"""
import argparse
from .tracking import TrackingError
from contextlib import nullcontext
import csv
import hashlib
import json
from pathlib import Path

from .common import connect, ubigeo, resolve_source_name

COLUMNS = (
    'ANIO', 'MES', 'DPTO_HECHO_NEW', 'PROV_HECHO', 'DIST_HECHO',
    'UBIGEO_HECHO', 'P_MODALIDADES', 'cantidad',
)


def iter_records(path: Path, on_error=None):
    with path.open(encoding='utf-8-sig', newline='') as file:
        sample = file.read(16384)
        file.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=',;')
        except csv.Error as exc:
            raise ValueError('Could not determine CSV delimiter') from exc
        reader = csv.DictReader(file, dialect=dialect)
        if not reader.fieldnames:
            raise ValueError('CSV has no header')
        reader.fieldnames = [name.strip() for name in reader.fieldnames]
        if len(reader.fieldnames) != len(set(reader.fieldnames)):
            raise ValueError('Duplicate CSV headers')
        missing = set(COLUMNS) - set(reader.fieldnames)
        if missing:
            raise ValueError(f'Missing columns: {sorted(missing)}')
        for line, row in enumerate(reader, start=2):
            try:
                if None in row or any(row.get(key) is None for key in COLUMNS):
                    raise ValueError('CSV row has an inconsistent number of columns')
                year = int(row['ANIO'])
                month = int(row['MES'])
                count = int(row['cantidad'])
                code = ubigeo(row['UBIGEO_HECHO'])
                category = row['P_MODALIDADES'].strip()
                if not 2000 <= year <= 2100 or not 1 <= month <= 12 or count < 0:
                    raise ValueError('Invalid year, month or count')
                if count > 2147483647:
                    raise ValueError('Count exceeds database integer range')
                if not category or len(category) > 200:
                    raise ValueError('Category must have 1–200 characters')
                if code[-2:] == '00' or not all(row[k].strip() for k in ('DPTO_HECHO_NEW', 'PROV_HECHO', 'DIST_HECHO')):
                    raise ValueError('Missing district identifier or geographic name')
                yield (year, month, code, row['DPTO_HECHO_NEW'].strip(),
                       row['PROV_HECHO'].strip(), row['DIST_HECHO'].strip(), category, count)
            except (ValueError, KeyError, TypeError, AttributeError) as exc:
                message = f'CSV line {line}: {exc}'
                if on_error is None:
                    raise ValueError(message) from exc
                on_error(message)


def is_lima_or_callao(code: str) -> bool:
    return code.startswith('1501') or code.startswith('0701')


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def validate_file(path: Path) -> tuple[int, int]:
    scanned = selected = 0
    for record in iter_records(path):
        scanned += 1
        selected += 1
    return scanned, selected


class RejectedImportError(ValueError):
    def __init__(self, report: dict):
        super().__init__(report['errors'][0])
        self.report = report


def audit_file(path: Path) -> dict:
    errors = []
    rejected = 0
    def reject(message):
        nonlocal rejected
        rejected += 1
        if len(errors) < 20:
            errors.append(message)
    valid = selected = 0
    for row in iter_records(path, reject):
        valid += 1
        selected += 1
    return {'scanned_rows': valid + rejected, 'selected_rows': selected,
            'out_of_scope_rows': valid - selected, 'rejected_rows': rejected, 'errors': errors}


def import_file(path: Path, source_name: str | None = None, *, connection=None) -> dict:
    """Apply an incremental release: sum duplicates within the file, replace each
    supplied aggregate key, preserve omitted keys, and skip previously seen bytes.
    A release is never assumed to be a complete period snapshot. Replaying an old
    checksum cannot undo a newer revision; corrections need a new source release.
    """
    report = audit_file(path)
    if report['rejected_rows']:
        raise RejectedImportError({'status': 'rejected', 'imported_rows': 0, **report})
    scanned, expected_selected = report['scanned_rows'], report['selected_rows']
    if expected_selected == 0:
        raise ValueError('No valid district statistics; nothing imported')
    digest = sha256_file(path)
    source_name = resolve_source_name(path, digest, source_name)
    with (nullcontext(connection) if connection is not None else connect()) as conn:
        with conn.transaction():
            # Serialize dataset writes, including checksum checks, across concurrent jobs.
            conn.execute("SELECT pg_advisory_xact_lock(17294001)")
            seen = conn.execute("""
                SELECT 1 FROM import_runs WHERE source_kind = 'sidpol-national' AND sha256 = %s
            """, (digest,)).fetchone()
            if seen:
                return {'status': 'skipped', 'sha256': digest, 'scanned_rows': scanned, 'selected_rows': 0, 'rejected_rows': 0}

            conn.execute("""
                CREATE TEMP TABLE sidpol_staging (
                    year smallint, month smallint, ubigeo varchar(6),
                    department text, province text, district text, category text, reports integer
                ) ON COMMIT DROP
            """)
            selected = 0
            with conn.cursor() as cur:
                with cur.copy('COPY sidpol_staging FROM STDIN') as copy:
                    for row in iter_records(path):
                        copy.write_row(row)
                        selected += 1
            if conn.execute("""
                SELECT 1 FROM sidpol_staging GROUP BY year, month, ubigeo
                HAVING COUNT(DISTINCT (department, district)) > 1 LIMIT 1
            """).fetchone():
                raise ValueError('Conflicting geographic names for the same UBIGEO; import rolled back')
            unmatched = conn.execute("""
                SELECT COUNT(DISTINCT s.ubigeo) FROM sidpol_staging s
                LEFT JOIN district_boundaries d USING (ubigeo) WHERE d.ubigeo IS NULL
            """).fetchone()[0]
            conn.execute("""
                INSERT INTO monthly_reports
                    (year, month, ubigeo, department, province, district, category, reports)
                SELECT year, month, ubigeo, MAX(department), MAX(province),
                       MAX(district), category, SUM(reports)::integer
                FROM sidpol_staging
                GROUP BY year, month, ubigeo, category
                ON CONFLICT (year, month, ubigeo, category) DO UPDATE SET
                    department = EXCLUDED.department,
                    province = EXCLUDED.province,
                    district = EXCLUDED.district,
                    reports = EXCLUDED.reports
            """)
            conn.execute("""
                INSERT INTO import_runs(source_kind, source_name, sha256, selected_rows)
                VALUES ('sidpol-national', %s, %s, %s)
            """, (source_name, digest, selected))
            # No destructive reconciliation: some CSV releases are incremental, not complete snapshots.
    return {'status': 'imported', 'sha256': digest, 'scanned_rows': scanned,
            'selected_rows': selected, 'out_of_scope_rows': scanned - selected,
            'rejected_rows': 0, 'unmatched_districts': unmatched}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('file', type=Path)
    parser.add_argument('--check-only', action='store_true')
    parser.add_argument('--source-name', help='Original release URL or filename, retained in the import audit')
    args = parser.parse_args()
    try:
        if args.check_only:
            report = audit_file(args.file)
            print(json.dumps(report))
            if report['rejected_rows']:
                parser.exit(1)
        else:
            from .tracking import TrackingRun
            from .common import connect
            with TrackingRun('manual', ['sidpol-national']) as tracking:
                tracking.stage('load')
                with connect() as connection:
                    with connection.transaction():
                        result = import_file(args.file, args.source_name, connection=connection)
                        tracking.complete(connection, {'sidpol-national': result})
                result['run_id'] = tracking.id
            print(json.dumps(result))
    except RejectedImportError as exc:
        parser.exit(1, json.dumps(exc.report) + '\n')
    except TrackingError as exc:
        parser.exit(1, str(exc) + '\n')
    except ValueError as exc:
        parser.exit(1, json.dumps({'status': 'rejected', 'imported_rows': 0, 'error': str(exc)}) + '\n')


if __name__ == '__main__':
    main()
