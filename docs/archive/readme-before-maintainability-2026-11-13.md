> Historical record, retained on 2026-11-13. Use the [current documentation index](../README.md) for setup and current behavior. Statements and test results below describe the date recorded, not current validation.

# Chapa Tu Choro

Explore historical **registered police-report counts** across Peru, starting with departments and focusing on their districts. React, TypeScript, Vite, Tailwind CSS, a shadcn-style Base UI button, and MapLibre display aggregates served by ASP.NET Core 10 and PostgreSQL/PostGIS.

Counts are absolute, **not population-normalized rates or estimates of personal risk**. The map shows district boundaries, never invented incident locations. No official datasets are bundled and no sample statistics are loaded into the application.

## Nationwide exploration

The map starts with Peru's official department boundaries. Panning and zooming out are limited to that national framing, adapted to the screen size; neighboring countries remain visible as geographic context. Hover for a department total, click to focus on its districts, and use **Volver a Perú** to return. Period/category filters apply at both levels. Province and district filters narrow a selected department. The district selector includes all imported districts in that department, or only those in a selected province. Changing a parent resets its dependent selections. Selecting a district on the map or ranking also focuses it. The map zooms and fades continuously on the same page, with reduced-motion support. Animated skeletons indicate pending totals/ranking and any remaining data wait after camera movement. Department filters and ranking controls support keyboard/mobile navigation. Raw official files were already nationwide, but previous imports deliberately retained only Lima/Callao.

**Existing installations must apply `db/002_national_geography.sql` and rerun the updated ETL**, then rebuild the API/frontend. No database reset is required. See [the national-map upgrade guide](../nationwide-map.md) for exact commands, API contracts and data semantics.

## Run locally

Requirements: Docker Compose, .NET 10 SDK, Node.js 22.22.2+ (22 LTS), 24.15+ or 26+, and Python 3.11+.

Start the database, API and built frontend together:

```bash
docker compose --profile app up --build -d
# Application: http://localhost:5173
# API readiness through the site: http://localhost:5173/api/ready
```

Alternatively, run the database in Docker and use hot reload for development:

```bash
docker compose up -d postgis
dotnet restore backend/ChapaTuChoro.slnx
dotnet run --project backend/src/ChapaTuChoro.Api --launch-profile http
# In a separate terminal:
cd frontend
npm ci
npm run dev
```

Vite proxies `/api` to port 5080. The frontend container uses nginx to proxy the same routes to the API container; database credentials remain on the server. Only the web and database loopback ports are published; the API container has no host port mapping. In the native hot-reload workflow, the explicitly started .NET process listens on localhost:5080. The checked-in password is a disposable local-development placeholder. Override the Compose and backend connection settings together for any other environment; never commit actual credentials. `ConnectionStrings__Default` overrides the backend connection string. Keep `VITE_API_BASE_URL` empty for same-origin `/api` access. A separate API origin requires an explicit backend CORS allowlist entry; never place a secret in frontend configuration.

The SQL in `db/001_schema.sql` initializes **new** database volumes only. For an existing local database, apply this idempotent script explicitly:

```bash
docker compose exec -T postgis psql -U ctc -d chapatuchoro < db/001_schema.sql
```

`docker compose down` retains local data. No cloud deployment is needed.

## Run the complete ETL

From government HTTP requests through database insertion, use one command:

```bash
docker compose --profile etl run --build --rm etl
# Or: make etl
```

This waits for local PostGIS, downloads both official sources, validates/normalizes them, and commits both datasets and their audit records in one transaction. No manual download, QGIS conversion or separate import command is required. Refresh the application afterward.

To run with local Python and an existing database:

```bash
pip install -r ingestion/requirements.txt
export DATABASE_URL='postgresql://ctc:local_only_replace_me@localhost:5432/chapatuchoro'
python -m ingestion.etl
```

