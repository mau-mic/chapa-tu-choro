# MININTER viewer tour, historical availability and integration proposal

> Historical source investigation: the observations and proposed next steps below describe the recorded investigation date. For the implemented integration and current limits, read [concentration](concentration.md), [methodology](methodology.md) and the [prelaunch review](aws-review.md).

Checked **2026-11-12, America/Lima**, using the [exact public viewer](https://aplicaciones.mininter.gob.pe/mapadeldelitogeoreferenciado/) supplied by the user, Chromium and public ArcGIS metadata/aggregate queries. No application feature or production integration was implemented.

**Conclusion:** a native crime-concentration view is technically feasible with the existing MapLibre stack. Earlier years exist in separate sources, but the active heatmap is 2026-only and the archives do not form one complete, comparable historical point dataset. Preserve the existing SIDPOL statistical map and trends.

## Historical data actually found

Anonymous public catalogue search returned 31 indexed items for MININTER organization `lMIZrqiJkpM748BR`, including eight category archives and the active service. Service-definition/code packages were not downloaded. Grouped year/month count queries verified the periods below. Counts are source rows, not verified unique incidents or guarantees of exhaustive coverage.

| Public service / layer | Observed occurrence periods | Rows by year |
| --- | --- | --- |
| [SIDPOL_DELITOS_TOTAL / 25](https://services6.arcgis.com/lMIZrqiJkpM748BR/arcgis/rest/services/SIDPOL_DELITOS_TOTAL/FeatureServer/25) | January–October 2026; explicit earlier-year query returned **0** | 2026: **487,787** |
| [EXTORSION_IDSUBTIPO_10508 / 1](https://services6.arcgis.com/lMIZrqiJkpM748BR/arcgis/rest/services/EXTORSION_IDSUBTIPO_10508/FeatureServer/1) | January–December 2025; January–February 2026 | 2025: **26,255**; 2026: **2,366** |
| [HOMICIDIO_IDMODALIDAD_1010102_AL_1010130 / 2](https://services6.arcgis.com/lMIZrqiJkpM748BR/arcgis/rest/services/HOMICIDIO_IDMODALIDAD_1010102_AL_1010130/FeatureServer/2) | January–December 2025; January–February 2026 | 2025: **2,701**; 2026: **383** |
| [VCM_IDTIPO_504 / 0](https://services6.arcgis.com/lMIZrqiJkpM748BR/arcgis/rest/services/VCM_IDTIPO_504/FeatureServer/0) | January–December 2025; January–February 2026 | 2025: **300,202**; 2026: **45,807** |
| [HURTO_IDSUBTIPO_10501 / 2](https://services6.arcgis.com/lMIZrqiJkpM748BR/arcgis/rest/services/HURTO_IDSUBTIPO_10501/FeatureServer/2) | January–September 2025 | **131,355** |
| [ROBO_IDSUBTIPO_10502 / 3](https://services6.arcgis.com/lMIZrqiJkpM748BR/arcgis/rest/services/ROBO_IDSUBTIPO_10502/FeatureServer/3) | January–September 2025 | **48,085** |
| [ESTAFA_IDSUBTIPO_10506 / 4](https://services6.arcgis.com/lMIZrqiJkpM748BR/arcgis/rest/services/ESTAFA_IDSUBTIPO_10506/FeatureServer/4) | January–September 2025 | **27,060** |
| [PANDILLAJE_IDSUBTIPO_40101 / 6](https://services6.arcgis.com/lMIZrqiJkpM748BR/arcgis/rest/services/PANDILLAJE_IDSUBTIPO_40101/FeatureServer/6) | January–September 2025 | **284** |
| [MICROCOMERCIALIZACION_IDMODALIDAD_1120341_5070112_5070122 / 1](https://services6.arcgis.com/lMIZrqiJkpM748BR/arcgis/rest/services/MICROCOMERCIALIZACION_IDMODALIDAD_1120341_5070112_5070122/FeatureServer/1) | January–September 2025 | **3,494** |

The public `SIDPOL_DELITOS` catalogue entry resolved to a service with no advertised accessible layers, so it supplied no queryable historical layer in this investigation. The active service advertises only layer 25. No TimeSlider or Filter widget was declared, and no year selector was observed during the tour. Historical sources were found through the public catalogue, not a hidden UI selector.

The separately audited [older `ogc/denuncias` service](mininter-denuncias-validation.md) has substantial 2018–June-2025 data and a sparse earlier occurrence tail, with severe location-status/coverage limitations. That older audit was not repeated here. It is not interchangeable with the active viewer or evidence of a complete 2018–2026 hotspot history. The existing imported SIDPOL CSV remains the appropriate historical statistical source.

## Tour: observed versus merely configured

| Feature | Evidence / result | Value for Chapa Tu Choro |
| --- | --- | --- |
| Heatmap and circle aggregates | Rendered and visually inspected at national scale; density checkbox toggled off/on successfully | Separate concentration mode with an explicit relative-density legend |
| Department summary | Bar chart rendered; heading identifies georeferenced records, not population risk | Source-scoped geographic ranking, independent from CSV totals |
| Layer list | Opened; HURTO enabled successfully alongside active layers | Reuse existing layer controls and a source-specific category selector |
| Geographic search | Department/province/district/station options observed; AREQUIPA suggestion selected, camera focused the department and showed its official boundary metadata | Searchable geographic controls and keyboard navigation |
| Info Summary | Opened; station count **1,330** displayed; station, jurisdiction, school and municipal-occurrence categories visible | Keep contextual layers distinct from crime statistics |
| Legend | Opened; heatmap High/Low and proportional circle counts visible | Explain density and displayed aggregate counts separately |
| Cluster popup | User screenshot shows a three-feature cluster and zoom/browse controls; configuration enables cluster summaries. Automated map click did **not** confirm the popup | Proposed aggregate-only popup with count, period/source and zoom; not a verified exact replica |
| Attribute table | Panel and layer tabs opened; configuration enables extent filtering and export | Accessible aggregate tables are useful; no raw-record export needed for the MVP |
| Measurement / basemap gallery | Panels opened, controls observed; measurement accuracy and basemap switching not tested | Optional later features; basemap-provider terms need independent review |
| Print / Add Data | Options panels opened; no print job, export, file or URL submission executed | Defer; arbitrary data upload and external services are outside the first integration |
| Mobile | At 390 px, no horizontal overflow and the layer control remained visible. After desktop-to-mobile resize, the map showed an off-country viewport and the table occupied much of the screen | Preserve our responsive controls and refit the current territory after layout changes |

The visible header states **Fecha de corte: 31.10.2026**, while the summary description says **Actualizado al 03.11.2026**. These are distinct labels, consistent with treating reporting cutoff and publication/update separately. They must not replace queried source availability.

A cluster is a grouping of displayed source features, not a formally delineated crime zone. A report may also appear in the heatmap and a category layer at the same time; counts from overlapping layers must not be added as independent incidents.

Public configuration contains some old Info Summary references to layer 1, while the active service now advertises layer 25. Do not copy all widget URLs or assume every declared entry still works. The summary chart declares the active heatmap layer as its data source, with selection enabled and extent filtering disabled; panning alone should not be assumed to recompute its ranking.

## Additional active-source checks

- Current layer: **487,787 rows**, **421,196 distinct `id_dgc` values**, **0 null `id_dgc`**. Therefore IDs repeat, but multiple classifications and counting semantics remain unresolved. Do not blindly deduplicate by ID or call every row a unique crime.
- `estado` groups: **1 → 125,368**, **2 → 362,419**. No domain/description defines these values in the inspected schema. Do not infer that one means precise, verified or geocoded, or apply the old source's `estado_coord` rules.
- A count query found **0** null, zero or out-of-world-range latitude/longitude attributes. This does not establish true incident locations, polygon containment, precision or geometry correctness. The older source demonstrated why plausible numbers alone are insufficient.
- This tour did not download standalone incident samples or archive packages. The browser loaded the normal public viewer; no incident response bodies, raw records, exact incident locations or full screenshots were retained in repository evidence.
- Specific reuse conditions and accuracy/identity definitions remain unconfirmed. Public access is not a dataset-specific redistribution license. The active item's license fields were empty in the provenance check; category archives need their own reuse review.

## Recommended integration

### First bounded implementation

Add **Concentración** as a mode inside the existing Mapa view, keeping **Estadísticas** as default. Retain Tendencias and Denunciar navigation, filters, INEI framing, SIDPOL totals and station functionality.

1. Start with the exact active source and a selected 2026 month/territory. Publish its independent category and period availability rather than borrowing the CSV's selectors. Distinguish source rows from unique reports until the counting unit is confirmed.
2. Render aggregated locations with MapLibre heatmap/circle layers; offer count/period/source summaries and zoom on aggregate selection. Heatmap blur and intensity are visualization parameters, not official crime-zone borders or individual risk scores. Clearly label any grid centroids as aggregates, not incident pins. Do not expose exact addresses or raw case details.
3. Use the existing Python ETL and PostGIS for bounded, auditable extraction/validation/aggregation. Preserve source/item/layer IDs, category-code predicates, cutoff, retrieval time, rejected/unlocated counts and snapshot provenance. Fixed allowlisting must recognize this verified ArcGIS organization/service path, not every `arcgis.com` tenant. Pagination, source-change detection and identity/snapshot reconciliation require explicit design; current `monthly_reports` cannot store these locations.
4. Serve bounded aggregates through Application use cases and Infrastructure persistence adapters. Keep Minimal endpoints thin, validate time/geography/category/viewport, use Result/ProblemDetails and the existing rate/concurrency limits, cancellation and structured logging. Do not send all 487k records to each browser or turn every map movement into an unbounded upstream query.
5. Keep missing/unavailable periods explicit. A 2025 or 2024 selection must not silently show 2026 points. Existing statistical choropleths remain available when concentration data is unavailable.

MapLibre natively supports [heatmaps](https://maplibre.org/maplibre-gl-js/docs/examples/create-a-heatmap-layer/) and [clustered GeoJSON](https://maplibre.org/maplibre-gl-js/docs/examples/create-and-style-clusters/); no Esri UI SDK or new mapping library is needed. Rendering can use our existing design. Metadata advertises aggregation capabilities, but no production spatial-binning API contract was validated in this tour; do not treat a capability flag as a working solution.

### Historical follow-up

Build an explicit source/category/period registry for the 2025 archives after validating each schema, identity, coordinate eligibility and terms. Select one authoritative snapshot for each period/category; never append overlapping 2026 archive rows to active-source rows as additional incidents. Preserve original category codes and source provenance. Do not produce cross-source trend or geocoding-rate comparisons until definitions reconcile.

Request compatible, documented historical georeferenced releases from MININTER if a consistent complete series is required. Meanwhile, retain the existing CSV-based historical trends. Do not spread district totals over random points, station coordinates or fabricated geographic cells to manufacture hotspot history.

### Files and boundaries likely affected when implementation is authorized

- `ingestion/`: separate georeferenced-source extractor/validator and scoped import/audit integration, alongside the existing statistical ETL.
- `db/` and backend Infrastructure persistence: deliberately designed source-snapshot/aggregate schema and spatial indexes; no changes to existing statistical counting rules.
- Backend Application: source-availability and concentration query contracts/handlers/ports; API: thin routes using existing protection and error conventions.
- `frontend/src/lib/api.ts`, hooks, `MapLayerControls.tsx`, `CrimeMap.tsx`, `App.tsx` and styles: source-specific controls and separate heatmap/aggregate sources on the existing map instance.
- Tests/docs: count reconciliation, identity/overlap handling, unavailable periods, missing/invalid locations, no stale responses, query bounds/rate limits, map layer isolation, responsive/keyboard behavior and real-browser checks.

No schema or application changes, cloud resource, print service, authentication or news ingestion are required merely to complete this investigation. Deployment choices stay independent of the proposed use cases.

## Evidence and practical limits

[Sanitized evidence](evidence/mininter-viewer-tour-history-2026-11-12.json) records catalogue items, aggregate queries/month counts, public widget declarations and browser-action outcomes. Visual screenshots stayed temporary and were inspected without bundling the vendor UI/basemap into the project. The browser did not sign in, grant geolocation, browse individual records or submit changes.

All **33 evidence-consistency checks passed**, covering period/count expectations, archive query success, browser outcomes and exclusion of raw feature collections/embedded images from the saved evidence. Source counts can change. Catalogue scope is the anonymously visible index for the identified organization, not every dataset MININTER may hold. Separate requests do not share a database transaction. Application builds/tests were not rerun because this task changed documentation/evidence only. See [exact viewer provenance](mininter-exact-viewer-source.md) and the earlier [source audit](mininter-denuncias-validation.md).
