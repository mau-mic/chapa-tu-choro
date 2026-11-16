"""Download official MININTER/INEI inputs; never substitute third-party or sample data.

    python -m ingestion.download_official --dataset districts
    python -m ingestion.download_official --dataset all

MININTER's portal may reject unattended clients. That is a reported failure, not
an empty or successful dataset. A verified direct government CSV URL can be pinned.
"""
import argparse
import json
import tempfile
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlencode, urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .import_districts import read_features
from .import_sidpol import audit_file, sha256_file

SIDPOL_CATALOGUE = 'https://www.datosabiertos.gob.pe/dataset/denuncias-policiales-registradas-nivel-nacional-mininter'
INEI_WFS = 'https://geoespacial.inei.gob.pe/geoserver/Interoperabilidad/ows'
MAX_BYTES = 256 * 1024 * 1024


def require_official_url(url: str):
    parts = urlsplit(url)
    host = (parts.hostname or '').lower()
    if (parts.scheme != 'https' or parts.username or parts.password or parts.port not in (None, 443)
            or not (host.endswith('.gob.pe') or host == 'gob.pe')):
        raise ValueError('Downloads must use HTTPS on an official *.gob.pe host without credentials')


class OfficialRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        require_official_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url: str, target: Path, limit: int = MAX_BYTES) -> str:
    require_official_url(url)
    opener = build_opener(OfficialRedirects())
    for attempt in range(3):
        try:
            request = Request(url, headers={'User-Agent': 'ChapaTuChoro/0.1 (official open-data importer)'})
            with opener.open(request, timeout=60) as response, target.open('wb') as output:
                total = 0
                while chunk := response.read(1024 * 1024):
                    total += len(chunk)
                    if total > limit:
                        raise ValueError(f'Download exceeds {limit} bytes')
                    output.write(chunk)
                if total == 0:
                    raise ValueError('Official server returned an empty download')
                return response.geturl()
        except HTTPError as exc:
            if exc.code in (403, 418):
                raise ValueError(f'Official source refused automated access (HTTP {exc.code}). '
                                 'An accessible official download endpoint is required; no file was replaced.') from exc
            if exc.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise ValueError(f'Official source returned HTTP {exc.code}') from exc
        except (URLError, TimeoutError, OSError) as exc:
            if attempt == 2:
                raise ValueError(f'Official source download failed: {exc}') from exc
        time.sleep(2 ** attempt)
    raise ValueError('Official download failed')


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            href = dict(attrs).get('href')
            if href:
                self.links.append(href)


def csv_links(html: str, base: str) -> list[str]:
    parser = Links()
    parser.feed(html)
    result = set()
    for href in parser.links:
        url = urljoin(base, href)
        if unquote(urlsplit(url).path).lower().endswith('.csv'):
            require_official_url(url)
            result.add(url)
    return sorted(result)


def discover_sidpol(work: Path) -> str:
    catalogue = work / 'catalogue.html'
    resolved = fetch(SIDPOL_CATALOGUE, catalogue, limit=5 * 1024 * 1024)
    html = catalogue.read_text(encoding='utf-8-sig')
    candidates = csv_links(html, resolved)
    if not candidates:
        # Some DKAN versions expose the download only on the resource's detail page.
        links = Links()
        links.feed(html)
        pages = sorted({urljoin(resolved, href) for href in links.links
                        if '/resource/' in urlsplit(urljoin(resolved, href)).path})
        if len(pages) == 1:
            resolved = fetch(pages[0], catalogue, limit=5 * 1024 * 1024)
            candidates = csv_links(catalogue.read_text(encoding='utf-8-sig'), resolved)
    if len(candidates) != 1:
        raise ValueError(f'Found {len(candidates)} unambiguous CSV download links. '
                         'Pin the intended official release with --sidpol-url; no release was guessed.')
    return candidates[0]


def publish_file(source: Path, destination: Path):
    # Temp files share a filesystem with the final path for atomic replacement.
    source.replace(destination)


def provenance(destination: Path, url: str, resolved_url: str, **extra) -> dict:
    return {'source_url': url, 'resolved_url': resolved_url,
            'downloaded_at': datetime.now(timezone.utc).isoformat(),
            'sha256': sha256_file(destination), **extra}


