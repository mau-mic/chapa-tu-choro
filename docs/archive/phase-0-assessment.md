> Historical record, retained on 2026-11-13. Use the [current documentation index](../README.md) for setup and current behavior. Statements and test results below describe the date recorded, not current validation.

# Repository assessment and Phase 1 plan — 2026-11-11

Assessment completed before implementing the reporting-guide extension. This document describes repository source, not verified production infrastructure.

## Existing implementation

| Area | Current code and capabilities | Reuse / limitations |
| --- | --- | --- |
| Backend | Four .NET 10 projects: Domain, Application, Infrastructure, API. Explicit handlers, Result/AppError, ProblemDetails, centralized exceptions, Serilog, EF Core and pooled Npgsql/PostGIS reads. | Preserve boundaries and existing endpoints. No reporting write endpoint is needed. |
| API | Metadata/categories, explorer, summary, top districts, GeoJSON and trends; health/readiness and development diagnostics. CORS, per-client/route/instance/concurrency limits. | Do not duplicate routes suggested by the roadmap. Limits remain per process/warm Lambda. |
| Map | React/TypeScript, MapLibre, official department/district polygons, UBIGEO filters, counts/ranking, fading camera transitions, skeletons. | Preserve canvas and existing filters. No external selectable layers or event coordinates yet. |
| Trends | SVG/HTML charts, total/category timelines, year slider, nullable gaps versus explicit zero, monthly/yearly changes, territory comparisons. | Rates require compatible population data. No moving average, two-area comparison or cross-source inference yet. |
| Navigation | App-local React view state; no routing library. Mapa, Tendencias and existing Actúa directory. | Add a small browser History adapter for real `/denunciar` navigation, direct load and Back/Forward. Avoid a second state framework. |
| Reporting | Typed `reportingResources.ts`, `TakeAction`, official references/date, phone intents, clipboard/manual fallback, responsive layout. | Extend in place with emergency/category guidance and source metadata. No incident data collection. |
| Persistence | `monthly_reports`, district/department boundaries, `import_runs`; period/category, UBIGEO and spatial indexes. SQL bootstrap plus additive upgrade. | No EF migration pipeline yet; Phase 1 needs no schema changes. Future schema work must deliberately reconcile existing SQL provisioning with migrations. |
| Ingestion | Python shared CLI/Compose/Lambda ETL; official discovery/download, validation, raw/source sidecars, optional S3 archive, shared transaction, advisory lock, checksums and audit. | Preserve national import and aggregates. At this assessment date, the general license/source-health registry was not implemented; the current [source catalogue](../sources/catalog.md) and [tracking](../ingestion/tracking.md) now exist. Failed upstream access must not fabricate replacements. |
| Operations | Compose PostGIS/private API/nginx web/ETL profiles; CI .NET/frontend/Python tests, packaging scripts. Terraform describes S3/CloudFront OAC, Lambda API/ingestion, scheduler and logging. | ECS/Fargate is a proposal, not configured deployment. Deployment/provider evaluation is a future decision, not part of Phase 1. |
| Quality | xUnit API/application/PostGIS tests, Vitest interaction/geometry/chart tests, Python parsing/ETL/integration suites. | Live services must not be unit-test dependencies. Frontend has no configured lint script. Large MapLibre bundle remains existing debt. |
| Future incidents | A domain incident skeleton and review enums exist; no public ingestion, moderation, news source pipeline or citizen submission UI. | Not a functioning incidents module. Do not expose an empty destination or implement phases 2+. |

## Phase 1 decisions and files

1. Extend the existing directory rather than replace it: `reportingResources.ts` adds typed selection rules, methods, requirements, anonymity uncertainty and per-source review status/date. New source access failures are visible; confidentiality is not assumed to mean anonymity.
2. `TakeAction.tsx` becomes the guided Denunciar experience: immediate-danger question first, then seven incident-category choices and explained channels. Retain a browsable directory, phone/copy controls and explicit independent-platform notice.
3. Add `lib/navigation.ts` for `/`, `/tendencias`, `/denunciar` with native History and real anchor destinations. Preserve App state and the map instance; activate the existing action view at `/denunciar`. Validate direct loads, Back/Forward and modified-link clicks. nginx already supports SPA fallback; document the equivalent static-host rewrite without deploying cloud changes.
4. Update `App.tsx`, existing frontend tests, styles, README and reporting/architecture guides. No new dependencies, backend classes, storage or environment variables.
5. Verify official references before assigning rules. When direct verification fails, retain official guidance references with explicit limitations; never invent app eligibility, anonymous reporting or online completeness.
6. Validate frontend build/types/tests, backend build/tests with isolated PostGIS, ingestion regression checks where available, and real-browser navigation/mobile guidance. Never call emergency lines or submit reports in tests.

## Remaining roadmap order

After Phase 1 review: Phase 2 source inventory and one documented permitted police-station layer proof of concept; Phase 3 source/license/coverage/import observability; Phase 4 compatible official population denominators and explainable comparisons; then controlled news discovery/extraction with human review. Unified layers and cross-source analytics follow only after independent sources work reliably. Citizen reporting and repeat-detention analytics require separate privacy/legal/source design review.

No existing architectural boundary needs to change for Phase 1. Source and moderation modules in later phases may justify additional ports and persistence, but not new layers or microservices now. No government geospatial API, news pipeline, authentication, population dataset, production DB change or AWS deployment is authorized by this implementation scope.
