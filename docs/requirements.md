# MVP Requirements and acceptance criteria

For the original Phase 2 requirements, subsequent user requests, code/evidence mapping and precise gaps, see [Phase 2 traceability audit](phase-2-traceability.md).

## Functional (current MVP)

| ID | Requirement | Code status |
| --- | --- | --- |
| FR-01 | Serve nationwide metadata and available categories | Implemented; requires imported data |
| FR-02 | Filter monthly reports by year, month, and category | Implemented |
| FR-03 | Rank all districts with matching data | Implemented |
| FR-04 | Return official department overview and focused district GeoJSON joined to counts | Implemented; requires imported boundaries |
| FR-05 | Display national department hover totals, click-to-focus districts and return navigation | Implemented; requires data |
| FR-06 | Validate and import official CSV without inventing coordinates | Implemented |
| FR-07 | Import official nationwide INEI district and department GeoJSON boundaries | Implemented |
| FR-08 | Complete automated official-source ETL in local development and scheduled Lambda | Shared runner, transactional load, S3 archive, packaging and schedule configuration implemented; target-environment verification and deployment required |
| FR-09 | Individual crime incidents with sourced approximate locations | Not implemented; later roadmap phase |
| FR-11 | Guided official reporting at /denunciar | Phase 1 implemented; external service availability explicitly unverified where retrieval fails |
| FR-12 | Historical total/category series, year slider and comparison metrics | Implemented; raw counts plus separate same-year population rates and up to four territorial series |
| FR-16 | Moving averages, historical/seasonal baselines and national rate comparison | Implemented; complete windows, explicit sample availability, weighted national totals, existing shared filters and independent geographic sources |
| FR-15 | Population-normalized history, rate map and observed quality | Implemented; supplied preliminary INEI projections, same-year UBIGEO joins, null incompatible denominators, shared filters and coordinated first-load state; see population documentation |
| FR-14 | Official geographic concentration and cautious cross-source analytics | Implemented for verified 2025/2026 sources; explicit imports/migration, exclusive map mode, coarse cells, overlap policy, quality audit and independent SIDPOL aggregate context; provider accuracy/identity/license limitations remain |
| FR-13 | Independent official geographic overlay | Phase 2 POC: public MININTER basic-station points, opt-in toggle, UBIGEO filters, attribution, isolated loading/error/retry; update date and specific provider license undeclared; see source inventory |
| FR-10 | AI extraction, human moderation, notifications | Not implemented, future |

## Non-functional

| ID | Requirement | Current implementation / next work |
| --- | --- | --- |
| NFR-01 | Security | parameterized queries; private S3 origins; DB credentials in SSM; validated CORS, rate and concurrency limits; deployment hardening still environment-specific |
| NFR-02 | Correctness | distinguish aggregated reports from incidents; validated CSV, source checksum, no fake data |
| NFR-03 | Reliability | atomic multi-source ETL, import_runs idempotency, bounded HTTP/platform retries; failure notification not configured |
| NFR-04 | Observability | Serilog JSON, CloudWatch; optional S3 archive; alerts not yet configured |
| NFR-05 | Testability | Python parser/downloader/ETL tests, C# API tests, optional PostGIS integration tests; browser navigation/reporting guide verified; see latest validation log |
| NFR-06 | Performance | DB indexes; explorer geometry simplified in PostGIS; MapLibre bundle remains large |
| NFR-07 | Cost | no always-on server or LB; optional paid Firehose archive off |
| NFR-08 | Maintainability | layered projects, DI, typed clients and options; API endpoints separated |
| NFR-09 | Privacy | no victim data in MVP; future reports require redaction, sources and moderation |

## First end-to-end milestone

With official data imported, metadata, rankings and `/api/explorer` return district/department information and the React application displays matching statistics. Validate sample totals against the source and investigate unmatched UBIGEO codes before publishing. `/api/map` now requires a department and returns simplified display geometry; see [its bounded contract and payload checks](nationwide-map.md#scoped-district-geojson).

## Source operations and freshness

The private source catalogue and durable ingestion attempt/receipt records support failed, unavailable and no-change outcomes. Local and Lambda entry points share Python logic and the versioned schema. Observation-date freshness validation and expired-run reconciliation are implemented; public operations screens, overdue alerts and deployment verification are separate work. See [catalogue](sources/catalog.md), [tracking](ingestion/tracking.md) and [freshness](ingestion/freshness.md).

## Search discovery and static resources

The map remains the default view. Searchable initial HTML, distinct page metadata, a methodology resource and optional database-derived national/department HTML tables are implemented. Canonical URLs/sitemap require a configured public HTTPS origin; previews remain noindex. Source units/provenance stay explicit and unsupported risk/unique-event claims are excluded. Deployment and Search Console ownership/indexing verification remain release work. See [SEO publishing](seo/publishing.md).

## Release boundary

The features above describe local functionality, not a deployed service. [AWS review](aws-review.md) records the locally resolved map-size issue, remaining artifact/security/monitoring prerequisites and cost assumptions. [Deployment](deployment.md) separates preparation from separately authorized cloud/data changes.
