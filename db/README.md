# Database migrations

Run the migration runner; do not execute SQL files individually:

```bash
docker compose --profile etl run --build --rm migrate
```

For native Python, use the [configured environment](../docs/operations.md#database-upgrades) and `python -m ingestion.migrate`. Confirm the target connection before running; remote/production changes require separate authorization.

## Active sequence

Only the ordered files in [migrations.json](migrations.json) are applied:

| File | Purpose |
| --- | --- |
| [001_baseline.sql](001_baseline.sql) | Statistics, official boundaries, concentration, source catalogue and ingestion tracking |
| [002_ingestion_leases.sql](002_ingestion_leases.sql) | Heartbeats, lease ownership and expiry |
| [003_population.sql](003_population.sql) | Population releases, observations and source registration |
| [004_database_access.sql](004_database_access.sql) | API/ingestion permission groups, table grants, RLS and future-object defaults |

The baseline incorporates the earlier upgrades retained in [archive](archive/README.md). Those historical scripts are not active migrations. No functionality was removed during consolidation or renumbering.

## Existing migration records

The 2026-11-14 rename preserves every SQL byte and SHA-256:

| Previous receipt name | Current name |
| --- | --- |
| `001_schema.sql` | `001_baseline.sql` |
| `006_ingestion_leases.sql` | `002_ingestion_leases.sql` |
| `007_population.sql` | `003_population.sql` |

Under the existing advisory transaction lock, the runner validates the complete ledger's checksums and canonical prefix before translating recognized names. It preserves `sha256` and `applied_at`, never reruns completed SQL, and then applies only pending migrations. Existing installations with the first three migrations apply only `004_database_access.sql`; their earlier receipt dates and checksums stay intact. Once all four are recorded, repeating the command returns `{"applied": []}`.

Unknown receipts, old/current duplicates for the same migration, altered checksums and gaps fail explicitly. Name updates, pending DDL and new receipts roll back together if anything fails. Untracked databases still use structural baseline adoption; no history is fabricated.

After normalization, use the updated runner: an older package will not understand the new names. Do not rename ledger rows manually or deploy an old migration runner as a rollback strategy.

## Future changes

Add `005_<purpose>.sql` next and append it to the manifest. Keep applied SQL immutable. Do not renumber again, edit checksums to bypass errors, or run the archived upgrades. Keep schema ownership separate from ingestion writes and API reads; see [Supabase setup](../docs/supabase-setup.md) for migration 004 and manual login/password provisioning.
