"""Read-only, consistent SIDPOL aggregate snapshot for static publishing. No raw locations."""
import argparse
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from .common import connect


class ExportError(RuntimeError):
    pass


def snapshot():
    # Separate from ingestion: a failed publication must not relabel a committed import.
    with connect() as db:
        with db.transaction():
            db.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
            db.execute("SET LOCAL statement_timeout='60s'")
            provenance = db.execute("""
                SELECT sha256, imported_at FROM import_runs
                WHERE source_kind='sidpol-national' ORDER BY imported_at, id
            """).fetchall()
            if not provenance:
                raise ExportError('A verified national SIDPOL import is required before publishing statistics')
            latest = db.execute('SELECT year,month FROM monthly_reports ORDER BY year DESC,month DESC LIMIT 1').fetchone()
            if not latest:
                raise ExportError('No imported statistics; no snapshot was published')
            monthly = db.execute("""
                SELECT left(ubigeo,2),year,month,SUM(reports)::bigint
                FROM monthly_reports GROUP BY 1,2,3 ORDER BY 1,2,3
            """).fetchall()
            names = dict(db.execute("""
                SELECT left(r.ubigeo,2),COALESCE(MAX(b.department),MAX(r.department))
                FROM monthly_reports r LEFT JOIN department_boundaries b ON b.ubigeo=left(r.ubigeo,2)
                GROUP BY 1
            """).fetchall())
            districts = db.execute("""
                SELECT ubigeo,MAX(district),MAX(province),SUM(reports)::bigint
                FROM monthly_reports WHERE year=%s AND month=%s GROUP BY ubigeo ORDER BY ubigeo
            """, latest).fetchall()
            categories = db.execute("""
                SELECT left(ubigeo,2),category,SUM(reports)::bigint
                FROM monthly_reports WHERE year=%s AND month=%s GROUP BY 1,2 ORDER BY 1,2
            """, latest).fetchall()
    departments = {code: {'code': code, 'name': name, 'monthly': [], 'districts': [], 'categories': []}
                   for code, name in names.items()}
    for code, year, month, reports in monthly:
        departments[code]['monthly'].append({'year': year, 'month': month, 'reports': reports})
    for code, name, province, reports in districts:
        departments[code[:2]]['districts'].append({'code': code, 'name': name, 'province': province, 'reports': reports})
    for code, name, reports in categories:
        departments[code]['categories'].append({'name': name, 'reports': reports})
    return {
        'version': 1,
        'exportedAt': datetime.now(timezone.utc).isoformat(),
        'period': {'year': latest[0], 'month': latest[1]},
        'imports': [{'sha256': digest, 'importedAt': timestamp.isoformat()} for digest, timestamp in provenance],
        'departments': [departments[key] for key in sorted(departments)],
    }


def write_snapshot(destination: Path):
    value = snapshot()  # Fail before replacing the previous publication input.
    destination.parent.mkdir(parents=True, exist_ok=True)
    filename = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=destination.parent, delete=False) as file:
            filename = file.name
            json.dump(value, file, ensure_ascii=False, separators=(',', ':'))
            file.write('\n')
        os.replace(filename, destination)
    finally:
        if filename and os.path.exists(filename):
            os.unlink(filename)
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path('frontend/.generated/statistics.json'))
    args = parser.parse_args()
    try:
        value = write_snapshot(args.output)
    except Exception as error:
        # Never print a connection string, query detail or arbitrary database exception.
        parser.exit(1, (str(error) if isinstance(error, ExportError) else 'Statistics export failed: ' + type(error).__name__) + '\n')
    print(json.dumps({'status': 'exported', 'period': value['period'], 'departments': len(value['departments'])}))


if __name__ == '__main__':
    main()
