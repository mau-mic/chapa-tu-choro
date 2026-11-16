"""One ETL use case for a local CLI, Docker Compose and scheduled Lambda.

Extract official sources, validate/normalize, optionally archive, then commit
both district boundaries and report aggregates in one PostgreSQL transaction.
"""
import argparse
import json
import logging
import os
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

from .common import connect
from .tracking import TrackingRun, TrackingError
from .download_official import download_districts, download_sidpol, require_official_url
from .import_districts import import_geojson, read_features
from .import_sidpol import import_file, iter_records, sha256_file

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class EtlSettings:
    work_dir: Path = Path('data/etl')
    sidpol_url: str | None = None
    archive_bucket: str | None = None

    @classmethod
    def from_environment(cls):
        return cls(Path(os.getenv('ETL_WORK_DIR', 'data/etl')),
                   os.getenv('SIDPOL_SOURCE_URL') or None, os.getenv('DATA_BUCKET') or None)


class EtlError(RuntimeError):
    def __init__(self, run_id: str, stage: str, error_type: str):
        self.run_id, self.stage, self.error_type = run_id, stage, error_type
        super().__init__(f'ETL failed during {stage}; run_id={run_id}; error_type={error_type}')


def log_event(event: str, **fields):
    logger.info(json.dumps({'event': event, **fields}, ensure_ascii=False))


def transform_inputs(directory: Path) -> dict:
    """Check both downloaded inputs together before opening a database connection."""
    districts = {code for code, _, _ in read_features(directory / 'districts.geojson')}
    departments = {code for code, _, _ in read_features(directory / 'departments.geojson', name_key='NOMBDEP', level='department')}
    if not districts or not departments:
        raise ValueError('No official Peru district/department geometries')
    selected = scanned = reports = 0
    keys, codes, periods = set(), set(), set()
    names, provinces = {}, {}
    for row in iter_records(directory / 'SIDPOL.csv'):
        scanned += 1
        selected += 1
        reports += row[7]
        keys.add((row[0], row[1], row[2], row[6]))
        codes.add(row[2])
        periods.add((row[0], row[1]))
        geographic_name = (row[3], row[5])
        provinces.setdefault(row[:3], set()).add(row[4])
        if row[:3] in names and names[row[:3]] != geographic_name:
            raise ValueError('Conflicting geographic names for a district in the official CSV')
        names[row[:3]] = geographic_name
    if not selected:
        raise ValueError('No official Peru report rows')
    latest = max(periods)
    return {'scanned_rows': scanned, 'selected_rows': selected,
            'out_of_scope_rows': scanned - selected, 'rejected_rows': 0,
            'province_label_variant_groups': sum(len(values) > 1 for values in provinces.values()),
            'aggregate_keys': len(keys), 'source_reports': reports,
            'geometry_departments': len(departments), 'unmatched_departments': sorted({code[:2] for code in codes} - departments),
            'geometry_districts': len(districts), 'statistics_districts': len(codes),
            'unmatched_districts': sorted(codes - districts),
            'latest_source_period': {'year': latest[0], 'month': latest[1]}}


def archive_inputs(directory: Path, bucket: str, run_id: str) -> dict:
    # Lazy import: local ETL has no AWS dependency beyond installed packages.
    import boto3
    client = boto3.client('s3')
    files = {}
    for filename in ('SIDPOL.csv', 'SIDPOL.csv.source.json', 'districts.raw.geojson',
                     'districts.geojson', 'districts.geojson.source.json',
                     'departments.raw.geojson', 'departments.geojson', 'departments.geojson.source.json'):
        path = directory / filename
        key = f'official/{sha256_file(path)}/{filename}'
        # Inputs are bounded below 256 MiB: a streaming single PutObject avoids
        # multipart-upload permissions and orphaned parts on a failed invocation.
        with path.open('rb') as body:
            client.put_object(Bucket=bucket, Key=key, Body=body,
                              ServerSideEncryption='AES256', Metadata={'etl-run-id': run_id})
        files[filename] = key
    return {'bucket': bucket, 'objects': files}


