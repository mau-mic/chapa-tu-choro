"""Derive source data recency from imported observations, never download timestamps."""
from datetime import datetime
from zoneinfo import ZoneInfo

from .tracking import connect

# Existing datasets retain occurrence/reporting year and month, not validated event days.
QUERY = """
WITH periods AS (
 SELECT 'sidpol-national'::text AS source_key, MAX(make_date(year,month,1)) AS period
 FROM monthly_reports
 WHERE EXISTS (SELECT 1 FROM import_runs WHERE source_kind='sidpol-national')
 UNION ALL
 SELECT 'inei-population',MAX(make_date(p.year,6,30))
 FROM population_observations p JOIN population_releases r ON r.sha256=p.release_sha256 WHERE r.active
 UNION ALL
 SELECT source_key,MAX(make_date(year,month,1)) FROM concentration_imports
 WHERE source_rows>0 GROUP BY source_key
), imports AS (
 SELECT CASE source_kind WHEN 'inei' THEN 'inei-districts' ELSE source_kind END AS source_key,
        MAX(imported_at) AS imported_at FROM import_runs GROUP BY 1
 UNION ALL
 SELECT source_key,MAX(imported_at) FROM concentration_imports GROUP BY source_key
 UNION ALL
 SELECT 'inei-population',MAX(imported_at) FROM population_releases WHERE active
), attempts AS (
 SELECT s.source_key, MAX(r.finished_at) AS attempted_at
 FROM ingestion_run_sources s JOIN ingestion_runs r USING(run_id) GROUP BY s.source_key
)
SELECT s.source_key,s.title,p.period,
       (SELECT MAX(i.imported_at) FROM imports i WHERE i.source_key=s.source_key),
       a.attempted_at
FROM ingestion_sources s LEFT JOIN periods p USING(source_key)
LEFT JOIN attempts a USING(source_key) ORDER BY s.source_key
"""


def indicator(source_key, title, period, imported_at, attempted_at, today):
    latest = {'year': period.year, 'month': period.month} if period else None
    age = (today.year - period.year) * 12 + today.month - period.month if period else None
    return {
        'source_key': source_key, 'title': title,
        'latest_data_period': latest,
        'date_precision': 'month' if period else 'unknown',
        'date_basis': ({'sidpol-national': 'reporting_period', 'inei-population': 'projection_reference'}.get(source_key, 'occurrence_month')) if period else 'unknown',
        'status': 'unknown' if period is None else 'projected' if source_key == 'inei-population' else 'invalid_future_period' if age < 0 else 'dated',
        'age_months': age,
        'last_imported_at': imported_at.isoformat() if imported_at else None,
        'last_attempt_finished_at': attempted_at.isoformat() if attempted_at else None,
    }


def report(today=None, limit=200):
    if not 1 <= limit <= 200:
        raise ValueError('limit must be between 1 and 200')
    today = today or datetime.now(ZoneInfo('America/Lima')).date()
    with connect() as db:
        with db.transaction():
            db.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
            db.execute("SET LOCAL statement_timeout='20s'")
            rows = db.execute(QUERY + ' LIMIT %s', (limit,)).fetchall()
    return {'evaluated_on': today.isoformat(), 'sources': [indicator(*row, today) for row in rows]}
