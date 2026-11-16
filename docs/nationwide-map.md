# Nationwide map and department navigation

The explorer starts with the whole of Peru, using INEI's official department polygons (25 department-level units including Callao). Hovering over a department shows its name, the selected period and the sum of registered reports for that department. Clicking it loads only that department's district polygons and ranking and fits the map to their bounds. Use **Volver a Perú**, the department filter, or the accessible ranking to navigate.

Year/month/category filters apply to both levels and to a selected province. The legend uses department count classes (1–999, 1,000–4,999, 5,000–9,999, 10,000+) in the overview and district classes (1–99, 100–499, 500–999, 1,000+) when focused; both distinguish missing data and explicit zero. Department selection is retained when those filters change. Changing filters clears stale values; late responses cannot overwrite a newer selection. An absent source aggregate is **Sin datos**, distinct from a reported zero. Missing district geometries are counted and reported without dropping their statistics from totals/rankings. Map geometry is simplified by PostGIS for rendering; statistics always use original imported aggregates.

Department membership is the first two digits of the official district UBIGEO. This also sums MININTER's separate Lima Metropolitana / Región Lima labels under department code 15, rather than treating those text labels as different department boundaries. District membership is the full six-digit UBIGEO. The province filter uses the first four UBIGEO digits and the imported province names. It shows the districts belonging to that province, without requiring a separate province polygon table. Province options are constrained to the selected department and remain available across empty period/category filters. Changing department resets province selection.

## What the previous data contained

The original CSV and raw INEI WFS response were already nationwide, but the importer, normalized GeoJSON, backend and UI explicitly selected only Lima Province and Callao. A previously ingested database therefore needs a new ETL run; restarting containers alone cannot recover records that were never inserted.

The new ETL imports all valid district statistics and all official district geometries. It also requests the separate INEI `Interoperabilidad:ig_departamento` layer and archives its raw response, normalized GeoJSON and provenance alongside the other inputs. No boundaries are invented or generated randomly.

National CSV imports use the audit kind `sidpol-national`. A prior `sidpol` receipt from the Lima-only importer does **not** cause the nationwide import of the same CSV hash to be skipped. Existing district keys are upserted; counts are not added twice. Old audit entries are retained. The UI warns about limited coverage until the national import is recorded.

The official CSV has a province-name inconsistency for UBIGEO 160801 in November/December 2024. The ETL reports `province_label_variant_groups`, retains original downloads, and sums counts by UBIGEO/year/month/category. Province text differences do not discard reports. Conflicting department/district names within one district-period still reject the input. The retained scalar province label on an aggregate is one of the source labels, not a claimed correction of the government data.

## Upgrade an existing local database

From the repository root, with Docker running:

```bash
docker compose up -d postgis
docker compose --profile etl run --build --rm migrate
docker compose --profile etl run --build --rm etl
docker compose --profile app up --build -d
```

Then refresh <http://localhost:5173>. The upgrade is additive: it creates `department_boundaries` and an index. It does not delete existing reports, boundaries or audit entries. Do not remove the database volume.

