> Historical record, retained on 2026-11-13. Use the [current documentation index](../README.md) for setup and current behavior. Statements and test results below describe the date recorded, not current validation.

# Phase 2 requirements and prompt traceability

Audit date: **2026-11-12, America/Lima**. This is a code/document/evidence audit, not a new test run, live-source availability check or production approval.

## Scope and status rules

The original user-supplied roadmap defines Phase 2 as **Geographic integration proof of concept**: investigate official geographic services, deliver a documented inventory, validate one usable layer, provide visibility controls/attribution/error handling/tests, start with police stations, and do not assume crime heatmap endpoints exist. Module B describes a broader target; subsequent user requests explicitly extended this implementation.

**Implemented** means code and recorded validation support the behavior. **Partial** identifies a specific unmet portion. **Unverified** means evidence is insufficient, not that implementation failed. **Deferred/conditional** is not an unmet original POC requirement. User prompts below are paraphrased and grouped where several messages refine the same request; they are not fabricated verbatim quotations or a complete transcript of assistant replies.

## 1. Original Phase 2 acceptance requirements

| ID | Original requirement | Implementation and evidence | Assessment / missing portion |
| --- | --- | --- | --- |
| P2-01 | Investigate official geographic services and document inventory | [Source inventory](../official-geographic-layers.md): MININTER/GEOIDEP catalogues, WMS capabilities, REST metadata, WFS empty response, alternate WMS 403; [exact viewer provenance](../mininter-exact-viewer-source.md) | Implemented. Failed/incompatible services are documented rather than treated as integrations. |
| P2-02 | Validate one usable official layer | Fixed MININTER basic-station REST layer 2 in [policeStations.ts](../../frontend/src/lib/policeStations.ts); bounded pagination, geometry/schema/UBIGEO checks; [recorded live verification](../mvp-validation.md#phase-2-official-geographic-layer-verified-on-2026-11-11) found 1,330 points | Implemented technically. Specific redistribution permission, accuracy/completeness and station update date remain unverified. Public query access is not proof of unrestricted reuse. |
| P2-03 | Layer visibility controls | [MapLayerControls](../../frontend/src/components/MapLayerControls.tsx), [App](../../frontend/src/App.tsx), [CrimeMap](../../frontend/src/components/CrimeMap.tsx): independent streets/statistics/stations, exclusive concentration mode, neutral fallback when all are off | Implemented; [neutral-map evidence](../evidence/neutral-map-validation-2026-11-12.json). Exclusivity of statistics/concentration follows the later explicit user request. |
| P2-04 | Source attribution | Station source/catalogue/terms links and consultation time in MapLayerControls; basemap credits in [streetBasemap.ts](../../frontend/src/lib/streetBasemap.ts); concentration source/import provenance in panel and trends | Implemented. Undeclared dates/licenses are identified as unknown. |
| P2-05 | Basic error handling | [Station hook](../../frontend/src/hooks/usePoliceStations.ts), source parsers, street adapter, concentration hooks, backend Result/ProblemDetails; cancellation, timeout, retry, empty states and isolated failures | Implemented; tests and browser failure/recovery records exist. Does not establish upstream uptime guarantees. |
| P2-06 | Tests where practical | Station parser/hook/control tests, CrimeMap interaction tests, PostGIS concentration/radius/cells/trends integration tests, ingestion tests; [validation history](../mvp-validation.md) | Implemented. Latest recorded totals: 143 backend / 97 frontend; 55 ingestion tests passed earlier. No single final combined run or remote CI success is claimed. |
| P2-07 | Start with an officially documented police-station layer | Catalogue-linked `ogc/lineabase/MapServer/2`, followed by additional separately investigated sources | Implemented. Current implementation and historical validation record support the station-first POC. |
| P2-08 | Do not assume a crime heatmap endpoint exists | Viewer configuration traced to an actual point FeatureServer; application renders derived aggregates using MapLibre | Implemented. No invented heatmap API or authoritative crime-area polygon is claimed. |

**Original POC conclusion:** all six delivery bullets, plus the two explicit guardrails, have implementation/evidence coverage. This supports closing the functional POC with recorded limitations; it does not establish public-production licensing or statistical/positional guarantees.

## 2. Broader Module B requirements and guardrails

| Requirement | Match | Remaining limitation / classification |
| --- | --- | --- |
| Investigate WMS, WFS, REST, downloads, official datasets and supported tiles | Inventory distinguishes WMS raster from feature services; REST stations/concentration, existing official INEI downloads, and the reviewed street tile adapter are implemented | Investigated usable paths, not every advertised service. A functioning WFS integration is not delivered or required by the POC. |
| Consider MININTER, Mapa del Delito, INEI DataCrim and GEOIDEP | MININTER/viewer/GEOIDEP evidence; INEI boundary integration | No DataCrim-specific adapter/audit established. It was a starting point, not a mandatory additional integration. |
| Respect published endpoints/access controls | Fixed/allowlisted URLs, public REST contracts, no token bypass; unavailable/protected alternatives excluded | Dataset-specific reuse terms remain unresolved. An access audit is not a blanket legal authorization. |
| Distinguish images, features, aggregates and individual incidents | Source guides, [counting-unit audit](../data-counting-units.md), separate CSV/geographic contracts and explicit row units | Unique case/complaint identity and source precision remain unverified. |
| Use existing map library and architecture | Existing MapLibre canvas; .NET four layers; separate Python ETL; no additional mapping SDK/service | Implemented. |
| Visibility and opacity controls where useful | Visibility implemented; zoom/focus fades and fixed layer opacity implemented | **Conditional gap:** no user-facing opacity slider. Animated/fixed opacity is not an opacity control. Decide whether overlapping station/street/statistical layers require one. |
| Legends, dates, coverage and compatible filters | Statistical/density legends, station key, geographic filters, source-specific periods, source/import timestamps and unknown station date | Implemented with declared uncertainty. Catalogue distribution is not certified completeness. |
| Preserve the working map on source failures | Independent data sources, fallback geography, retry, retained canvas | Implemented; latest all-off/failure regression verified. |
| Additional target layers | SIDPOL, INEI, basic stations, concentration implemented | Family stations, jurisdictions, police sectors and other public-safety layers are not integrated. They were not required to deliver one station-layer POC. News belongs to later phases. |
| Conceptual source/layer models and suggested endpoints | Static source descriptors, import audit tables and purpose-specific APIs exist | A consolidated source catalogue and `/api/geographic-layers` do not exist. The roadmap calls these conceptual/future APIs; catalogue work belongs primarily to Phase 3. |

## 3. Phase 2 prompt-to-implementation ledger

| User request / follow-up | Requirement match | Implementation / validation | Status and exact limit |
| --- | --- | --- | --- |
| Investigate documented OGC or supported ArcGIS services, coverage, restrictions and technical requirements | P2-01/02/08 | Inventory and source audits | Implemented; usable WFS and specific reuse license not established. |
| Prioritize police-station proof of concept; reuse the map without breaking SIDPOL | P2-02/03/07 | Station adapter/hook, independent source/layer, cached territorial filtering, map tests | Implemented. Stations are contextual installations, never added to complaint counts. |
| Explain integration and affected files before coding | Workflow + P2-01 | Design/affected-file sections in source investigation documents | Design is documented. Exact timing/completeness of every original pre-code explanation is not independently established by repository artifacts. |
| Continue after Docker becomes available; build/test with PostGIS | P2-06 | Historical SDK/PostGIS verification and later backend integration runs in validation history | Implemented locally. Remote CI and target production execution are not established. |
| Make the pie tooltip match the line tooltip | Extended UI quality | Shared [ChartTooltip](../../frontend/src/components/ChartTooltip.tsx), Trends tests | Implemented for both CSV and geographic dashboards. |
| Explain which official sources were and were not queried | P2-01/04 | Station inventory, older Denuncias audit, exact viewer correction, viewer tour | Implemented; source histories are separate and must not be combined. |
| Validate the crime-area source and whether it was the supplied MININTER portal | P2-01/02/08 | [Exact viewer/source chain](../mininter-exact-viewer-source.md) | Implemented. Its displayed heatmap is a renderer over records, not an official crime-zone boundary. |
| Tour the portal and investigate past years/features | P2-01/02 | [Viewer/history assessment](../mininter-viewer-tour-integration.md), sanitized evidence | Implemented within recorded tour scope. Some vendor widgets were observed but not fully exercised; they were not requested as native features. No verified complete pre-2025 geographic series. |
| Integrate current/previous year as a replacement representation, avoiding feature overlap | Extended P2-02/03/05 | [Concentration ETL](../../ingestion/concentration.py), SQL 003/004, application/repositories, exclusive map mode | Implemented for registered 2026 active and 2025 category sources. 2025 combined total and unsupported years deliberately unavailable. |
| Support analytics and evaluate crossing existing sources | Extended data integrity | Territorial/month context join; source/unit audit; separate trends | Aggregate context implemented. Individual record matching, deduplicated combined totals and unreported-crime estimates are unsupported by supplied data. |
| Check import output, explain failures, repair the 2025 failed dataset and document reruns | P2-02/05/06 + ETL extension | [Extortion repair evidence](../evidence/extortion-import-repair-2026-11-12.json), source-specific missing-ID handling and tests | Implemented; 81 completed 2025 source/month snapshots recorded. Missing business ID remains genuinely unavailable. |
| Improve concentration circles/heatmap formatting | Extended map UX | [Density style](../../frontend/src/lib/densityStyle.ts), contextual surface, legends/popups | Implemented; relative density and count symbols remain distinct. |
| Hide statistics when concentration is selected | P2-03 | Exclusive mode; hides statistical fills/legend/popups | Implemented; independent stations/streets remain selectable. |
| Show actual road/street detail | Extended geographic context | Reviewed OpenFreeMap adapter, toggle, attribution, failure fallback | Implemented. Current street context does not certify a source record's street accuracy. |
| Count records inside a real radius rather than interpreting heat blur as a count | Extended spatial analytics | Private location/count groups; indexed geography `ST_DWithin`; radius handler/API/controls; [radius evidence](../evidence/radius-analysis-validation-2026-11-12.json) | Implemented for 500/1,000/2,000 m. Counts are source rows; small positive results suppressed; exact crime pins/addresses not exposed. |
| Make 500 m detail actually update map/legend and provide more detailed groups | P2-03/05 + extension | [Viewport hook](../../frontend/src/hooks/useConcentrationMap.ts), cells handler/repository, grid selector; [evidence](../evidence/concentration-viewport-validation-2026-11-12.json) | Implemented. Grid side length is distinct from query radius; under-five groups hidden and response cap explicit. |
| Grow circles with zoom and update legend together | Extended UX | Shared bounded zoom-size curve in map/legend; [evidence](../evidence/peru-camera-and-circle-zoom-2026-11-12.json) | Implemented; symbol size is not geographic radius. |
| Restrict navigation to initial Peru framing without deleting neighbors | Extended UX | National bounds/minimum zoom, responsive camera envelope; existing basemap retained | Implemented. Neighbor context is visible while that optional basemap is enabled. |
| Validate whether crimes are complaints and whether records can be crossed | P2-02 + data integrity | [Official dictionary/schema/database audit](../data-counting-units.md) | Implemented as an investigation. Both releases originate from SIDPOL; neither is a complete independent inventory of unreported crime. |
| Add separate complaint/geographic dashboards in Trends | Extended analytics | [Trends guide](../trends.md), annual source query, shared charts and record-specific labels | Implemented; 2025 category-only, no cross-publication annual percentages. [Evidence](../evidence/dual-source-trends-validation-2026-11-12.json). |
| Keep map visible when all toggles are off | P2-03/05 regression | Neutral existing INEI surfaces/outlines, thematic layers hidden | Implemented; [latest regression evidence](../evidence/neutral-map-validation-2026-11-12.json). |
| Update documentation throughout | P2-01/04 + workflow | README, architecture, ingestion/concentration/trends/source guides, validation/evidence | Implemented; source inventory retains historical statements under an explicit historical-scope preface. This ledger is the current completion map. |
| Ask what remains for Phase 2, then map requirements/prompts | Closeout | This audit | Delivered as documentation. Recommendations below are distinguished from original requirements. |

## 4. Earlier requests that are prerequisites or other phases

These requests remain relevant context but must not inflate Phase 2's completion criteria.

| Earlier prompt group | Classification and match | Qualification |
| --- | --- | --- |
| Original official-statistics MVP; Clean Architecture, Result/ProblemDetails, PostGIS, tests and local Compose | Baseline application prerequisites; reused throughout Phase 2 | Backend/app/DB implementations and local validation are recorded; this audit does not re-run the complete MVP acceptance suite. |
| Explain local operation/current features/importing real data/automatic downloads; confirm imported data displays | Baseline ETL/local-operation work | README and ingestion guide; real imports verified in later evidence. |
| True ETL available in development and Lambda | Baseline + Phase 3 preparation | Shared Python runners, packaging/schedule configuration and local tests exist. Deployed Lambda execution is not verified; no deployment is required for Phase 2. |
| Check/correct Terraform; do not apply production changes | Separate infrastructure maintenance constraint | No production apply is part of Phase 2; Terraform correctness is not independently re-audited here. |
| Nationwide departments, province/district filters, same-page focus/fades and loading skeletons | Existing geographic prerequisites / later refinements | App/CrimeMap/statistics use cases and tests; maintained during integration. |
| Initial Trends navbar/dashboard, category-colored lines, year slider and rate limits | Baseline statistics feature / cross-cutting protection | Existing CSV trends retained; geographic trends added separately; application-owned routes protected. Direct browser requests to external providers do not pass through our API limiter. |
| CORS so backend can only be accessed by this frontend | Cross-cutting security request | Clarified by the user as protection against browser reads from other websites: implemented and verified by a real-browser CORS check. Public server-to-server HTTP access remains outside CORS; no claim of client authentication is made. |
| Official reporting links, phone/copy actions and guided Denunciar | Phase 1 | Implemented separately; not a missing Phase 2 item. |
| No invented data, no news ingestion/authentication/payments/AWS deployment | Explicit boundaries | Geographic additions use recorded official sources; unsupported inference remains excluded. News and public incident submission are not Phase 2 closure work. |

## 5. Actual gaps and closure decision

| Priority | Item | Nature / required action |
| --- | --- | --- |
| Public-use gate | Dataset-specific reuse/redistribution permission for stations, active geographic data and archives | External/unverified. Establish permitted use or retain an explicitly bounded POC; public availability and attribution alone do not resolve it. The CSV dictionary/catalogue license must not be transferred to a different service by assumption. |
| Data interpretation limit | Business-ID semantics, numeric `estado`, accuracy/completeness and station update date | Provider-dependent. Keep current uncertainty labels and row-count semantics. Claims of unique crimes or certified street accuracy cannot be closed through UI code. |
| Conditional Module B gap | User-adjustable layer opacity | Not implemented. Decide usefulness; implement controls only if accepted as part of the desired Phase 2 scope. No slider is mandated by the original six deliverables. |
| Recommended closeout | Reusable browser smoke scripts in the repository/CI | Completed in the follow-up: checked-in Playwright tests/configuration/fixtures, CI wiring and failure artifacts; 11 browser tests passed locally. See browser-tests.md. Remote CI execution is still unverified. |
| Recommended closeout | One final consolidated regression/CI record | Latest suites ran at different steps; no single final backend/frontend/Python/browser run or successful remote CI run is established. Run/record if required for sign-off. A CI workflow is configured in `.github/workflows/ci.yml`. |
| Cross-cutting clarification | Literal frontend-only API access | Resolved by user clarification: cross-site browser read protection is the accepted requirement and is tested. The API is not authenticated merely through CORS; server-to-server access remains possible. |
| Phase 3 | Consolidated source catalogue, health/freshness and ingestion observability | Some import metadata exists already; the shared product/operational layer is still deferred. Suggested future `/api/sources` and `/api/geographic-layers` endpoints are not required POC APIs. |
| Later scope | More layers, population rates, news ingestion, individual cross-source matching, cloud deployment | Deferred or unsupported, not missing original Phase 2 functionality. |

**Sign-off assessment:** functional Phase 2 POC requirements are covered. The browser follow-up now supplies reproducible automation and its local validation record. A consolidated backend/Python/browser regression or successful remote CI record is still separate. Public production readiness remains conditional on source permissions and the unresolved provider guarantees; the expanded roadmap's optional opacity control needs an explicit scope decision. No product code, imports, infrastructure or runtime configuration was changed by this audit.

## Browser/security clarification follow-up

The user clarified that the CORS requirement is protection against reads from other websites in browsers, rather than exclusive identification of frontend code. The existing policy meets that clarified browser-origin requirement; server-to-server requests remain outside CORS's protection. The earlier literal-exclusivity classification is retained above as historical reasoning, not the clarified acceptance criterion.

Reproducible desktop/mobile smoke tests, browser fixture/type checks and a real-backend CORS scenario are now in `frontend/e2e/`, with the commands and CI artifact policy in [browser-tests.md](../browser-tests.md). This addresses the missing checked-in browser suite and CI wiring; remote CI execution and a consolidated backend/Python/browser run remain separate verification tasks. Source-permission/interpretation limits and the optional opacity-control decision remain unchanged.

## MVP data-use decision

[ADR 0002](../adrs/0002-mvp-data-use-with-unresolved-authorization.md) records the explicit maintainer decision to continue bounded MVP development without waiting for source-specific written authorization for every integration. This does not resolve the source-permission/public-release limitations above or extend the approved acquisition/deployment scope.
