"""Database configuration for local scripts and scheduled AWS Lambda."""
import os
from pathlib import Path


def ubigeo(value: object) -> str:
    text = str(value).strip()
    if text.endswith('.0'):
        text = text[:-2]
    if not text.isascii() or not text.isdigit() or len(text) > 6 or not text or int(text) == 0:
        raise ValueError(f'Invalid UBIGEO value: {value!r}')
    return text.zfill(6)


def database_url() -> str:
    direct = os.getenv('DATABASE_URL')
    if direct:
        return direct
    parameter_name = os.getenv('DATABASE_URL_PARAMETER_NAME')
    if not parameter_name:
        raise RuntimeError('Set DATABASE_URL or DATABASE_URL_PARAMETER_NAME')
    import boto3
    return boto3.client('ssm').get_parameter(Name=parameter_name, WithDecryption=True)['Parameter']['Value']


def connect():
    import psycopg
    # Supabase shared transaction pooling does not support server-side prepared statements.
    return psycopg.connect(database_url(), prepare_threshold=None, connect_timeout=10)


def resolve_source_name(path: Path, digest: str, explicit_name: str | None = None) -> str:
    """Use verified downloader provenance when present; retain manual import support."""
    import json
    if explicit_name:
        return explicit_name
    manifest = path.with_suffix(path.suffix + '.source.json')
    if not manifest.exists():
        return path.name
    record = json.loads(manifest.read_text(encoding='utf-8'))
    if not isinstance(record, dict) or record.get('sha256') != digest or not isinstance(record.get('source_url'), str) or not record['source_url']:
        raise ValueError('Download provenance does not match this file; download it again or provide an explicit source name')
    return record['source_url']