The [versioned migration runner](operations.md#database-upgrades) handles fresh and existing compatible schemas. Existing production schemas must receive the reviewed additive SQL upgrade separately, with appropriate SELECT privileges for the API and SELECT/INSERT/UPDATE privileges for the ingestion role on `department_boundaries`. Rebuild the ingestion Lambda ZIP when deploying the changed ETL. No production migration or AWS deployment is performed by this code change.

## API

`GET /api/explorer?year=2026&month=9[&category=...][&department=04][&province=0401][&district=040101]`

- Omit `department` for national department polygons and a department ranking.
- Supply a two-digit department UBIGEO for that department's district polygons/ranking.
- Optionally supply a four-digit province UBIGEO within that department. Totals, district ranking and geometries all use the same province prefix. Province without a department, mismatched parents and malformed codes return 400; unknown provinces return 404.
- The response contains `period`, `category`, `department`, `province`, `district`, `level`, department/province/district options, `summary`, `ranking`, and a GeoJSON `map`.
- Each feature has `code`, `name`, `level` and nullable `reports` properties. Ranking contains districts/departments with matching report rows, including rows reporting zero.
- Invalid code formats return 400 ProblemDetails. An unknown department returns 404. Valid departments without period/category data return 200 with an empty ranking and null counts on their polygons.
- Summary, ranking and map use a single repeatable-read snapshot so an ETL commit during a request cannot mix old and new totals.
- Existing district endpoints remain available and now cover the imported nationwide dataset. The UI uses the scoped explorer endpoint to avoid downloading every district polygon for the initial national map.

## Scoped district GeoJSON

`GET /api/map?year=2026&month=9&department=15[&province=1501][&district=150101][&category=...]`

As of 2026-11-14, `department` is required. Calls without it return 400 ProblemDetails; use `/api/explorer` without a department for the national overview. Province/district codes must belong to their selected parents, using the same format validation as the explorer. This intentionally replaces the old nationwide full-resolution response; the frontend already uses `/api/explorer`, and its unused legacy map client was removed.

The response retains `type: FeatureCollection` and feature properties `ubigeo`, `district`, nullable `reports`. A single parameterized SQL query restricts both geometry and report aggregation to the chosen area. PostGIS simplifies only the returned geometry using `ST_SimplifyPreserveTopology(geom, 0.0005)` and six decimal places, matching the explorer's visual tolerance in EPSG:4326 degrees. It does not change stored boundaries, official counts or missing-versus-zero semantics. The tolerance is for display, not a certified positional accuracy in metres. GeoJSON may contain Polygon or MultiPolygon geometry.

Polygons without observations remain present with null counts. Scopes with no imported polygons, including unknown well-formed codes, return an empty collection; this lightweight endpoint does not resolve the explorer's geographic options/404 semantics. Use explorer summaries/rankings to identify statistics with missing geometry.

The [local payload evidence](evidence/scoped-map-payloads-2026-11-14.json) covers every imported department/province plus representative districts for September 2026. The largest scoped map was 609,614 bytes; national explorer/rate-map responses were about 1.47 MB. All measured responses, including estimated proxy-envelope overhead, were below a conservative 5 MB budget. This is measurement of the current dataset, not a hard byte cap or an AWS execution test: repeat after boundary/contract changes and before release.

Separating cacheable boundary files from period-specific statistics or introducing vector tiles remains a later optimization. This fix adds no new endpoint, dependency, migration, deployment or public raw-location export.

Absolute counts are not normalized by population and do not directly measure individual risk. No missing data is synthesized.

## Continuous map transitions

The map viewport keeps its position/size while loading messages overlay it. The same MapLibre instance and page remain mounted through country, department and province navigation. Country geometry stays available as a background while requests run. On department focus, the camera moves to that department and the remaining country progressively fades to zero opacity. Returning to Peru reverses the fade; changing departments reveals the country context during the movement before isolating the new selection. Province selection fits the bounds of its actual district geometries and fades previous detail out.

Incoming districts fade in while outgoing geometry fades out in a neutral color. Background/outgoing geometry is not used for stale statistics or hover counts. Superseded animations and HTTP responses are cancelled/ignored, and changing only year/month/category preserves the user's zoom. Operating-system reduced-motion preferences disable animated camera/opacity transitions.

This update requires rebuilding the API/frontend but **no database migration or ETL rerun** if nationwide data is already imported. The earlier national upgrade is still required for installations that only have Lima/Callao data.

## District selection and loading placeholders

The **Distrito** selector lists all imported districts of the chosen department; selecting a province narrows that list. Names and six-digit codes come from INEI geometry or MININTER records, including districts with geometry but no reports and districts with reports but no geometry. Options are independent of period/category and the selected district. Repeated district names are distinguished by UBIGEO. Changing department clears province and district; changing province clears district. Period/category changes preserve the district. Clicking a district or its ranking row selects the same filter and focuses its official polygon using cached geometry. Closing the district information clears the district filter.

`district` is an optional six-digit ASCII UBIGEO. It requires `department` and must match it and any selected `province`; malformed or mismatched parents return 400 ProblemDetails. Unknown district identifiers within the scope return 404. The database applies exact district equality to the summary, ranking and geometry queries within the same snapshot. Missing geometry preserves counts and ranking with a visible warning. No schema migration or ETL rerun is required for an already nationwide import.

Totals and ranking show animated placeholders while loading. The map uses neutral context during camera movement; if the API remains pending after `moveend`, a centered skeleton signals the wait. It disappears on response or error, with the existing error/retry and empty states preserved. The map canvas is retained and its viewport does not shift. Skeleton pulse and camera/fade animations respect reduced-motion preferences. Request cancellation and scope keys prevent old responses from supplying figures for a new selection.