The same pipeline is used by `ingestion.lambda_handler.handler` in production. Terraform supports a scheduled invocation and archives downloaded sources to the existing private S3 bucket; deployment and schedule activation remain explicit actions. Build the Python artifact with `bash scripts/package-ingestion.sh`. See **[the ingestion guide](../data-ingestion.md)** for configuration, least-privilege permissions, scheduling, failure recovery, packaging, source contracts and validation.

## Download-only and manual import tools

Automatic download (no QGIS required):

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m ingestion.download_official --dataset all
```

This downloads the official MININTER CSV to `data/SIDPOL.csv` and requests INEI's published WFS layers in EPSG:4326, saving all districts to `data/districts.geojson` and departments to `data/departments.geojson`. It checks server feature totals to reject truncated layers, validates both inputs, and stores raw INEI GeoJSON plus `.source.json` sidecars containing URLs, timestamps and SHA-256 hashes. Existing datasets are preserved when a download or validation fails. The downloader uses only Python's standard library and does **not** write to PostgreSQL.

Nationwide source-to-database ingestion was verified in an isolated PostGIS database on 2026-11-11: 376,715 CSV rows, 376,714 aggregate keys, 1,890 district geometries, 25 department geometries, zero rejected rows and zero unmatched district identifiers. The latest CSV reporting period is September 2026. Geometry topology is additionally checked by PostGIS at import time.

Import the downloaded files locally:

```bash
pip install -r ingestion/requirements.txt
export DATABASE_URL='postgresql://ctc:local_only_replace_me@localhost:5432/chapatuchoro'
python -m ingestion.import_districts data/districts.geojson
python -m ingestion.import_sidpol data/SIDPOL.csv
```

Importers automatically retain the official source URL from each matching `.source.json` sidecar. A hash mismatch rejects a stale sidecar; manual files without sidecars still work with `--source-name` or their filename.

Use `--dataset districts` or `--dataset sidpol` to refresh one source. The MININTER downloader discovers a single CSV link from its catalogue and refuses to guess between multiple releases. For repeatable runs, pin a verified official release with `--sidpol-url 'https://www.datosabiertos.gob.pe/...csv'`. HTTP 403/418 and changed source schemas are explicit failures (exit status 1); unattended success cannot be guaranteed if the government changes or blocks its endpoint. The ordinary downloader request succeeded here even though earlier catalogue access was rejected. No browser cookies or access-control bypass are used.

For scheduling, invoke this command with your local scheduler and check its exit status. No AWS resource is required and no scheduler has been enabled automatically.

Manual acquisition remains available:


1. Download the original aggregated CSV from the [MININTER / SIDPOL catalogue](https://www.datosabiertos.gob.pe/dataset/denuncias-policiales-registradas-nivel-nacional-mininter). Save as `data/SIDPOL.csv`. Keep the release URL and verify its coverage and aggregation rules.
2. Obtain official district polygons from the [INEI spatial-data portal](https://ide.inei.gob.pe/). Its download section lists a district GeoPackage updated to 2023. Export the district layer in QGIS to **two-dimensional EPSG:4326 GeoJSON**, preserving the official UBIGEO and district name. Save as `data/districts.geojson`. Inspect the source layer's actual fields and use the importer flags if they differ from `UBIGEO` and `NOMBDIST`.
3. Import geometries first, then statistics:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r ingestion/requirements.txt
export DATABASE_URL='postgresql://ctc:local_only_replace_me@localhost:5432/chapatuchoro'
python -m ingestion.import_districts data/districts.geojson --check-only
python -m ingestion.import_districts data/districts.geojson --source-name 'INEI official district release URL'
python -m ingestion.import_sidpol data/SIDPOL.csv --check-only
python -m ingestion.import_sidpol data/SIDPOL.csv --source-name 'MININTER official CSV release URL'
```

**Required CSV headers:**

```text
ANIO,MES,DPTO_HECHO_NEW,PROV_HECHO,DIST_HECHO,UBIGEO_HECHO,P_MODALIDADES,cantidad
```

