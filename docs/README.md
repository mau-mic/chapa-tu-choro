# Documentation

For a new engineer, read these guides in order:

1. [Getting started](getting-started.md): product use cases, terminology and repository map.
2. [Architecture](architecture.md): execution flow, code dependencies and data ownership.
3. [Operations](operations.md): local development, configuration, migrations and recovery.
4. [Testing](testing.md): deterministic tests, PostGIS and browser checks.
5. [Methodology](methodology.md): what the statistics mean and what they cannot establish.

For release work, use [AWS deployment](deployment.md) and the [AWS architecture/cost review](aws-review.md). Their checklists distinguish implemented configuration from unverified deployment requirements.

## Reference guides

| Need | Read |
| --- | --- |
| Import CSV/boundaries or recover a failed run | [Official-data ingestion](data-ingestion.md) |
| Add a schema migration or upgrade an older installation | [Active migrations and compatible renaming](../db/README.md) |
| Create Supabase, migrate, configure roles/TLS, import datasets and connect local/AWS services | [Complete Supabase/PostgreSQL setup](supabase-setup.md) |
| Import population or understand rates/references | [Population and advanced statistics](ingestion/population.md) |
| Understand geographic cells, radius queries and source overlap | [Concentration](concentration.md) |
| Modify chart/query contracts | [Trends](trends.md) |
| Maintain source metadata, attempts or observation freshness | [Catalogue](sources/catalog.md), [tracking](ingestion/tracking.md), [freshness](ingestion/freshness.md) |
| Change map context or frontend controls | [Geographic layers](official-geographic-layers.md), [frontend design](frontend-design.md), [nationwide map](nationwide-map.md) |
| Configure browser/API protection | [Browser access](browser-access.md), [rate limiting](rate-limiting.md) |
| Maintain official reporting links | [Reporting resources](reporting-resources.md) |
| Publish statistical HTML, sitemap and canonical URLs | [SEO publishing](seo/publishing.md) |
| Check product scope | [Requirements](requirements.md) |

## Decisions and historical evidence

[ADR 0001](adrs/0001-mvp-architecture.md) explains the architecture. [ADR 0002](adrs/0002-mvp-data-use-with-unresolved-authorization.md) records unresolved source-reuse authorization; it is not permission to redistribute.

The [archive](archive/README.md), implementation plans and [dated validation evidence](evidence/) explain how the project reached its current state. They are not setup instructions or proof that production is deployed. Source investigations preserve observations at their recorded dates: [counting units](data-counting-units.md), [older MININTER service](mininter-denuncias-validation.md), [exact viewer](mininter-exact-viewer-source.md) and [historical-source investigation](mininter-viewer-tour-integration.md).
