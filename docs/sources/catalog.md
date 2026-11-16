# Source catalogue

The Python ingestion service owns the persistent operations catalogue in `public.ingestion_sources`. It has no public API or frontend management screen. Inspect it using SQL or `python -m ingestion.tracking sources --limit 100` from the [configured native environment](../operations.md#database-upgrades) with private database credentials.

## Migration and contents

Run the [versioned migration command](../operations.md#database-upgrades) before using the catalogue or updated ingestion jobs. `001_baseline.sql` includes the historical `005_source_catalog_tracking.sql` definitions, now in `db/archive/`; later active migrations are applied in manifest order. Adoption preserves compatible existing data and operator edits. No historical executions are invented/backfilled.

The baseline seeds fourteen sources: SIDPOL statistical CSV, INEI departments/districts, the active 2026 geographic source, eight 2025 category archives, basic stations and street context. `003_population.sql` adds population as the fifteenth source. Browser-only station/basemap entries do not create Python jobs or record browser visits. Seeding uses `ON CONFLICT DO NOTHING`: maintainer edits survive reruns. Adding an entry does not add a downloader or bypass source allowlists.

| Field | Meaning |
| --- | --- |
| `source_key` | Stable identity shared with the ingestion adapter/receipts |
| `title`, `publisher`, `source_url`, `source_format` | Original provider and public catalogue/service entry point; no credentials or private URLs |
| `counting_unit` | Published complaint measure, geographic classification rows, administrative boundaries, installations or map context |
| `coverage` | Declared/known scope and its limitations; not a completeness guarantee |
| `access_mode` | `etl` or `browser`; browser entries cannot be ingested by the tracking runner |
| `usage_status`, `terms_url`, `notes` | Recorded terms/authorization evidence and unresolved limitations |
| `enabled` | Operator-controlled eligibility for a new ETL attempt |
| `created_at` | Catalogue row creation time, not provider publication/update time |

`usage_status` is `unresolved`, `published_terms_recorded` or `express_authorization_recorded`. A successful fetch/import **never changes it**. Published terms recorded for the CSV or basemap do not authorize other datasets or every intended use. The catalogue continues the distinctions in [ADR 0002](../adrs/0002-mvp-data-use-with-unresolved-authorization.md). Technical outcomes are represented by execution records, not by changing a source's permission state. Accuracy, unique-event identity, freshness monitoring and public-release decisions remain separate.

To disable a source, an authorized operator can update its `enabled` field. Tracking checks the catalogue before starting extraction; disabled/missing/non-ETL entries fail explicitly. An already running attempt is not cancelled by that edit. Existing imported data is not deleted or hidden. Statistics batches require all three selected ETL sources to be enabled.

## Access and maintenance

The catalogue and attempt tables have RLS enabled and grants revoked from PUBLIC and existing Supabase `anon`/`authenticated` roles. They are not a public PostgREST catalogue. Local Compose's table owner can use the CLI. A separate private ingestion SQL role needs SELECT and an appropriate SELECT RLS policy on the catalogue; only a maintainer should edit rights/enablement metadata. Do not grant browser roles access or put a database password/service key in the frontend.

Actual statistical release names/URLs remain in existing `import_runs` provenance; geographic versions remain in `concentration_imports`. A catalogue URL describes the source, not an assertion that every execution downloaded the same release. Receipt checksums support correlation with those existing audit records. A geographic checksum includes the normalized content/boundary/storage fingerprint; a superseded snapshot may no longer join the current snapshot row, while its receipt remains in history.

See [tracking operation](../ingestion/tracking.md), [counting units](../data-counting-units.md) and [source limitations](../phase-2-traceability.md).

Public statistical HTML is generated from the existing SIDPOL aggregates by a separate read-only export, not by exposing this private catalogue. It uses the original statistical source reference and safe CSV import provenance; catalogue permission states are not publicly inferred from ingestion success. See [static publishing](../seo/publishing.md).

Phase 4 adds `inei-population`: the manually supplied official 2018–2026 INEI XLSX, counting unit `projected-residents`. Content-addressed population releases retain the actual denominator version independently of the catalogue URL. Usage remains unresolved. See [population ingestion](../ingestion/population.md).