Comma or semicolon delimiters and UTF-8 with optional BOM are supported. Year, month and count must be integers. Missing fields, invalid periods, negative/overflowing counts, blank geographic names, invalid identifiers, oversized categories, and conflicting names for one UBIGEO reject the file. Headers are the import contract, **not a claim that every government release uses this format**. Inspect the downloaded CSV first; map differently named fields explicitly without inventing or inferring report counts. These scripts expect aggregated rows, not a CSV of individual reports.

**Required GeoJSON:** a `FeatureCollection` of `Feature` objects with `UBIGEO`, `NOMBDIST`, and nonempty `Polygon`/`MultiPolygon` geometry. Use `--ubigeo-key FIELD --name-key FIELD` to match the source. Export without a legacy `crs` member. Rings must be closed and coordinates finite and within longitude/latitude ranges. PostGIS checks polygon validity and nonzero area during import. Invalid polygons are rejected rather than silently repaired. Duplicate district features must be dissolved by official identifier before import. Coordinate bounds alone do not prove CRS correctness: independently confirm the QGIS export.

Both imports are atomic: malformed input means **zero records are committed**. CSV validation scans the entire file and reports the number of rejected rows with up to 20 line-specific errors; structural header failures and invalid geometry stop at the first error. Successful CSV imports report scanned, selected, out-of-scope and rejected rows, plus the number of distinct districts without matching geometry. Geometry imports report imported and rejected features and remaining unmatched districts. Structural or database errors exit nonzero. SHA-256, original source name and import time are retained in `import_runs` and exposed in the interface. Do not put credentials in source names or URLs.

Counts sharing `(year, month, UBIGEO, category)` within a CSV are summed. Repeated CSV checksums are skipped; revised files replace matching aggregate keys without adding the old count again. Concurrent importer jobs are serialized with a transaction advisory lock. Geometry imports upsert by UBIGEO. **Imports do not delete keys absent from a newer file**: do not mix overlapping partial and complete releases without reviewing their semantics. Full snapshot reconciliation is outside this MVP. The importer never invents counts for absent keys.

## Use the map

The initial selection is Peru and the latest imported period. Year/month options come from imported data. Select a modality to update counts, hover a department for its total, and click to focus on that department’s district map/ranking. Click a district for its count/period popup; ranking buttons provide keyboard-accessible navigation and details. On mobile, open **Filtros y ranking**.

Legend classes are fixed counts: no data, 0, 1–99, 100–499, 500–999, and 1,000+. An absent aggregate is `null` (**Sin datos**), distinct from an imported zero. Districts missing geometry remain in totals and the ranking, with a warning explaining why they are absent from the map. Source links, latest period and import hashes appear beneath the map. Loading clears earlier statistics; API failures offer retry. No external basemap tiles or API keys are required.

## Official police-station layer — Phase 2

See the [Phase 2 requirement and prompt traceability audit](../phase-2-traceability.md) for implemented scope, conditional gaps and production-source limitations.