def load_inputs(directory: Path, tracking=None) -> dict:
    with connect() as connection:
        with connection.transaction():
            connection.execute("SET LOCAL statement_timeout = '180s'")
            connection.execute("SET LOCAL lock_timeout = '15s'")
            connection.execute('SELECT pg_advisory_xact_lock(17294001)')
            # Importers use savepoints when sharing this transaction; only the outer
            # transaction commits. Audit entries roll back with the data on failure.
            departments = import_geojson(directory / 'departments.geojson', name_key='NOMBDEP', level='department', connection=connection)
            districts = import_geojson(directory / 'districts.geojson', connection=connection)
            statistics = import_file(directory / 'SIDPOL.csv', connection=connection)
            unmatched = connection.execute("""
                SELECT COUNT(DISTINCT r.ubigeo) FROM monthly_reports r
                LEFT JOIN district_boundaries d USING (ubigeo)
                WHERE d.ubigeo IS NULL
            """).fetchone()[0]
            if tracking:
                tracking.complete(connection, {
                    'inei-departments': departments,
                    'inei-districts': districts,
                    'sidpol-national': statistics,
                })
    return {'departments': departments, 'districts': districts, 'statistics': statistics,
            'database_unmatched_districts': unmatched}


def run_etl(settings: EtlSettings | None = None) -> dict:
    settings = settings or EtlSettings.from_environment()
    with TrackingRun('statistics', ['sidpol-national', 'inei-departments', 'inei-districts']) as tracking:
        return _run_etl(settings, tracking)


def _run_etl(settings, tracking):
    settings = settings or EtlSettings.from_environment()
    run_id, started, stage = tracking.id, time.monotonic(), 'configuration'
    log_event('etl_started', run_id=run_id)
    try:
        if settings.sidpol_url:
            require_official_url(settings.sidpol_url)
        settings.work_dir.mkdir(parents=True, exist_ok=True)
        # Per-run directories isolate concurrent jobs and are removed even on failure.
        with tempfile.TemporaryDirectory(prefix=f'{run_id}-', dir=settings.work_dir) as temporary:
            directory = Path(temporary)
            stage = 'extract'
            tracking.stage(stage)
            departments = download_districts(directory, level='department')
            districts = download_districts(directory)
            log_event('etl_source_downloaded', run_id=run_id, dataset='districts', sha256=districts['sha256'])
            statistics = download_sidpol(directory, settings.sidpol_url)
            log_event('etl_source_downloaded', run_id=run_id, dataset='sidpol', sha256=statistics['sha256'])
            stage = 'transform'
            tracking.stage(stage)
            transformed = transform_inputs(directory)
            log_event('etl_transformed', run_id=run_id, **transformed)
            stage = 'archive'
            tracking.stage(stage)
            archive = archive_inputs(directory, settings.archive_bucket, run_id) if settings.archive_bucket else None
            stage = 'load'
            tracking.stage(stage)
            loaded = load_inputs(directory, tracking=tracking)
            result = {'status': 'succeeded', 'run_id': run_id,
                      'duration_seconds': round(time.monotonic() - started, 3),
                      'sources': {name: {key: record[key] for key in ('source_url', 'sha256', 'downloaded_at')}
                                  for name, record in [('departments', departments), ('districts', districts), ('sidpol', statistics)]},
                      'transform': transformed, 'archive': archive, 'load': loaded}
        log_event('etl_succeeded', **result)
        return result
    except Exception as exc:
        # Do not write DSNs, credentials, response bodies or source row contents to logs.
        logger.error(json.dumps({'event': 'etl_failed', 'run_id': run_id, 'stage': stage,
                                 'error_type': type(exc).__name__}))
        raise EtlError(run_id, stage, type(exc).__name__) from None


def main():
    if os.getenv('INGESTION_DATASET') == 'concentration':
        from .concentration import main as concentration_main
        return concentration_main()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work-dir', type=Path)
    parser.add_argument('--sidpol-url', help='Pin a verified official CSV URL instead of discovering it')
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    defaults = EtlSettings.from_environment()
    settings = EtlSettings(args.work_dir or defaults.work_dir,
                           args.sidpol_url or defaults.sidpol_url, defaults.archive_bucket)
    try:
        print(json.dumps(run_etl(settings), ensure_ascii=False))
    except TrackingError as exc:
        parser.exit(1, str(exc) + '\n')
    except EtlError as exc:
        parser.exit(1, json.dumps({'status': 'failed', 'run_id': exc.run_id,
                                 'stage': exc.stage, 'error_type': exc.error_type}) + '\n')


if __name__ == '__main__':
    main()
