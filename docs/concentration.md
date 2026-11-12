# Official geographic concentration — 2025 and 2026

Source/month execution history is durable. Run the [versioned migration command](operations.md#database-upgrades) before updated jobs; see [tracking setup](ingestion/tracking.md).

The existing **Mapa** view now has exclusive **Estadísticas / Concentración** representations. Switching retains the MapLibre canvas and territorial selection, replaces the choropleth with aggregate density, and preserves independent statistical filters. There is no duplicate navigation page. Station locations remain an optional contextual overlay. Tendencias and Denunciar keep their existing behavior.

This is a local integration of the [verified MININTER viewer sources](mininter-exact-viewer-source.md), not an endorsement of positional accuracy or a production deployment. Dataset-specific licensing and the business meaning of repeated source identifiers remain unresolved.

## Source authority and overlap

- **2026:** exactly one authoritative source, `SIDPOL_DELITOS_TOTAL/FeatureServer/25`. Its complete selected monthly snapshot produces `all` plus eight code-filtered categories. The total is counted from original source rows once, never by summing category layers. The current named modality-code sets are disjoint at the row level, but `all` also contains other modalities. Repeated business IDs and separately published archives must not be interpreted as independent crimes to add together.
- **2025:** one explicit category archive per selected category, occurrence year 2025 only. Any 2026 records inside those archives are excluded at extraction. A combined archive total is unavailable by design because source identities and overlaps cannot be reconciled reliably.
- Both years use the current viewer's explicit modality-code predicates for the named categories, rather than assuming archive titles or CSV category strings are identical. Out-of-predicate archive rows are reported and excluded. Source period availability comes from completed imports, not the SIDPOL CSV or guessed calendar coverage.
- The registry contains only the verified 2025 and 2026 releases. The importer also requires the requested year to be the current or previous calendar year. Future releases require explicit registry review; it never relabels an old snapshot as a new year. Historical completed imports remain readable.
- Counting unit is **source-classification rows**, not unique crimes, victims or independent police reports. `id_dgc`, when published, is used only for an audit distinct-business-ID count; repeated IDs are not blindly deleted or represented as extra verified incidents. The reviewed **2025 extortion archive omits `id_dgc`**: its distinct business-ID count is null and displayed as unavailable, never replaced by `OBJECTID` or zero. This exception is restricted to that exact registered archive; missing identifiers in other schemas or invalid values in a published identifier field still fail validation. Duplicate `OBJECTID` values across downloaded pages abort extraction for every archive.

Full source/category/year/month coverage is listed in the [viewer and historical-source assessment](mininter-viewer-tour-integration.md). Only snapshots actually imported into the target database appear in its selectors.

## Run locally

Run these commands from the repository root. Existing INEI district boundaries and the statistical schema must already be imported; for a new installation, complete the [base data setup](../README.md) first. Run the [versioned migration command](operations.md#database-upgrades) first for both new and existing databases. It preserves compatible existing data and applies all pending schema upgrades.

For a full backfill of both verified releases, use this sequence. The `&&` operators stop subsequent steps if startup, migration or either import fails:

```bash
docker compose up -d --wait postgis && \
docker compose --profile etl run --build --rm migrate && \
INGESTION_DATASET=concentration docker compose --profile etl \
  run --build --rm etl --year 2026 && \
INGESTION_DATASET=concentration docker compose --profile etl \
  run --build --rm etl --year 2025 && \
docker compose --profile app up --build -d
```

For a smaller initial import, use these scoped commands **after PostgreSQL is healthy and the migration has succeeded**, instead of the full-year imports above:

```bash
INGESTION_DATASET=concentration docker compose --profile etl run --build --rm etl --year 2026 --month 10 && \
INGESTION_DATASET=concentration docker compose --profile etl run --build --rm etl --year 2025 --month 9 --category robbery
```

Omitting month imports all available months; omitting category for 2025 checks all registered archives. Years here refer to the verified releases as of November 2026, not dynamically renamed datasets.

For native Python use `python -m ingestion.concentration --year 2026 --month 10` with the existing `DATABASE_URL`/SSM configuration and installed ingestion requirements. No extra Python or frontend package is required.

Rebuild locally using `docker compose --profile app up --build -d`, open `http://localhost:5173` and choose **Concentración**. Its year/month/category controls are independent from statistical counts. Only available imported periods are selectable. Changing year may select that year's latest available month/category, with the resulting selection shown explicitly. Missing API selections return 404 and never substitute another year.

**Scheduling/Lambda:** the same existing `ingestion.lambda_handler.handler` dispatches to this pipeline when `INGESTION_DATASET=concentration`. Use `CONCENTRATION_YEAR`, optional `CONCENTRATION_MONTH` and optional `CONCENTRATION_CATEGORY` to bound an invocation. Native/Compose CLI accepts those flags; the CLI also reads these environment defaults. Scheduled payloads cannot override trusted URLs or database secrets. The default ingestion mode remains the existing statistical ETL. Package with `scripts/package-ingestion.sh`; no Terraform resources, AWS deployment or schedules were changed. Prefer scoped monthly invocations after backfill; a full two-year/category backfill should not be assumed to finish within one Lambda timeout.

### Confirm success and recover from setup errors

The migration runner records applied checksums and makes repeat runs a no-op; an incompatible baseline or checksum mismatch fails explicitly. Import output contains per-snapshot `status: imported` or `status: unchanged`. `status: unavailable` means that source/month has no available rows and was not imported; it is not a successful snapshot. `status: failed` with an `errorType` means the invocation failed, even if Docker reports the image built or the container was created. Source/month failures now include `source`, `year`, `month`, `stage` (`extract` or `load`) and a safe `reason`; internal database details and raw source records are not printed.

- **`service "postgis" is not running`:** the migration did not run. Start the database with `docker compose up -d --wait postgis`, then rerun the migration before importing.
- **`UndefinedTable`:** a required table is missing. If the migration failed earlier, rerun the corrected sequence above. If this persists after a successful migration, check the base schema/import prerequisites and that the ETL targets the intended database. Current Compose ETL startup waits for the migration service; native Python runners require a separate successful migration command.
- **Buildx plugin warning:** the classic builder fallback does not itself indicate an import failure. Check the final ETL results separately from build/container messages.
- **2025 stopped after homicide with `ValueError`:** the first importer required `id_dgc` in the extortion archive, which does not publish it. Update the code, rerun the versioned migration command and resume the 2025 import with `--build` using the sequence above (omit the 2026 invocation if it already succeeded). To check only the corrected archive first, use `--year 2025 --month 1 --category extortion`. Previously completed source/months remain committed and exact repeats return `unchanged`. Do not fabricate business identifiers or combine archive totals to bypass this error.

After successful imports, refresh `http://localhost:5173` and choose **Concentración**; selectors list completed imports only. If the updated frontend/backend images already built and are running, recovery of the migration/import does not require another application rebuild. Do not delete the database volume or run `docker compose down -v` to fix these errors; the additive migration and idempotent imports preserve existing data.

The repaired local backfill verified on November 12, 2026 completed **81 snapshots across eight 2025 category archives**: January–December for homicide, extortion and violence; January–September for theft, robbery, fraud, gangs and drugs. The extortion archive contributed 26,255 source-classification rows and 24,638 mapped rows, with the business-ID count unavailable. Other installations still need to run their own imports. See the [executed repair and final inventory](mvp-validation.md#2025-extortion-compatibility-repair-verified-on-2026-11-12). A selection can have mapped rows but no visible map cells when all cells fall below the display threshold; this is not a failed import.

## Validation, storage and atomicity

Each source URL is restricted to the exact verified ArcGIS organization/service/layer registry. Redirects are refused. Metadata/schema and source geometry type are checked. Requests use selected fields only, 30-second timeouts, a 4 MB response cap, bounded retries for transient failures, a 250,000-row monthly cap and at most 300 ordered pages. The selected year/month must match every row. Provider count and edit metadata are checked before/after paging; truncation or changes abort the snapshot. Separate requests still do not establish a transactional provider snapshot.

The ETL reports invalid/inconsistent UBIGEO, missing/invalid geometry, coordinate-attribute mismatches, out-of-predicate classifications and unlocated/unknown textual status. Where `ESTADO_COORD` exists, only `CON COORDENADA` is eligible even if other rows contain plausible geometry. Numeric `estado` is counted in quality metadata and never interpreted as a precision guarantee. Coordinates must match their attributes and fall within broad Peru bounds. PostGIS then requires the point to be covered by its declared INEI district; missing boundaries and out-of-district points are reported and not mapped. No point is replaced by a station or district center.

Original case rows and source identifiers stay in temporary staging. Since the radius-analysis upgrade, validated coordinates are retained as **server-only location/count groups**, without case identifiers, addresses or personal fields. Committed tables contain:

- `concentration_imports`: source identity, period, URL, checksum, source/distinct-ID counts, quality metadata and import timestamp.
- `concentration_series`: categories available in each authoritative snapshot.
- `concentration_areas`: source/mappable classification-row totals by district/category.
- `concentration_cells`: legacy district/category counts on a fixed **1 km Web Mercator grid**, available for compatibility.
- `concentration_locations`: validated source coordinate pairs grouped by import/category/district with a multiplicity count and indexed PostGIS geography point. Row-level security is enabled; PUBLIC, Supabase `anon` and `authenticated` have no table access. No API returns these rows or original coordinate lists.

One source/month is replaced atomically under an advisory lock. A failed replacement rolls back its aggregates and audit update. Completed source/months in a longer CLI run remain committed independently. Checksums include normalized content and provider quality/edit metadata; the audited INEI import fingerprints and the `locations-v1` storage version also affect idempotency so changed official boundaries trigger revalidation. Exact repeats return `unchanged`. Manual geometry changes without updating their import audit are outside this automatic fingerprint guarantee. An unavailable upstream month creates no new snapshot; existing imported snapshots are historical records with visible import timestamps, not a live synchronization/withdrawal guarantee.

Raw case files are neither written to the data directory nor archived to S3 by this pipeline. The existing statistical ETL's source archive is unchanged. Logs expose counts/reasons and source keys, not raw cases or credentials. CLI failures exit nonzero with safe validation reasons and source/month/stage context; unexpected exceptions expose their type and generic guidance. Lambda failures propagate with the same safe context.

## Rendering and analytics

For reimported snapshots (`quality.ingestionChecks.locationStorageVersion = 1`), the map requests source locations grouped for its current viewport. **Agrupación del mapa** defaults to automatic: **10 km below zoom 7**, **1 km from zoom 7 to below 9**, and **500 m from zoom 9**. Manual 500 m / 1 km / 10 km settings override zoom without requiring a department selection. Display positions are count-weighted centroids of the actual source locations, rounded to 100 m in Web Mercator, rather than fixed grid centers. No original point is returned as a case pin. Only bins with at least **five classification rows** are displayed; smaller-bin rows remain in totals. This avoids publishing unsuppressed point lists but does not establish anonymity or distinct victims. Grid sizes and centroid rounding are projection dimensions, not accuracy declarations. Snapshots without this version retain the earlier fixed 10 km / 1 km aggregate-center view and disable the radius tool until reimported.

The grid distance means **side length in EPSG:3857**, not a circle radius or ground-accuracy guarantee. The UI shows that distance in the control, sidebar, legend and cell popup. The radius selector appears only after activating its separate tool. Zooming into Lima while **Todo el Perú** remains selected now loads finer cells; the territorial total and ranking still describe all Peru. There is no need to reimport snapshots that already contain location groups.

Camera `moveend` updates are debounced by 300 ms. Requests cover the visible Peru extent plus a 25% margin, expanded server-side to complete grid cells so counts do not change merely because a cell crosses the viewport edge. Cached coverage is reused for small pans. New zoom/grid/scope requests clear obsolete cells, expose loading/error/retry states and cancel obsolete fetches. Finer bins may expose more clusters, but bins below five remain hidden. The sidebar reports visible/suppressed **cell counts for the loaded area**, without presenting them as nationwide totals.

At most 5,000 eligible cells are returned. A wider detailed view exceeding this limit returns 400 with guidance to zoom in or choose a larger grouping; it never silently returns 10 km for a 500 m request. The client timeout is 25 seconds and the query timeout is 20 seconds.

### Count within a real radius

In **Concentración**, enable **Consultar por radio**, choose **500 m, 1 km or 2 km**, and click a point. The separate teal analysis circle and result use the current year/month/category/territory. A selected district/department still restricts the count, including where the circle crosses its border. `ST_DWithin` over indexed `geography(Point,4326)` evaluates distances in metres on the spheroid, summing source-location multiplicities rather than counting coordinate groups. The returned polygon is an approximate visual buffer; the predicate defines inclusion. It is not an official crime-zone boundary.

Only the requested center, analysis polygon, source/period and aggregate count are returned. Radius counts include all eligible locations in the circle, including locations whose individual display bins are hidden by the map threshold. Positive totals below five are represented as `records: null, suppressed: true`; a true zero remains zero. Counting unit remains source-classification rows, not unique crimes. The upstream precision remains undeclared: a public street label beneath the circle does not certify which street an individual record describes. The smooth heatmap is still relative visual density, not a literal radius count; the separate query result supplies that count.

Changing filters or source import timestamp invalidates the selected area and cancels obsolete requests. Changing radius reruns the count for the same chosen center. Turning the tool off/clearing the area removes its geometry without touching statistical, station or street layers. Loading, failure/retry, a 25-second client timeout and suppressed/zero results have distinct states. The endpoint has the stricter existing query rate budget.

**Upgrade:** run the [versioned migrations](operations.md#database-upgrades) and rerun the existing concentration imports to retain location groups. The checksum storage version forces the first upgrade; subsequent identical imports return `unchanged`. Replacing a source/month atomically cascades its old location groups along with its old category aggregates. Existing SIDPOL CSV data is unaffected. The feature is enabled only for snapshots that completed this upgrade. Do not put precise location exports in `data/`, logs, browser payloads or public Supabase policies.

**Server database roles:** the local `ctc` table owner can query these groups. A separate least-privilege backend role needs an explicit SELECT grant and SELECT RLS policy for that **server-only** role; use the actual configured backend role and keep it distinct from browser roles. No such production grants/policies are applied by this feature. Never grant coordinate-table access to PUBLIC, `anon` or `authenticated`.

Density and count circles transition smoothly by zoom using viewport aggregates at the selected resolution. A cream land surface from the existing official boundaries separates Peru from the surrounding map; it carries no statistical values. The amber-to-burgundy heat scale has stronger contrast. The centroid-based detail circles use fixed count-color bands (5, 25, 100, 500 and 2,500) and square-root sizing bounded for readability, normalized to the largest cell in the loaded area. The visual radius also grows smoothly with camera zoom: the largest loaded group is 18 px at zoom 9, about 29 px at zoom 12 and 41 px at zoom 15, capped at about 48 px from zoom 18. The numeric legend uses the same count-and-zoom curve during the animation. This visual scaling does not change aggregation size, source counts or the independent metric query. Circle size must therefore be interpreted using the current legend rather than compared directly between filters or zoom levels; it does not represent a geographic radius. The legend changes from relative intensity to numeric size examples as the user zooms; mobile uses a compact version. Hover/tap popups show the actual cell count, grid size and selected geographic reporting period. The SIDPOL layer checkbox, choropleth fill, statistical legend and statistical popups are hidden in concentration mode; returning to Estadísticas restores the previous SIDPOL toggle state. Police stations and **Calles y referencias** remain independently selectable. When the street basemap is ready, its roads/buildings replace the neutral land surface and its text labels remain above density; aggregate counts and cell positions are unchanged. Street names are geographic context, not street-level crime attribution. See [street basemap details](official-geographic-layers.md#street-basemap-and-real-road-names). Administrative outlines remain as geographic context, without additional statistical values. Selecting an aggregate circle does not select the district underneath it. Source-processing/loading states and errors are separate, with retry and no stale filter results. Density intensity is a relative visualization that depends on zoom and rendering parameters, not a police-designated crime-zone boundary or a risk probability.

The sidebar provides source-scoped source/mappable counts, exclusion context, visible/hidden-cell totals, a monthly line with explicit missing-month gaps, a geographic table and snapshot provenance. Data quality includes whole-national-snapshot row/distinct-ID counts; these are labeled separately from the selected territory/category. No cross-year percentage-change calculation is made across heterogeneous releases.

See [validated counting units and cross-source limits](data-counting-units.md) for the official CSV dictionary, current geographic classifications and reconciled real-data counts.

## Cross-source insights: implemented and excluded

**Implemented:** aggregate join on **same year, month and UBIGEO-derived territory** between the concentration source and imported SIDPOL. The contextual column sums **all CSV modalities**, explicitly labeled separately from the selected geographic category. Missing statistical observations stay null. This supports side-by-side territorial investigation and helps identify places where available source views differ. INEI provides a second independent geographic consistency check and official district names.

**Not justified:** adding geographic rows to SIDPOL totals, treating their difference as missing crimes, computing a geocoding coverage percentage from the CSV denominator, inferring individual event matches from aggregate codes, estimating crime risk, or asserting causality/correlation from these differently defined sources. Occurrence versus registration periods, classification coverage, repeat identifiers and release completeness need reconciliation first. No station-proximity or public risk score was inferred; stations remain context only.

## Backend contracts and protection

- `GET /api/concentration/metadata`: `{setupRequired, available:[{year,month,category,label,source,importedAt}]}`. An older database without the migration returns setup guidance through metadata rather than breaking the statistical API.
- `GET /api/concentration?year=2026&month=10&category=all[&department=15][&province=1501][&district=150101]`: source selection, scoped source/mappable/visible counts, aggregate cells, territorial context, sparse monthly observations, grid/suppression policy and national snapshot quality.
- `quality.distinctSourceIdentifiers` is a nullable number: null means the source does not publish the reviewed business identifier, not zero distinct crimes. Existing numeric values keep their previous meaning.
- `GET /api/concentration/cells?year=2026&month=10&category=all&gridMetres=500&west=-77.2&south=-12.3&east=-76.8&north=-11.8[&department=15]`: source selection, actual grid size, minimum count, aggregate cells, visible-record count, suppressed-cell count and snapped coverage rectangle. Finite ordered bounds must lie within the broad Peru rectangle; supported sizes are 500/1000/10000 m. The original `/api/concentration` contract remains compatible for summaries and older clients.
- `GET /api/concentration/radius?year=2026&month=10&category=all&longitude=-77.033&latitude=-12.12&radiusMetres=500[&department=15]` returns the aggregate metric-radius result, suppression state, query buffer, provenance and accuracy note. Inputs require a finite point in the broad Peru bounds and one of the three supported radii; unavailable spatial storage returns 503 guidance.
- Invalid dates, categories or inconsistent geographic identifiers return 400 ProblemDetails; unavailable snapshots/geography return 404; missing setup for a query returns 503. Filters are parameterized and geographic existence is checked using existing options.
- Domain owns aggregation/source policy constants; Application owns validation/use cases/contracts; Infrastructure performs repeatable-read PostGIS aggregate queries; Minimal endpoints remain thin. Existing Serilog, exception handling and CORS remain intact.
- All routes use the existing global/client/concurrency rate limits. Concentration, viewport-cell and radius queries use the stricter `TrendsPermitLimit` (default 20/minute) budget; metadata retains the ordinary endpoint budget. Limits remain per process/Lambda instance.

See [executed checks](mvp-validation.md) for real-data imports, source exclusions, tests and browser results. Initial MVP validation used a disposable local database; the subsequent extortion compatibility repair also validates the local development backfill. These checks do not claim production readiness or apply production migrations/imports automatically.

## Geographic navigation limits

The shared statistics/concentration canvas restricts panning to the geographic rectangle visible in the initial national framing, with its minimum zoom set to that framing. The rectangle is calculated from INEI national bounds and the actual canvas size, including the existing padding and neighboring-country context, and is recomputed on resize. Before boundaries load, the broad Peru camera extent supplies a fallback. Neighboring countries remain in the street basemap; no data or map tiles are masked or deleted. Navigation within Peru, territory focus and returning to the national view are preserved. The map stays north-up without tilt or repeated worlds so rotated/tilted views cannot expose a wider region.