def save_manifest(path: Path, record: dict, work: Path):
    temporary = work / 'manifest.json'
    temporary.write_text(json.dumps(record, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    publish_file(temporary, path.with_suffix(path.suffix + '.source.json'))


def download_sidpol(output: Path, url: str | None = None) -> dict:
    destination = output / 'SIDPOL.csv'
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output) as directory:
        work = Path(directory)
        source = url or discover_sidpol(work)
        downloaded = work / 'SIDPOL.csv'
        resolved = fetch(source, downloaded)
        report = audit_file(downloaded)
        if report['rejected_rows'] or not report['selected_rows']:
            raise ValueError(f'Official CSV failed validation; existing file preserved: {json.dumps(report)}')
        record = provenance(downloaded, source, resolved, validation=report)
        publish_file(downloaded, destination)
        save_manifest(destination, record, work)
    return {'dataset': 'sidpol', 'status': 'downloaded', 'file': str(destination), **record}


def district_url(level: str = 'district') -> str:
    return INEI_WFS + '?' + urlencode({
        'service': 'WFS', 'version': '1.0.0', 'request': 'GetFeature',
        'typeName': 'Interoperabilidad:ig_departamento' if level == 'department' else 'Interoperabilidad:ig_distrito', 'outputFormat': 'application/json',
        'srsName': 'EPSG:4326', 'maxFeatures': '10000',
    })


def normalize_districts(data: dict, *, level: str = 'district') -> dict:
    if not isinstance(data, dict) or data.get('type') != 'FeatureCollection' or not isinstance(data.get('features'), list):
        raise ValueError('INEI did not return a GeoJSON FeatureCollection')
    crs_data = data.get('crs')
    if not isinstance(crs_data, dict) or not isinstance(crs_data.get('properties'), dict):
        raise ValueError('INEI response must explicitly declare WGS84; cannot infer CRS')
    crs = crs_data['properties'].get('name')
    if crs not in ('urn:ogc:def:crs:EPSG::4326', 'EPSG:4326', 'urn:ogc:def:crs:OGC:1.3:CRS84'):
        raise ValueError('INEI response must explicitly declare WGS84; cannot infer CRS')
    features = data['features']
    # Fail if the service silently truncates its response; never treat a partial layer as complete.
    matched = data.get('numberMatched', data.get('totalFeatures'))
    if matched is None or str(matched) != str(len(features)) or not features:
        raise ValueError('INEI response is empty, incomplete, or missing its total feature count')
    if 'numberReturned' in data and data['numberReturned'] != len(features):
        raise ValueError('INEI response count is inconsistent')
    normalized = []
    for feature in features:
        if not isinstance(feature, dict) or feature.get('type') != 'Feature' or not isinstance(feature.get('properties'), dict):
            raise ValueError('INEI returned a malformed GeoJSON feature')
        props = feature['properties']
        code = props.get('ccdd' if level == 'department' else 'ubigeo')
        if not isinstance(code, str) or len(code) != (2 if level == 'department' else 6) or not code.isascii() or not code.isdigit():
            raise ValueError('INEI returned an invalid district identifier')
        # Rename actual official fields only. Coordinates and district names remain unchanged.
        normalized.append({'type': 'Feature', 'geometry': feature.get('geometry'),
                           'properties': {'UBIGEO': code, ('NOMBDEP' if level == 'department' else 'NOMBDIST'): props.get('nombdep' if level == 'department' else 'nombdist')}})
    if not normalized:
        raise ValueError('INEI layer contains no official boundaries')
    return {'type': 'FeatureCollection', 'features': normalized}


def download_districts(output: Path, *, level: str = 'district') -> dict:
    if level not in ('district', 'department'):
        raise ValueError('Unsupported boundary level')
    stem = 'departments' if level == 'department' else 'districts'
    output.mkdir(parents=True, exist_ok=True)
    destination = output / f'{stem}.geojson'
    with tempfile.TemporaryDirectory(dir=output) as directory:
        work = Path(directory)
        raw = work / f'{stem}.raw.geojson'
        source = district_url(level)
        resolved = fetch(source, raw, limit=64 * 1024 * 1024)
        data = normalize_districts(json.loads(raw.read_text(encoding='utf-8-sig')), level=level)
        converted = work / f'{stem}.geojson'
        converted.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
        count = len(list(read_features(converted, name_key='NOMBDEP' if level == 'department' else 'NOMBDIST', level=level)))
        record = provenance(converted, source, resolved, **{stem: count}, raw_sha256=sha256_file(raw),
                            layer='Interoperabilidad:ig_departamento' if level == 'department' else 'Interoperabilidad:ig_distrito', requested_crs='EPSG:4326')
        publish_file(raw, output / f'{stem}.raw.geojson')
        publish_file(converted, destination)
        save_manifest(destination, record, work)
    return {'dataset': stem, 'status': 'downloaded', 'file': str(destination), **record}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset', choices=('all', 'districts', 'departments', 'sidpol'), default='all')
    parser.add_argument('--output-dir', type=Path, default=Path('data'))
    parser.add_argument('--sidpol-url', help='Pin a verified direct HTTPS government CSV release URL')
    args = parser.parse_args()
    results = []
    for name, action in [('departments', lambda: download_districts(args.output_dir, level='department')),
                         ('districts', lambda: download_districts(args.output_dir)),
                         ('sidpol', lambda: download_sidpol(args.output_dir, args.sidpol_url))]:
        if args.dataset not in ('all', name):
            continue
        try:
            results.append(action())
        except (ValueError, OSError) as exc:
            results.append({'dataset': name, 'status': 'failed', 'error': str(exc)})
    print(json.dumps(results, indent=2, ensure_ascii=False))
    if any(result['status'] == 'failed' for result in results):
        parser.exit(1)


if __name__ == '__main__':
    main()
