# Population projections and report rates

Phase 4 adds a separate comparison in **Tendencias → Denuncias → Denuncias y población**. The sidebar’s shared year slider and final-month selector control both historical charts and population comparison. Historical charts end at that month; population uses that month and its same-year denominator. Territory and modality filters also apply to both sections. The population table shows every selected year through this shared cutoff, with explicit unavailable values and no separate date filter. The existing count charts remain available. The historical comparison switches between counts and rates, and the statistics map offers a count/rate toggle. Geographic classification records are not joined or added to CSV reports.

## Source and additional files

The supported input is INEI's **Población total proyectada al 30 de junio de cada año, según departamento, provincia y distrito, 2018–2026** XLSX, sheet `POB. PROYECTADA 2018-2026`. The [official publication URL](https://www.gob.pe/institucion/inei/informes-publicaciones/6894980-peru-poblacion-total-proyectada-al-30-de-junio-de-cada-ano-segun-departamento-provincia-y-distrito-2018-2025) retains its older URL suffix. The supplied workbook has SHA-256 `9436df29b883fd4a9db3705040a6668ff4efe7047c2643249b6b6bedd90d5c8b`.

It contains 19,026 observations: 1 national total, 25 departments, 196 provinces and 1,892 districts, each over nine years. There are 59 explicitly unavailable historical district/year values, caused by district creation. They are stored as null with the source note, never zero. All available counts are positive integers; district sums reconcile with every parent total for every year. UBIGEO remains six-character text with leading zeroes. National `000000`, department `DD0000` and province `DDPP00` are population aggregate codes, not district records.

**No additional file is needed for this initial district/province/department comparison**, beyond already imported SIDPOL statistics. Matching uses UBIGEO and year, not geographic names or population-weighted interpolation. Missing geometries do not remove population observations. This file does not support neighborhood/street population distribution. That requires matching official census manzana/centro-poblado counts and geometries. A future annual series revised with Census 2025 would improve the denominator; this workbook explicitly says its projections are preliminary/referential until definitive Census 2025 results are available. It is not that revised series. No census totals, residents or crime locations are fabricated.

The current parser intentionally accepts this specific 2018–2026 publication. A release with different years/schema requires a reviewed parser and migration change; it is not silently interpreted as the same series. Source access and successful import do not grant redistribution permission; the catalogue retains unresolved usage status.

## Local import

The original workbook is never modified. Government files under `data/` are gitignored.

```bash
# Place the provided official workbook at this local path first:
cp /path/to/official-population.xlsx data/population.xlsx

docker compose up -d --wait postgis
docker compose --profile etl run --build --rm migrate
# Validation without writing observations or connecting to the database:
docker compose --profile etl run --build --rm --no-deps population /input/population.xlsx --check-only
# Versioned, auditable import:
docker compose --profile etl run --build --rm population /input/population.xlsx
docker compose --profile app up --build -d
```

Open http://localhost:5173/tendencias. Alternatively set `POPULATION_DATA_DIR` to a directory containing the workbook and pass its `/input/filename.xlsx` path to the population service. The mount is read-only. Validation reports observation and unavailable-value counts. Imports report selected/rejected observations, unmatched district geometries, and report district/year combinations without population.

Native Python can run the same commands through `uv`:

```bash
uv run --with-requirements ingestion/requirements.txt python -m ingestion.population data/population.xlsx --check-only
# Set DATABASE_URL for the intended, authorized local database before either write:
uv run --with-requirements ingestion/requirements.txt python -m ingestion.migrate
uv run --with-requirements ingestion/requirements.txt python -m ingestion.population data/population.xlsx
```

`DATABASE_URL` and the existing `DATABASE_URL_PARAMETER_NAME` mechanism remain server-side; never supply database credentials to Vite. PostgreSQL/PostGIS on AWS or Supabase uses the same migration and import commands with an authorized target role. **No remote migration/import or infrastructure deployment is performed automatically.** The current scheduled Lambda entry point still handles its existing feeds; automatic population download/discovery and a scheduled population Lambda adapter are not implemented. A trusted operator supplies this workbook to the CLI runner.

## Storage, audit and security

