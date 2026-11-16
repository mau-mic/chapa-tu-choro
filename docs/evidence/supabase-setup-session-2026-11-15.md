# Supabase setup record — November 14–15, 2026

This records the operator conversation and local checks, not an independent hosted audit. Use the [setup runbook](../supabase-setup.md) for executable procedures. No passwords, connection secrets or raw incident locations are recorded.

## Target and access

| Item | Recorded outcome |
| --- | --- |
| Target | Project `xjjivrlwlizkskbhomnc`; pooler `aws-0-us-east-1.pooler.supabase.com:5432`; database `postgres`. |
| Creation settings | Data API, automatic table exposure and automatic RLS were recommended disabled. Explicit migration-managed RLS remains required. Current portal settings were not independently queried. |
| PostGIS | Operator screenshot confirmed `postgis`, version `3.3.7`, schema `extensions`. |
| TLS | `sslrootcert=system` failed before migration SQL. A read-only TLS probe showed a chain to Supabase Root 2021 CA. Operator downloaded the portal CA, mounted it and reported migration success. SSL enforcement was recommended; the final toggle state was not independently queried. |
| Active migrations | `001_baseline.sql`, `002_ingestion_leases.sql`, `003_population.sql`, `004_database_access.sql`. Original 002–005 upgrades are consolidated into the baseline and retained in `db/archive/`. |
| Hosted application | Operator reported the initial migrations and then migration 004 applied. No hosted ledger query output was captured. |
| Accounts | Permission groups: `ctc_api_reader`, `ctc_ingestion_writer`. Operator reported creating `ctc_api`/`ctc_ingestion`, assigning passwords through `psql` and verifying permissions. The agent did not authenticate to the hosted database. |
| Local tests | [Database-access evidence](database-access-2026-11-14.json) records 125 passing ingestion/PostGIS tests and artifact checks, separately from hosted verification. |

## Statistics/boundary extraction failure and recovery

Run `1b71d3a3-23be-4744-8263-dacf08611bab` logged a downloaded district SHA-256 `87522541faa9fac19a4708ae6f58c26d35605679e90ddc3d96c5673d8fe9ac1d`, then failed at `extract` with `ValueError`. The code downloads departments and districts before SIDPOL discovery. It had not entered the data-loading transaction; failed-attempt tracking is separate.

The operator ran the downloader-only diagnostic and supplied:

```text
Found 9 unambiguous CSV download links. Pin the intended official release with --sidpol-url; no release was guessed.
```

Recovery pinned this reviewed release, January 2018–September 2026:

```text
https://www.datosabiertos.gob.pe/sites/default/files/DATASET_Denuncias%20Policiales%20-%20Enero%202018%20a%20Septiembre%202026.csv
```

The local `data/SIDPOL.csv.source.json` recorded download on November 11 and SHA-256 `e67a1edcd84483df5c471f0d6b9e13c2eeaa34c680af30eb1ec86c443d02ec76`. The local CSV checksum was checked and matched. This identifies the local release, not future URL availability, current hosted content or the latest source publication. The operator subsequently reported success; final hosted statistics totals/provenance output was not captured.

## Confirmed concentration sample

The operator supplied this September 2026 receipt:

| Field | Value |
| --- | --- |
| Run | `376c04fb-1eaf-4056-9e37-4d701bb293ba` |
| Status/source/period | `imported`, `active-2026`, September 2026 |
| SHA-256 | `95a9a6d7402e8c5ec24c109da92b57ec9418a12ce443a6e89569d3426e9a6915` |
| Source-classification rows | 45,558 |
| Mapped rows | 39,660 |
| Invalid UBIGEO | 5,853 |
| Outside declared district | 45 |
| Missing boundary | 0 |
| Coordinate precision | Undeclared |
| Grid/location storage | 1,000 metres / version 1 |

The operator's SQL screenshot showed **17,040 cells** and **52,300 location groups** at that time. These are category-expanded materialization counts, not unique crime totals or permanent expected counts. Do not sum category representations to infer independent incidents.

Full 2026/2025 backfill commands were supplied. Running `etl` as a standalone shell command failed; the instructions were corrected to full `docker compose ... etl --year ...` commands. Final backfill receipts/coverage were not supplied. Verify source/month coverage rather than assuming both years completed.

## Population and remaining checks

The existing official `data/population.xlsx` was verified locally:

- SHA-256 `9436df29b883fd4a9db3705040a6668ff4efe7047c2643249b6b6bedd90d5c8b`.
- Importer `--check-only` exited successfully with 19,026 observations, 59 unavailable values and years 2018–2026.
- These are preliminary annual projections, not definitive Census 2025 results.
- The hosted import command and verification queries were supplied. No final hosted import receipt or active-release query result was captured. Confirm the active release and per-year counts before marking this verification complete.

Local API override instructions were supplied, but no successful Supabase-backed API readiness/feature test was captured. AWS discussion identified existing SSM/IAM wiring and pending CA packaging, separate SecureStrings, pinned SIDPOL configuration and deployed verification. No AWS provisioning, secret creation, certificate packaging change, schedule activation or deployment was performed by this documentation task. Hosted advisors, backup/recovery and completeness checks remain operator release requirements.

## Documentation verification

The documentation update validated 20 fenced Bash blocks with `bash -n`, 62 internal links/anchors across the five edited guides/record files, balanced code fences and the merged API Compose override using `docker compose config --quiet` with a dummy password. No documented hosted-write command was executed during these checks. Application builds/tests were not rerun for this documentation-only update.