In **Mapa → Capas**, **Calles y referencias** is enabled by default and displays an OpenFreeMap/OpenStreetMap street basemap. Zoom in for avenue and street names; the control is independent in Estadísticas and Concentración. Provider attribution stays on the map. No API key or data import is required; if the provider fails, the simple map and statistical data remain usable, with an explicit retry. See [street-map operation and limitations](../official-geographic-layers.md#street-basemap-and-real-road-names).

Enable **Comisarías básicas** to load official MININTER/PNP locations from its public ArcGIS GeoJSON service. **Denuncias SIDPOL** remains enabled by default in Estadísticas and is hidden in Concentración; the station layer has its own control in both modes. Select a brown point for its name, UBIGEO and source. Department/province/district filters apply to stations; year, month and crime modality apply only to SIDPOL. Station counts never change report totals or ranking.

Rebuild with `docker compose --profile app up --build -d`. No additional import, API key, service or database migration is needed for stations. The browser needs internet access to MININTER; loading, unavailable-service/retry and empty-selection states are separate from statistics. A completed response is reusable for 15 minutes in browser memory; an active layer is not refreshed automatically. Metadata does not declare its update date or a specific dataset license; these limitations and source links are visible in the layer controls. This is a local proof of concept, with no production deployment. See [service inventory, terms and technical decisions](../official-geographic-layers.md).

The follow-up [Denuncias source validation](../mininter-denuncias-validation.md) documents public crime-layer access, actual periods, incomplete georeferencing, repeated identifiers and unresolved reuse conditions. It is an audit with sanitized evidence, not an implemented crime-hotspot layer. Station locations and police coverage areas must not be presented as crime concentrations.

## Explore trends

**Tendencias** offers **Denuncias (CSV)** and **Delitos (fuente geográfica)** with separate source periods, categories and counting units. Both provide line, pie and territorial bar charts. Geographic trends read existing concentration aggregates, including territorially valid records without usable coordinates; they are not unique-crime totals. Choose one annual publication (2026 total/categories or one 2025 category archive) and a month range. No reimport is needed when those snapshots are already present. See [trend controls and contracts](../trends.md).

**Concentración** is now implemented as an exclusive mode inside **Mapa**, alongside the existing statistical choropleth. It supports authoritative 2026 snapshots and separate 2025 category archives, coarse density/count cells, source-specific filters, monthly analytics and clearly separated SIDPOL territorial context. Upgraded snapshots use source-weighted aggregate centers, automatic zoom-based 10 km / 1 km / 500 m detail bins (also with Todo el Perú selected), a manual **Agrupación del mapa** control, and **Consultar por radio** for real 500 m / 1 km / 2 km distance queries. Location storage requires reimporting the location groups after migration 004; changing map detail does not require another import when those groups already exist; source accuracy remains undeclared. No combined archive total, individual crime pins or risk score is generated.

For upgrades from the initial concentration importer, rerun the additive migration to support the 2025 extortion archive’s absent business identifier; the UI now displays that audit count as unavailable. Existing installations must first start PostgreSQL with `docker compose up -d --wait postgis`, successfully apply `db/003_concentration.sql` and `db/004_concentration_locations.sql`, then import the new sources and rebuild locally. Follow the [complete setup sequence and troubleshooting](../concentration.md#run-locally), which stops if any prerequisite fails. It includes full 2025/2026 backfills and smaller monthly examples. Docker build/start success does not mean the imports succeeded: check for `imported` or `unchanged` snapshot results rather than `failed`/`UndefinedTable`. Only completed imports appear as available periods; sources are not automatically substituted for missing years.

Use the header's **Mapa / Tendencias / Denunciar** navigation; Map remains the default. Both views preserve geographic and category filters. Map retains its monthly period; Trends uses a two-thumb slider for initial/final year, bounded to the imported data and ten inclusive years. Dragging applies the range once on release. The dashboard includes monthly lines with a local total/modality selector, a category pie using matching stable colors, territorial bars, available report totals and monthly/yearly changes. Hover, tap or keyboard-focus a line point for a themed gray tooltip with its exact count. Tables expose every returned value. Missing observations remain gaps, and percentage changes are unavailable when the reference is missing or zero. These are raw report counts, not population-normalized crime rates.

The **Tendencias** view needs no additional import, database migration, service or frontend dependency for an already populated nationwide database; **Concentración** requires the separate setup above. Rebuild locally with `docker compose --profile app up --build -d`. See [trends behavior and API contracts](../trends.md) and [updated architecture](../architecture.md).

## Official reporting guide — Phase 1

The third navbar option, **Denunciar**, opens `/denunciar` directly or through client navigation. The guide first asks about immediate danger, keeps the 105 shortcut visible, then offers seven incident-category choices with explained official channels. It extends the existing directory with service methods, requirements, anonymity limitations and per-source review status/date. It includes: police emergencies, extortion, Línea 100 guidance, MININTER's Central Única de Denuncias, Fiscalía's online complaint information and PNP's document-loss/theft procedure. Each resource identifies its institution, scope and official reference. PNP's digital document service is explicitly distinguished from general crime reporting, and Línea 100 from a formal criminal complaint.

Use **Llamar** to open a supported device's phone application, or **Copiar número** to copy a short code. If clipboard access is denied or unsupported, a selectable number and manual-copy instructions remain available. Calls are confirmed on the device; the application never places calls automatically. Official web links open in a separate tab.

This is a static curated directory, independent of the statistics API, database and imported datasets. It remains accessible when statistics fail, and returning to Map/Trends retains their filters. No new endpoint, service, dependency, database migration or import is needed. Chapa Tu Choro does not receive complaints or collect case details. Rebuild locally with the existing Compose command and open **Denunciar** at `http://localhost:5173`.

Direct routes work with Vite and the existing nginx SPA fallback. Static S3/CloudFront hosting needs the page-only rewrite documented in [Phase 1](../phase-1-reporting-guide.md); no cloud changes were applied. Assessment, architectural decisions and later-phase order are in [repository assessment](../phase-0-assessment.md).

Sources, review date, verification limitations and maintenance instructions: [official reporting resources](../reporting-resources.md).

## API

| Route | Response |
| --- | --- |
| `/api/health` | Process health only |
| `/api/ready` | Database connectivity; 503 if unavailable |
| `/api/explorer?year=2026&month=9[&department=04][&province=0401][&district=040101]` | National department overview or focused district view with consistent summary/ranking/map |
| `/api/trends?fromYear=2025&fromMonth=10&toYear=2026&toMonth=9[&department=04][&province=0401][&district=040101]` | Historical monthly series, category/territory distributions, availability and comparisons |
| `/api/metadata` | Latest period, all available periods, aggregate-row count, government source links, import audit entries |
| `/api/categories` | Imported modalities |
| `/api/top-districts?year=2024&month=1` | **All** districts with matching rows, ordered by count descending, UBIGEO ascending for ties |
| `/api/map?year=2024&month=1` | Official district GeoJSON with nullable report counts |
| `/api/statistics/summary?year=2024&month=1` | Regional total, districts with data, districts missing geometry, filter period/category |

Statistics/explorer/trends routes accept optional `category` (maximum 200 characters), trimmed and matched exactly. Year must be 2000–2100; month 1–12. Missing/non-numeric/out-of-range parameters return 400 ProblemDetails. Empty queries are valid 200 responses. `reports` is an integer count; `totalRows` counts stored aggregate rows, **not reports**.

Minimal API endpoints delegate to Application handlers. Expected validation errors use `Result<T>` and ProblemDetails. EF Core provides aggregate queries; parameterized Npgsql/PostGIS SQL provides geometries. Domain and Application do not depend on persistence or hosting. Centralized exception handling and structured Serilog logging are retained. Schema bootstrap remains SQL-based; do not use EF `EnsureCreated` alongside it. Existing cloud infrastructure is unchanged and not required for local execution.

## Browser origins and API entry point

Compose publishes the site on `http://localhost:5173`; access API diagnostics through that site, such as `/api/ready`. Port **5080 is no longer published by the API container**. Run the standard Compose rebuild command to recreate the service with the new port configuration; do not remove the database volume. Native .NET/Vite hot reload remains available as documented above.

CORS uses an explicit allowlist in all environments. Production defaults to no cross-origin exceptions because CloudFront serves the frontend and `/api` under the same origin. Development allows only `http://localhost:5173` and `http://127.0.0.1:5173`. Cross-origin permissions are limited to GET/HEAD and Accept/Content-Type, without credentials. For an intentionally separate HTTPS frontend, configure `Cors__AllowedOrigins__0=https://your-frontend-domain` and restart the API. Unsafe origins fail startup validation.

**CORS is not authentication:** browsers enforce its read restrictions, while curl and other clients can still call the public site's `/api` routes. Removing the direct API port and the existing Terraform IAM/CloudFront OAC configuration protect the origin entry point, not prove that requests were generated by React. No AWS configuration was applied or verified remotely. See [CORS, same-origin access and limitations](../browser-access.md).

## API protection

Every endpoint has rate limiting, including existing map/statistics and health/readiness routes. Defaults per 60 seconds: 600 requests per instance, 120 per client IP, 60 per client/endpoint, and 20 per client/endpoint for trends, concentration and radius queries, plus four concurrent requests per instance. Rejections return **429 ProblemDetails** and **Retry-After**; the interface shows an actionable message and manual retry.

Limits are configurable using `RateLimiting__*` environment variables. Counters are **per instance**, including warm Lambda environments; they do not enforce a shared multi-instance quota. Forwarded IP headers require explicit trusted proxy configuration, so unconfigured proxy visitors can share a budget. See [rate limiting configuration and deployment limits](../rate-limiting.md). No production or AWS changes are required to run locally.

## Checks

```bash
dotnet build backend/ChapaTuChoro.slnx --configuration Release
dotnet test backend/ChapaTuChoro.slnx --configuration Release
python -m unittest discover -s ingestion/tests -v
cd frontend
npm run typecheck
npm run build
npm test
```

Run real database integration tests against a **local/test PostGIS database** with permission to create disposable schemas (and enable PostGIS if needed):

```bash
export CTC_TEST_CONNECTIONSTRING='Host=localhost;Database=chapatuchoro;Username=ctc;Password=local_only_replace_me'
export CTC_TEST_DATABASE_URL='postgresql://ctc:local_only_replace_me@localhost:5432/chapatuchoro'
dotnet test backend/ChapaTuChoro.slnx
python -m unittest discover -s ingestion/tests -v
```

These tests insert explicitly synthetic fixtures only into uniquely named test schemas and remove those schemas afterward. They check actual PostGIS aggregation, category/period filters, absent statistics, missing geometry, duplicate import prevention, revised upserts and rollback. They are explicitly skipped when connection settings are absent. CI provisions PostGIS for both suites. Frontend tests mock the map renderer and API; they do not verify WebGL rendering.

For SDK installations reporting `NETSDK1226`, this environment needed `-p:AllowMissingPrunePackageData=true`. Restricted shells may also need writable `DOTNET_CLI_HOME`, `NUGET_PACKAGES`, `XDG_RUNTIME_DIR`, and `TMPDIR` locations. A normal SDK installation should build without these environment workarounds.

See [validation notes](../mvp-validation.md) for executed checks and remaining data/environment requirements. AI extraction, news ingestion, authentication, public report submission, notifications, monetization, and AWS deployment are outside this feature.

Browser regression closeout: [desktop/mobile smoke suite and real API CORS check](../browser-tests.md). Run `npm --prefix frontend run test:e2e` after installing Chromium as documented.

Phase 3 source operations: [catalogue](../sources/catalog.md) and [durable ingestion tracking](../ingestion/tracking.md). Apply `db/005_source_catalog_tracking.sql` to existing databases before using updated ingestion jobs. No frontend or public API change is required.

Search discovery: [static statistics, methodology and SEO publishing](../seo/publishing.md). Run `python -m ingestion.export_statistics` with private database credentials before building to generate national/department HTML tables from imported CSV aggregates. Configure `VITE_SITE_URL` with the real public HTTPS origin for canonical URLs and sitemap; unconfigured/preview builds are noindex. No public deployment or Google indexing is performed automatically.

Source freshness: `python -m ingestion.tracking freshness` reports each source's latest imported data period, independently of import time. See [freshness validation](../ingestion/freshness.md).