Migration `003_population.sql` is additive in `db/migrations.json`. It was renamed from `007_population.sql` without changing SQL or checksums; the [runner reconciles old receipts](../../db/README.md#existing-migration-records). `population_releases` records digest, source, basis, import time and one active release. `population_observations` uses `(release_sha256, year, ubigeo)` as its key. Data from earlier releases remains available for audit. Matching never requires a geometry FK.

Imports validate the complete workbook before mutation, bulk-COPY into temporary staging and INSERT into the RLS-protected observations table, serialize writers with an advisory transaction lock, and activate a release only after the complete import succeeds. Staging is removed before returning so multiple releases can share a caller-owned transaction. A repeated digest is skipped; replaying an old digest never reactivates it over a newer version. Data and the existing tracking success receipt commit together. Invalid input leaves the active release unchanged and the CLI tracking attempt fails. The `manual` pipeline/source `inei-population` identifies these attempts. Freshness reports the projection reference period separately from import time; it is not an event occurrence date. See [Supabase access](../supabase-setup.md) for the writer role and migration 004.

Both new tables have RLS and revoke PUBLIC/anon/authenticated privileges. For a managed deployment, an operator must grant the dedicated server API role SELECT and an appropriate role-specific SELECT policy; the ingestion role needs SELECT/INSERT, release UPDATE and appropriate role-specific policies, plus existing tracking permissions. Do not grant browser roles access or use the production migration owner as the API login. Roles and policies are deployment-specific and are not provisioned remotely by this change.

## API and interpretation

`GET /api/population/comparison?year=2025&month=1` accepts optional `category`, `department`, `province`, `district`. Geography follows existing hierarchical validation. See `backend/population.http` (native API port 5080; use web port 5173 for the Compose proxy).

The response includes the selected year's population/source, all twelve monthly count/rate observations and a territorial ranking for the selected month. National views rank departments; department views rank provinces; province views rank districts; a selected district returns itself. The interface displays up to 15 territories and can order by count or rate.

```text
monthly registered reports / same-year June 30 projected residents × 100,000
```

Rates are monthly, rounded to two decimals and **not annualized**. Explicit imported report zeroes produce zero rates. Absent reporting months remain null. If any selected report row has no compatible district population, the affected monthly/territorial aggregate retains counts but its rate is null. No subset numerator is divided by a full-population denominator to hide mismatches. Territories without report rows are not ranked as zero. Available records do not prove complete reporting coverage. No per-resident rate can establish personal risk, and small populations can produce unstable rates. Visitors, commuters, reporting behavior and territorial changes still affect interpretation.

The repository uses three sequential EF Core projections: active release identity, bounded same-year population, and server-side report aggregates. It never loads raw report rows or calls a query per territory. Immutable releases pin the denominator version across reads. The population PK supports release/year lookup; existing report indexes support year and geography filtering. No speculative index, cache service or new chart dependency is added. Cancellation propagates through EF, a 15-second application budget returns 503 on expiration, and the frontend has a 20-second timeout plus manual retry and stale-response cancellation. The existing analytics rate limit and centralized ProblemDetails/Serilog handling apply.

## Local data-quality findings (2026-11-13)

The supplied population file and existing local crime data revealed:

- Missing INEI geometry for `130112` Alto Trujillo and `160405` Santa Rosa de Loreto. Population remains available for comparisons.
- SIDPOL contains four reports for `080915` Kumpirushiato in 2020, category `Otros`, one each in May, June, October and December. The population workbook marks this district as created in 2021, so a 2020 district denominator is unavailable. These reports are preserved; affected aggregate rates are suppressed rather than guessed or reassigned to a parent.

These are reproducible local observations, not claims that upstream files are wrong. Census revisions or territorial correspondence tables are needed before reconciling this historical discrepancy.

Validation evidence, test names, real-data response examples and single-request local timings are recorded in [Phase 4 evidence](../evidence/phase-4-population-2026-11-13.json). Local timings are observations, not a load benchmark or a latency guarantee for AWS/Supabase.

## Historical comparison and rate map

`GET /api/population/history?fromYear=2018&fromMonth=1&toYear=2026&toMonth=9` accepts the shared category and territory filters plus optional `compare=150000,070000`. Ranges are inclusive and limited to 120 months. Comparison codes are six-digit population UBIGEO aggregates at the next geographic level (departments nationally, provinces in a department, districts in a province, or the selected district). Up to four unique codes are allowed. Omit `compare` for the three highest closing-month report counts; `compare=` explicitly selects none. Invalid or incompatible codes return 400; unknown codes return 404.

The response contains aligned `monthly`, selectable `territories`, selected `series`, closing-month `ranking`, pinned population `source` and `quality`. Each month uses its own year's denominator. Missing reporting months, absent population years and incompatible district denominators remain null rates; explicit report zeroes remain zero. Three bounded EF queries read the active release, year-range population projections and grouped report facts, with no query per compared territory.

`GET /api/explorer/rates?year=2026&month=9` accepts the existing explorer filters. Its GeoJSON preserves the existing geometries and report counts and adds nullable `ratePer100k` and `population`. Count/denominator disagreement suppresses the rate. Missing population setup still returns the count map with unavailable rates, rather than hiding geometry. Both endpoints use the existing analytics rate limit, validation, cancellation, 15-second budget and ProblemDetails conventions. No additional migration is required beyond `003_population.sql`.

Quality reports observed districts with reports, expected districts with available population, reporting districts without compatible population or geometry, population districts without geometry, observed/requested months and years without population. These are filter-dependent availability indicators, not estimates of reporting completeness or individual risk.

The first map/trends visit coordinates data and lazy-module readiness behind one accessible loading skeleton. Later filter updates use section loading states. Data failures release the initial loader and expose retry/error states. Reduced-motion preferences disable skeleton animation. No UI or database package was added.

The completed historical/territorial/map work and coordinated loader have additional [closeout validation evidence](../evidence/phase-4-closeout-2026-11-13.json). Remaining population-source work is acquisition of revised official census-based denominators and finer official spatial population inputs; these are not fabricated or inferred from this workbook.

## Moving averages, historical references and national comparison

`GET /api/population/insights?fromYear=2021&fromMonth=1&toYear=2026&toMonth=9&department=15` uses the same range/category/geography validation as history. It accepts at most 120 selected months. The repository reads a bounded additional 36 months before the visible start; those observations are used only for calculations and are not added to the selected range.

Each returned month contains `scope` and `national`, with actual reports/population/rate, rolling 3/12 means, historical and seasonal baselines, baseline percentage differences and available/required sample counts. `nationalDifferencePer100k` and `nationalDifferencePercent` compare the selected territory's rate with Peru's rate. `source` pins the population digest and `lookbackMonths` documents the fixed read horizon.

Rules:

- A 3- or 12-month moving average includes the observed month and its preceding 2 or 11 calendar months.
- The historical baseline is the mean of the **preceding 36 months**, excluding the observed month.
- The seasonal baseline is the mean of the **same calendar month in each of the preceding three years**.
- Each mean requires every required observation. Counts and rates have separate availability counts: a report with an incompatible denominator still contributes to a count reference, while its rate remains unavailable. Explicit zero is a valid observation. Missing observations are not interpolated or treated as zero.
- Baselines never use future observations. Small visible ranges can still have a reference when valid preceding observations exist in the database. References at the beginning of source coverage are unavailable until the required history exists.
- Each monthly rate uses that year's population. Means average the displayed monthly rates, rounded to two decimals; they are not cumulative/annualized rates. Count means may be fractional.
- The national rate is **national report counts / national population × 100,000**, including the selected territory. It uses the same month/category as the territory. It is never an arithmetic average of district rates. Missing denominators in any contributing national district suppress the national rate while compatible territorial rates remain available.
- Percentage differences are `(observed − reference) / reference × 100`. A missing observation/reference or a zero reference makes the percentage unavailable. Rate differences are differences between the displayed two-decimal monthly rates. No result establishes causation, predicts future events or measures personal risk.

The new EF reader runs **three commands**: active immutable release, bounded annual national/selected denominators, and one server-grouped query with national plus conditional territorial aggregates. It never loads raw report rows and does not query per month or per territory. Cancellation and a 15-second handler budget apply; errors use existing Result/ProblemDetails and analytics rate limiting. No schema migration, population reimport or new service is needed.

In Tendencias → Denuncias, the existing count/rate choice controls smoothing and baseline units. Moving-average and reference selectors are local presentation choices and issue no extra requests. The national comparison always uses rates, even when the local history is displaying counts. Choosing all Peru shows an instruction to select a territory rather than drawing duplicate national lines. Tables expose monthly values and missing observations to keyboard/screen-reader users.

Insights start alongside history; initial loading waits for their completion or failure. Later failures preserve the original history and offer manual retry. If parallel responses disagree on population release, periods, counts or denominators, advanced comparisons are withheld and retry refreshes both responses. The geographic classification source remains separate and is not normalized or combined with this series.
