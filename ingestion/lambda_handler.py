"""Scheduled Lambda adapter for the same extract/transform/load used locally."""
import logging
import os
from pathlib import Path

from .etl import EtlSettings, run_etl

logger = logging.getLogger('ingestion')
logger.setLevel(logging.INFO)


def handler(event, context):
    # EventBridge payloads never override trusted source URLs or DB configuration.
    if os.getenv('INGESTION_DATASET') == 'concentration':
        from .concentration import run
        return run(int(os.environ.get('CONCENTRATION_YEAR', '0')) or None,
                   int(os.environ.get('CONCENTRATION_MONTH', '0')) or None,
                   os.environ.get('CONCENTRATION_CATEGORY') or None)
    settings = EtlSettings.from_environment()
    settings = EtlSettings(Path('/tmp/chapa-tu-choro-etl'), settings.sidpol_url, settings.archive_bucket)
    return run_etl(settings)  # Raise on failure so Lambda's retry/error handling runs.
