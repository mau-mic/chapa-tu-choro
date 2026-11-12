# Durable ingestion attempts — local, Lambda and Supabase

`ingestion.tracking.TrackingRun` records attempts independently of the existing successful-import audits. Python is the owner because the CLI/Compose/Lambda runners perform extraction and writes. No frontend or .NET behavior changed.

## Install/upgrade

Run the [versioned schema migration](../operations.md#database-upgrades) before updated ingestion jobs:

```bash
docker compose up -d --wait postgis
docker compose --profile etl run --build --rm migrate
```

The manifest includes the source catalogue/tracking baseline and later lease upgrades. Compatible existing schemas can be adopted after structural checks; checksum drift and incompatible objects fail explicitly. Use an authorized migration connection for a remote target; this work does not apply remote migrations or deployments. Migration reruns preserve catalogue edits and historical attempts.

Connection configuration is unchanged: `DATABASE_URL` locally, or `DATABASE_URL_PARAMETER_NAME` resolving the existing SSM SecureString in Lambda. Use the provider-required TLS connection and the existing documented PostgreSQL search path (`public, extensions` where appropriate). Server-side prepared statements remain disabled for Supabase transaction pooling. Transactions/advisory locks are transaction scoped; no new session-level lock or AWS service was introduced.

Migration 004 configures `ctc_ingestion_writer` with SELECT on the source catalogue and SELECT/INSERT/UPDATE on both tracking tables, in addition to its import/staging privileges. Command-specific RLS policies permit this dedicated service principal; tracking DELETE remains denied. Follow [Supabase setup](../supabase-setup.md) to create a separate login and grant it this permission group. Do not add manual duplicate policies, reuse a browser role or give one membership in the worker group. These repository changes do not apply permissions to a hosted project automatically.

## Tables and guarantees

- `ingestion_sources`: fourteen source registrations with independent usage-evidence state; see [catalogue](../sources/catalog.md).
- `ingestion_runs`: UUID, pipeline, status, current stage, start/finish timestamps, optional requested year/month and safe failure class.
- `ingestion_run_sources`: one receipt per selected source/attempt, terminal outcome, checksum when available and whitelisted aggregate counters.

The start is committed on a separate connection **before extraction**. Stage updates are durable. Source success/unchanged receipts and the terminal run outcome are written on the **same transaction as imported data**, including manual entry points. A data rollback therefore rolls back its success receipt; the exception path records failure afterward on a separate connection. A post-commit logging/error event cannot overwrite an already committed success with failure.

The source receipts describe the outcome of the selected import batch, not proof that every individual provider failed when the batch rolls back. Known counters are whitelisted integer counts; arbitrary error messages, response bodies, source rows, addresses, raw coordinates and credentials are excluded. Unknown counts are omitted rather than invented as zero. `error_type` is an exception class; the original safe CLI error/report remains separate. For wrapped statistical failures this may be `EtlError`, with the durable stage identifying where it failed.

Statuses:

| Status | Meaning |
| --- | --- |
| `running` | Start committed; no terminal receipt yet. Not proof that the process is still alive. |
| `succeeded` | At least one selected source reported `imported`/`succeeded` and the data/receipts committed. |
| `unchanged` | All selected sources reported `unchanged`/legacy `skipped`; this is a successful no-change attempt. |
| `unavailable` | No imported result; at least one selected source/period returned no available snapshot. |
| `failed` | The runner raised before a committed terminal outcome, and failure persistence succeeded. |

Existing importer contracts remain intact. In particular INEI currently performs idempotent upserts and reports `imported` even on an identical file. Thus a repeated statistics batch can be `succeeded` while its SIDPOL source receipt is `unchanged`; this is not duplicate statistical content. Each retry intentionally has a new attempt UUID, while existing checksum/idempotency and transaction rules continue protecting dataset content.

A full concentration invocation creates one attempt per registered source/month. Earlier months can remain committed if a later month fails, matching existing behavior. Unavailable months have durable `unavailable` outcomes rather than fabricated zero datasets. The year/category authority registry remains unchanged; no combined 2025 archive total is created.

## Covered entry points

- `python -m ingestion.etl` and Compose ETL: one statistics batch covering CSV and both INEI layers.
- `python -m ingestion.concentration`: one attempt per source/month, with run IDs in successful and safe failure output.
- `python -m ingestion.import_sidpol FILE` / `python -m ingestion.import_districts FILE`: tracked manual writes under an explicit outer transaction.
- `ingestion.lambda_handler.handler`: the same updated runners and environment-owned sources; event payloads cannot override URLs/DB configuration.

Validation-only `--check-only` commands do not create write attempts. Low-level `import_file`, `import_geojson`, concentration `load` and `load_inputs` remain reusable primitives; calling them directly without a tracker does not create execution history. External code should use the supported runners or explicitly provide a tracker and outer transaction. Legacy successful-import tables remain intact; this feature does not infer past failed executions from them.

Initial database/configuration failures or invalid selectors rejected before an attempt starts cannot be recorded as durable database attempts. They fail explicitly before extraction/data writes; missing migration guidance identifies the required upgrade. There is no silent best-effort tracking mode. If recording a failure itself fails, the runner raises a sanitized tracking error with correlation information; inspect the database/logs rather than assuming rollback or success.

## Inspect execution history

Use private DB credentials and the same environment as ingestion:

```bash
python -m ingestion.tracking sources --limit 100
python -m ingestion.tracking runs --limit 20
```

Both are read-only and return JSON; the latter includes per-source outcomes/checksums/counters. `--limit` accepts 1–200. In Compose, after rebuilding the ETL image:

```bash
docker compose --profile etl build etl
docker compose --profile etl run --rm --entrypoint python etl -m ingestion.tracking runs --limit 20
```

To investigate a specific attempt:

```sql
SELECT r.*, s.source_key, s.outcome, s.sha256, s.counters
FROM public.ingestion_runs r
JOIN public.ingestion_run_sources s USING (run_id)
WHERE r.run_id = '<attempt UUID>'::uuid;
```

A Lambda timeout, termination or crash can prevent cleanup and leave `running`. Leased attempts default to a 300-second lease with background renewal every 60 seconds. Renewal and completion require the matching ownership token, a running state and an unexpired database-clock lease. Operators can reconcile a bounded batch of expired leased attempts:

```bash
python -m ingestion.tracking reconcile --limit 20
```

Reconciliation marks expired leased attempts and their source receipts as failed, with `error_type: LeaseExpired`; it does not change imported data or successful attempts. Legacy rows without leases remain running with unknown ownership. An old `running` row alone does not prove that a process is alive or has failed. Do not fabricate success, delete imports or mark an active worker failed. See command output and invocation logs when investigating an abandoned attempt.

## Tests and deployment artifact

```bash
CTC_TEST_DATABASE_URL=postgresql://ctc:test_only@127.0.0.1:5432/TEST_DATABASE \
  python -m unittest discover -s ingestion/tests -v
bash scripts/package-ingestion.sh
```

Use an isolated test database; integration tests create/drop synthetic schemas. New tests cover migration reruns, catalogue-edit preservation, non-owner RLS denial, CLI receipt inspection/limit validation, disabled/browser-source rejection, durable extraction failures, sanitized errors, atomic rollback, post-commit errors, separate retry attempts, unavailable periods, real shared Lambda statistics execution and concentration imports, manual writes and check-only behavior. Existing backend tests exercise the extended fresh schema as well.

The existing packager includes `ingestion/tracking.py` in the Python 3.13 x86_64 Lambda ZIP. The SQL migration is applied separately, never at cold start. A successful package build and local Lambda-adapter test are not a claim of execution in deployed AWS/Supabase infrastructure.

Static publication uses the separate read-only `ingestion.export_statistics` command. It is not an ingestion attempt and does not write catalogue/history rows; publication failures cannot change the outcome of successful imports. See [SEO publishing](../seo/publishing.md).

Use `python -m ingestion.tracking freshness` for per-source data recency derived from actual imported observation periods. Import times are separate, undated layers remain unknown and future periods are flagged. See [freshness validator](freshness.md).
