"""Import an official INEI district layer exported to WGS84 GeoJSON.

No geometry is invented or silently repaired. A bad feature rejects the transaction.
"""
import argparse
from .tracking import TrackingError
from contextlib import nullcontext
import json
import math
from pathlib import Path

from .common import connect, ubigeo, resolve_source_name
from .import_sidpol import sha256_file


def read_features(path: Path, code_key: str = 'UBIGEO', name_key: str = 'NOMBDIST', *, level: str = 'district'):
    if level not in ('district', 'department'):
        raise ValueError('Unsupported boundary level')
    data = json.loads(path.read_text(encoding='utf-8-sig'))
    if data.get('type') != 'FeatureCollection' or not isinstance(data.get('features'), list):
        raise ValueError('Expected a GeoJSON FeatureCollection with features')
    if 'crs' in data:
        raise ValueError('Export as EPSG:4326 without a custom CRS')
    seen = set()
    for index, feature in enumerate(data['features'], 1):
        try:
            if feature.get('type') != 'Feature':
                raise ValueError('Expected Feature')
            props = feature.get('properties') or {}
            code = ubigeo(props[code_key]) if level == 'district' else str(props[code_key]).strip().zfill(2)
            if level == 'department' and (len(code) != 2 or not code.isascii() or not code.isdigit() or code == '00'):
                raise ValueError('Invalid department code')
            name = props[name_key]
            if not isinstance(name, str) or not name.strip() or code[-2:] == '00':
                raise ValueError('Missing district name or district UBIGEO')
            if code in seen:
                raise ValueError(f'Duplicate district {code}; dissolve by UBIGEO before export')
            seen.add(code)
            shape = feature.get('geometry') or {}
            if shape.get('type') not in ('Polygon', 'MultiPolygon'):
                raise ValueError('Expected Polygon or MultiPolygon')
            polygons = [shape['coordinates']] if shape['type'] == 'Polygon' else shape['coordinates']
            if not polygons:
                raise ValueError('Empty geometry')
            for polygon in polygons:
                if not polygon:
                    raise ValueError('Empty polygon')
                for ring in polygon:
                    if len(ring) < 4 or ring[0] != ring[-1]:
                        raise ValueError('Polygon rings must be closed with at least four positions')
                    for position in ring:
                        if len(position) != 2 or not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in position):
                            raise ValueError('Expected finite two-dimensional coordinates')
                        if not -180 <= position[0] <= 180 or not -90 <= position[1] <= 90:
                            raise ValueError('Coordinates outside WGS84 ranges; verify EPSG:4326 export')
            yield code, name.strip(), shape
        except (ValueError, KeyError, TypeError, AttributeError) as exc:
            raise ValueError(f'GeoJSON feature {index}: {exc}') from exc


def import_geojson(path: Path, code_key: str = 'UBIGEO', name_key: str = 'NOMBDIST',
                   source_name: str | None = None, *, connection=None, level: str = 'district') -> dict:
    features = list(read_features(path, code_key, name_key, level=level))
    if not features:
        raise ValueError('No official boundaries; nothing imported')
    table, label, kind = (('department_boundaries', 'department', 'inei-departments')
                          if level == 'department' else ('district_boundaries', 'district', 'inei'))
    digest = sha256_file(path)
    source_name = resolve_source_name(path, digest, source_name)
    with (nullcontext(connection) if connection is not None else connect()) as conn:
        with conn.transaction():
            conn.execute("SELECT set_config('search_path', current_schema() || ',public,extensions', true)")
            conn.execute('SELECT pg_advisory_xact_lock(17294001)')
            # Bulk-copy geometries so nationwide imports do not require thousands
            # of network round trips to a managed PostgreSQL instance.
            staging = f'{table}_staging'  # Fixed identifiers selected by validated level.
            conn.execute(f"CREATE TEMP TABLE {staging} (ubigeo text, name text, geometry_json text) ON COMMIT DROP")
            with conn.cursor() as cursor:
                with cursor.copy(f'COPY {staging} FROM STDIN') as copy:
                    for code, name, shape in features:
                        copy.write_row((code, name, json.dumps(shape)))
            invalid = conn.execute(f"""
                SELECT ubigeo FROM (
                    SELECT ubigeo, ST_GeomFromGeoJSON(geometry_json) AS geom FROM {staging}
                ) shapes WHERE NOT ST_IsValid(geom) OR ST_IsEmpty(geom) OR ST_Area(geom) <= 0 LIMIT 1
            """).fetchone()
            if invalid:
                raise ValueError(f'Invalid or empty {level} geometry: {invalid[0]}; import rolled back')
            conn.execute(f"""
                INSERT INTO {table}(ubigeo, {label}, geom)
                SELECT ubigeo, name, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(geometry_json),4326))
                FROM {staging} WHERE true
                ON CONFLICT (ubigeo) DO UPDATE SET {label} = EXCLUDED.{label}, geom = EXCLUDED.geom
            """)
            conn.execute("""
                INSERT INTO import_runs(source_kind, source_name, sha256, selected_rows)
                VALUES (%s, %s, %s, %s) ON CONFLICT (source_kind, sha256) DO NOTHING
            """, (kind, source_name, digest, len(features)))
            unmatched = conn.execute("""
                SELECT COUNT(DISTINCT r.ubigeo) FROM monthly_reports r
                LEFT JOIN district_boundaries d USING (ubigeo) WHERE d.ubigeo IS NULL
            """).fetchone()[0]
    return {'status': 'imported', f'{level}s_imported': len(features), 'rejected_features': 0,
            'unmatched_districts': unmatched, 'sha256': digest}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('file', type=Path)
    parser.add_argument('--ubigeo-key', default='UBIGEO')
    parser.add_argument('--name-key', default='NOMBDIST')
    parser.add_argument('--source-name')
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    try:
        if args.check_only:
            result = {'valid_districts': len(list(read_features(args.file, args.ubigeo_key, args.name_key)))}
        else:
            from .tracking import TrackingRun
            from .common import connect
            with TrackingRun('manual', ['inei-districts']) as tracking:
                tracking.stage('load')
                with connect() as connection:
                    with connection.transaction():
                        result = import_geojson(args.file, args.ubigeo_key, args.name_key,
                                                args.source_name, connection=connection)
                        tracking.complete(connection, {'inei-districts': result})
                result['run_id'] = tracking.id
        print(json.dumps(result))
    except TrackingError as exc:
        parser.exit(1, str(exc) + '\n')
    except ValueError as exc:
        parser.exit(1, json.dumps({'status': 'rejected', 'districts_imported': 0, 'error': str(exc)}) + '\n')


if __name__ == '__main__':
    main()
