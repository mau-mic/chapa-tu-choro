# Supabase/PostgreSQL setup and initial ingestion

For the complete hosted release sequence, see the [Supabase/AWS/HCP/Cloudflare roadmap](setup-roadmap.md). This guide owns the database provisioning and ingestion procedures.

This is the complete operator procedure for project creation, TLS, migrations, runtime accounts, initial ingestion, local API verification and the AWS handoff. Commands that write data are separated from validation. Run migrations as the schema owner and imports as the ingestion account. Credentials never belong in migrations, source control, Terraform values or frontend variables. The guide itself does not execute remote changes.

Run Bash commands from the repository root with Docker/Compose available. Steps 1–5 prepare access; steps 6–9 load and validate data; step 10 connects the local application; step 11 describes pending AWS work. For recorded outcomes rather than instructions, see the [November 14–15 setup record](evidence/supabase-setup-session-2026-11-15.md).

## 1. Portal prerequisites

In your Supabase project:

- Keep **Enable Data API** and automatic table exposure disabled: this application uses PostgreSQL drivers through its own API.
- Keep **automatic RLS** disabled; migrations explicitly enable RLS and define policies on application tables. This creation-time option is different from enabling RLS through our SQL. An automatic trigger that changes only `public` tables can interfere with baseline adoption, which compares them with a temporary verification schema.
- Confirm PostGIS is installed in `extensions`.
- Under **Database → Settings → SSL Configuration**, enable SSL enforcement and download the server root certificate. Save it locally as `/tmp/ctc-supabase-ca.crt` for the commands below. Re-download it if your project changes its CA. The certificate is public; it is not a password.
- Under **Connect**, copy the actual **Session pooler** parameters for operator commands. The production API also uses Session pooler; Python ingestion retains transaction mode as described below.

The commands below use the project established in this setup session: `xjjivrlwlizkskbhomnc`, pooler `aws-0-us-east-1.pooler.supabase.com`, database `postgres`, region `us-east-1`. Confirm these against your portal. Do not use these values for a different environment. Pooler usernames include the project reference; direct-connection usernames do not. Operator commands below use session-pooler port `5432`, which is reachable over IPv4.

In SQL Editor, confirm the PostGIS schema:

```sql
SELECT e.extname, e.extversion, n.nspname AS schema
FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE e.extname = 'postgis';
```

The setup session returned `postgis`, version `3.3.7`, schema `extensions`. This is an observed version, not a requirement to downgrade another project. Do not drop/reinstall an existing extension to change its schema without reviewing its dependencies.

The downloaded CA must be readable inside the container. `/tmp` is temporary: restore the certificate from the portal if it disappears after cleanup/reboot. `sslrootcert=system` failed for this pooler's Supabase CA; the commands use the explicit downloaded certificate and retain hostname verification.

## 2. Apply the versioned migrations

Run from the repository root in Bash. The password prompt is for the existing `postgres` administrator, used only for provisioning. The operator needs ownership of application objects, CREATEROLE, and grant authority for database CONNECT/TEMPORARY and `extensions` schema USAGE; runtime roles do not need these administrative powers. This changes the remote schema and permissions. If your target already contains data, verify a backup before proceeding.

```bash
(
  test -r /tmp/ctc-supabase-ca.crt || {
    echo 'Download the Supabase certificate to /tmp/ctc-supabase-ca.crt first.'
    exit 1
  }
  IFS= read -r -s -p 'Supabase administrator password: ' PGPASSWORD || exit 1
  echo
  export PGPASSWORD
  docker compose --profile etl run --build --rm --no-deps \
    -v /tmp/ctc-supabase-ca.crt:/certs/supabase-ca.crt:ro \
    -e PGPASSWORD \
    -e DATABASE_URL='host=aws-0-us-east-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.xjjivrlwlizkskbhomnc sslmode=verify-full sslrootcert=/certs/supabase-ca.crt' \
    migrate
)
```

For a fresh database the runner applies `001_baseline.sql`, `002_ingestion_leases.sql`, `003_population.sql` and `004_database_access.sql` in order. With 001–003 already applied, expect `{"applied": ["004_database_access.sql"]}`. A repeat returns `{"applied": []}`. Do not execute individual migration files in the SQL Editor: the runner owns the ledger/checksums.

The original baseline incorporated historical upgrades 002–005. The active files were subsequently renamed into the contiguous sequence above; superseded scripts are under `db/archive/` and must not be applied separately. The runner recognizes old receipt names, validates checksums and preserves their dates/data before applying pending SQL. See [migration numbering and compatibility](../db/README.md). Do not change an applied file or manually rewrite ledger rows.

Verify in SQL Editor:

```sql
SELECT name, applied_at FROM public.schema_migrations ORDER BY name;
```

Migration 004 creates two **NOLOGIN** permission groups. They have no password, role-administration privileges, schema ownership or RLS bypass. A conflicting existing group with ownership, inherited roles, privileged flags, or membership granted to Supabase API roles aborts the migration atomically; inspect the conflict instead of weakening the guard:

| Group | Access |
| --- | --- |
| `ctc_api_reader` | SELECT on statistics, boundaries, import provenance, concentration and population. No tracking/catalogue or migration-ledger access. |
| `ctc_ingestion_writer` | SELECT on input/catalogue/data/tracking tables; INSERT/UPDATE only where used by the current jobs. DELETE only on `concentration_series`, whose foreign keys cascade to derived snapshot groups. USAGE on the two identity sequences and TEMPORARY on the database for bulk staging. |

These are native PostgreSQL roles, not rows in an application permissions table. The migration's `VALUES` list is an in-memory permissions matrix used to issue grants and policies. `schema_migrations` records applied SQL, not runtime users. The existing `postgres` account remains the provisioning operator and is never the runtime account.

RLS policies intentionally allow each service principal all rows in its explicitly granted tables; there is no end-user/tenant identity in this data access model. SQL grants still prohibit other operations. RLS stays enabled on the internal migration ledger with no runtime policy. `PUBLIC`, `anon`, `authenticated` and `service_role` lose application-table/identity-sequence privileges, including private coordinates. Existing managed schemas, PostGIS functions and other applications' existing objects are not altered.

Default privileges are tightened for **the migration owner**: new tables, sequences and functions receive no automatic runtime/Data API access. PostgreSQL combines global and per-schema defaults, so both are revoked; the owner's future objects in other schemas are also affected by the global default change. Existing objects are unaffected. A different owner creating objects must configure its own default privileges. Future migrations must explicitly grant permissions and enable RLS for each new application table. Database-wide PUBLIC CONNECT/TEMP defaults remain unchanged for managed services; read-only here refers to persistent application data.

## 3. Create the connection accounts manually

After 004 succeeds, open **SQL Editor** as `postgres` and run the following once. It contains no passwords. If a name already exists, inspect it rather than reusing it blindly.

```sql
CREATE ROLE ctc_api LOGIN INHERIT
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE ctc_ingestion LOGIN INHERIT
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

GRANT ctc_api_reader TO ctc_api;
GRANT ctc_ingestion_writer TO ctc_ingestion;

ALTER ROLE ctc_api SET search_path TO public, extensions;
ALTER ROLE ctc_ingestion SET search_path TO public, extensions;
```

These accounts cannot authenticate with passwords until the next step. Do not grant them `postgres`, `service_role`, schema ownership, `CREATEROLE`, `BYPASSRLS`, or both permission groups.

## 4. Assign passwords without storing plaintext in SQL history

Use a password manager to generate a different strong password for each account. Open an interactive `psql` administrator session; this Docker command uses the already-required PostGIS image as a CLI tool and creates no database:

```bash
docker run --rm -it \
  -v /tmp/ctc-supabase-ca.crt:/certs/supabase-ca.crt:ro \
  --entrypoint psql postgis/postgis:17-3.5 \
  'host=aws-0-us-east-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.xjjivrlwlizkskbhomnc sslmode=verify-full sslrootcert=/certs/supabase-ca.crt'
```

Enter the administrator password at the connection prompt. Inside `psql`:

```text
\password ctc_api
\password ctc_ingestion
\q
```

Each `\password` prompts twice without echoing the new password. Do not put passwords into SQL Editor queries, shell commands, screenshots, or chat. The portal's project database-password reset changes `postgres`; it does not set these two account passwords.

## 5. Verify the accounts through the actual pooler

Use the same `docker run ... psql` command, replacing only `user=postgres.xjjivrlwlizkskbhomnc` with `user=ctc_api.xjjivrlwlizkskbhomnc`. Authenticate with the API account password and run:

```sql
SELECT current_user, current_setting('search_path');
SELECT count(*) FROM monthly_reports;
SELECT count(*) FROM population_releases;
SELECT count(*) FROM concentration_locations;
```

Expect `current_user = ctc_api` and `search_path = public, extensions`. Empty datasets can return zero. The following read-only permission check should return three false values:

```sql
SELECT has_table_privilege(current_user, 'public.monthly_reports', 'UPDATE') AS can_update,
       has_table_privilege(current_user, 'public.schema_migrations', 'SELECT') AS can_read_ledger,
       has_table_privilege(current_user, 'public.ingestion_runs', 'SELECT') AS can_read_operations;
```

Repeat the connection with `user=ctc_ingestion.xjjivrlwlizkskbhomnc` and its separate password. Expect `current_user = ctc_ingestion`, the same search path, and true/true/false/false below:

```sql
SELECT has_table_privilege(current_user, 'public.monthly_reports', 'INSERT') AS can_import,
       has_table_privilege(current_user, 'public.ingestion_runs', 'UPDATE') AS can_track,
       has_table_privilege(current_user, 'public.monthly_reports', 'DELETE') AS can_delete_statistics,
       has_table_privilege(current_user, 'public.schema_migrations', 'UPDATE') AS can_change_ledger;
```

In SQL Editor, confirm the migration and inspect the policies/advisors:

```sql
SELECT name, applied_at FROM public.schema_migrations ORDER BY name;
SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
FROM pg_roles
WHERE rolname IN ('ctc_api_reader','ctc_ingestion_writer','ctc_api','ctc_ingestion')
ORDER BY rolname;
SELECT tablename, policyname, roles, cmd
FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;
```

Run the project's Security/Performance Advisors in Supabase after applying. Local tests do not verify hosted policies, managed-role behavior or actual pooler settings; the account checks above are still required.

## 6. Import SIDPOL statistics and INEI boundaries

This writes to Supabase using `ctc_ingestion`. It downloads official sources; it does not copy the local database. `--no-deps` avoids starting the local database or migration service. Without the explicit `DATABASE_URL` override, Compose targets local PostGIS. Each password prompt below uses the account named in the prompt; the subshell removes the exported variable from your shell afterward. Container administrators can still inspect container environments: use these prompts on a trusted workstation.

The catalogue returned **nine CSV links** during setup. Automatic discovery deliberately refused to choose a release. The following command pins the publication already validated in this project, covering January 2018–September 2026. It is not a claim that this remains the latest publication. Review future releases before changing the URL; do not import all overlapping CSVs as independent counts.

```bash
(
  test -r /tmp/ctc-supabase-ca.crt || { echo 'Missing Supabase CA'; exit 1; }
  IFS= read -r -s -p 'Password for ctc_ingestion: ' PGPASSWORD || exit 1
  echo
  export PGPASSWORD
  docker compose --profile etl run --build --rm --no-deps \
    -v /tmp/ctc-supabase-ca.crt:/certs/supabase-ca.crt:ro \
    -e PGPASSWORD \
    -e INGESTION_DATASET=statistics \
    -e SIDPOL_SOURCE_URL='https://www.datosabiertos.gob.pe/sites/default/files/DATASET_Denuncias%20Policiales%20-%20Enero%202018%20a%20Septiembre%202026.csv' \
    -e DATABASE_URL='host=aws-0-us-east-1.pooler.supabase.com port=5432 dbname=postgres user=ctc_ingestion.xjjivrlwlizkskbhomnc sslmode=verify-full sslrootcert=/certs/supabase-ca.crt' \
    etl
)
```

Expect final `status: succeeded`. The job validates before loading, then commits statistics, both boundary layers and successful-import receipts in one transaction. Attempt tracking is recorded separately, including failures. Exact repeated statistical releases are skipped by checksum. Absent keys in later releases are retained; this is not destructive snapshot reconciliation. See [ETL semantics](data-ingestion.md).

These workstation commands do not configure `DATA_BUCKET`, so they do not establish an S3 raw-source archive. Source references and checksums in database receipts are still retained. An AWS archive and database backup are distinct from successful ingestion.

Verify in SQL Editor:

```sql
SELECT (SELECT count(*) FROM monthly_reports) AS statistical_rows,
       (SELECT count(*) FROM district_boundaries) AS districts,
       (SELECT count(*) FROM department_boundaries) AS departments;
SELECT min(make_date(year, month, 1)) AS first_period,
       max(make_date(year, month, 1)) AS last_period,
       sum(reports) AS reported_count
FROM monthly_reports;
SELECT source_kind, source_name, sha256, imported_at
FROM import_runs ORDER BY imported_at DESC;
```

These counts concern published complaint aggregates, not verified individual incidents or personal risk. Compare representative district/category/month totals with the source, not just table row counts.

## 7. Import concentration separately

The statistics ETL does **not** populate `concentration_*`. These tables use independently reviewed MININTER ArcGIS snapshots. INEI district boundaries must already be loaded. First verify one month with a complete command:

```bash
(
  test -r /tmp/ctc-supabase-ca.crt || { echo 'Missing Supabase CA'; exit 1; }
  IFS= read -r -s -p 'Password for ctc_ingestion: ' PGPASSWORD || exit 1
  echo
  export PGPASSWORD
  docker compose --profile etl run --build --rm --no-deps \
    -v /tmp/ctc-supabase-ca.crt:/certs/supabase-ca.crt:ro \
    -e PGPASSWORD \
    -e INGESTION_DATASET=concentration \
    -e DATABASE_URL='host=aws-0-us-east-1.pooler.supabase.com port=5432 dbname=postgres user=ctc_ingestion.xjjivrlwlizkskbhomnc sslmode=verify-full sslrootcert=/certs/supabase-ca.crt' \
    etl --year 2026 --month 9
)
```

`etl` is a Compose service name, not a shell command. Do not execute `etl --year ...` on its own. For the full reviewed 2026/2025 backfill, use this complete block; it stops on a failed invocation:

```bash
(
  test -r /tmp/ctc-supabase-ca.crt || { echo 'Missing Supabase CA'; exit 1; }
  IFS= read -r -s -p 'Password for ctc_ingestion: ' PGPASSWORD || exit 1
  echo
  export PGPASSWORD
  for year in 2026 2025; do
    docker compose --profile etl run --build --rm --no-deps \
      -v /tmp/ctc-supabase-ca.crt:/certs/supabase-ca.crt:ro \
      -e PGPASSWORD \
      -e INGESTION_DATASET=concentration \
      -e DATABASE_URL='host=aws-0-us-east-1.pooler.supabase.com port=5432 dbname=postgres user=ctc_ingestion.xjjivrlwlizkskbhomnc sslmode=verify-full sslrootcert=/certs/supabase-ca.crt' \
      etl --year "$year" || exit 1
  done
)
```

Without `--month`, the importer processes months for the selected sources. In 2026 one authoritative snapshot derives `all` and the named categories; 2025 uses separate category archives and has no verified combined total. `imported` and `unchanged` are completed snapshots; `unavailable` means no available source snapshot, not zero crimes or a completed load. Earlier completed months remain committed if a later month fails. Repeating reviewed unchanged snapshots is safe.

These year examples were used in November 2026. The importer accepts only the current/previous calendar year and explicitly registered releases. Review the registry before using this runbook in another year; do not simply change the year to relabel old data. Backfills run locally and must not be assumed to fit one Lambda invocation. See [source rules and privacy thresholds](concentration.md).

```sql
SELECT source_key, year, month, source_rows, imported_at
FROM concentration_imports ORDER BY year DESC, month DESC, source_key;
SELECT source_key, year, count(DISTINCT month) AS imported_months
FROM concentration_imports GROUP BY source_key, year ORDER BY year, source_key;
SELECT (SELECT count(*) FROM concentration_cells) AS cells,
       (SELECT count(*) FROM concentration_locations) AS location_groups;
```

Cells and location groups are materializations with category breakdowns. Their row counts are not unique crimes and should not be compared directly with the source-row count. Keep locations server-only. A filtered map can be empty because of missing snapshots or suppression thresholds even when tables contain data.

## 8. Import the INEI population workbook

Use the original official `data/population.xlsx`, never an edited/recalculated substitute. The Compose population service mounts `data/` read-only at `/input`; `POPULATION_DATA_DIR` can override that directory. The supported publication is the 2018–2026 preliminary population projection workbook, not definitive Census 2025 results.

Validate without connecting to any database:

```bash
sha256sum data/population.xlsx
docker compose --profile etl run --build --rm --no-deps \
  population /input/population.xlsx --check-only
```

The workbook validated in this setup has SHA-256 `9436df29b883fd4a9db3705040a6668ff4efe7047c2643249b6b6bedd90d5c8b`, 19,026 observations over 2018–2026, and 59 explicitly unavailable values. These are checks for that file, not universal expected counts for every future publication. Null population values remain null with their source notes, not zero.

Import to Supabase with the writer account:

```bash
(
  test -r /tmp/ctc-supabase-ca.crt || { echo 'Missing Supabase CA'; exit 1; }
  IFS= read -r -s -p 'Password for ctc_ingestion: ' PGPASSWORD || exit 1
  echo
  export PGPASSWORD
  docker compose --profile etl run --build --rm --no-deps \
    -v /tmp/ctc-supabase-ca.crt:/certs/supabase-ca.crt:ro \
    -e PGPASSWORD \
    -e DATABASE_URL='host=aws-0-us-east-1.pooler.supabase.com port=5432 dbname=postgres user=ctc_ingestion.xjjivrlwlizkskbhomnc sslmode=verify-full sslrootcert=/certs/supabase-ca.crt' \
    population /input/population.xlsx
)
```

Expect `status: imported`, or `skipped` for a previously imported digest. Bulk COPY goes into temporary staging followed by INSERT into the RLS-protected observations table, all in the same transaction. Direct COPY into the protected table is unsupported for restricted roles. Old releases remain immutable; replaying an old checksum does not reactivate it over a newer release.

```sql
SELECT sha256, source_url, active, imported_at
FROM population_releases ORDER BY imported_at DESC;
SELECT year, count(*) AS observations,
       count(*) FILTER (WHERE people IS NULL) AS unavailable
FROM population_observations
WHERE release_sha256 = (SELECT sha256 FROM population_releases WHERE active)
GROUP BY year ORDER BY year;
```

For this workbook expect one active release and 2,114 observations per year. See [population methodology](ingestion/population.md) for denominator and geographic-coverage limitations.

## 9. Review completeness and attempts

Use the preceding coverage queries and inspect the latest execution attempts:

```sql
SELECT run_id, pipeline, status, stage, started_at, finished_at, error_type
FROM ingestion_runs ORDER BY started_at DESC LIMIT 30;
SELECT r.pipeline, s.source_key, s.outcome, s.sha256, s.counters
FROM ingestion_run_sources s JOIN ingestion_runs r USING (run_id)
ORDER BY r.started_at DESC, s.source_key LIMIT 50;
```

Keep previous failed attempts: successful recovery does not erase their audit history. A successful process exit alone does not establish geographic completeness, source availability, or totals matching the source. Review unavailable months and unmapped records explicitly. A backup/recovery procedure and Supabase advisors remain separate checks.

## 10. Connect the local API to Supabase

This optional smoke test points the local application at the imported hosted data. It does not configure Lambda. The API uses the read-only `ctc_api` account and Npgsql connection-string format, not a libpq DSN. Its existing pool limit is two connections and automatic prepared statements are disabled.

Create an override file containing no passwords:

```bash
cat > /tmp/ctc-supabase-api.compose.yaml <<'YAML'
services:
  api:
    environment:
      ConnectionStrings__Default: "Host=aws-0-us-east-1.pooler.supabase.com;Port=5432;Database=postgres;Username=ctc_api.xjjivrlwlizkskbhomnc;SSL Mode=VerifyFull;Root Certificate=/certs/supabase-ca.crt;Search Path=public,extensions"
      PGPASSWORD: "${PGPASSWORD:?Enter the API password first}"
    volumes:
      - /tmp/ctc-supabase-ca.crt:/certs/supabase-ca.crt:ro
YAML
```

Start only the API and frontend, recreating them so nginx resolves the new API container:

```bash
(
  test -r /tmp/ctc-supabase-ca.crt || { echo 'Missing Supabase CA'; exit 1; }
  IFS= read -r -s -p 'Password for ctc_api: ' PGPASSWORD || exit 1
  echo
  export PGPASSWORD
  docker compose -f compose.yaml -f /tmp/ctc-supabase-api.compose.yaml \
    --profile app up -d --build --force-recreate --no-deps api web
)
```

```bash
curl --fail-with-body http://localhost:5173/api/ready
curl --fail-with-body http://localhost:5173/api/metadata
curl --fail-with-body http://localhost:5173/api/concentration/metadata
```

Readiness should return `{"status":"ready"}`. It checks connectivity, not every table grant. Open `http://localhost:5173` and verify statistics, geographic maps, concentration/radius queries and population comparisons against imported periods. Keep credentials and private coordinate groups out of the browser.

```bash
docker compose logs --tail=80 api
```

Use the override whenever starting against Supabase. Ordinary Compose startup restores the local database configuration and may run its local migrations. Never paste a password-bearing `docker compose config`/container environment dump into a report. This override uses session port `5432` for the persistent local API; AWS has its own handoff below.

## 11. AWS handoff — pending deployment work

Terraform already defines separate Lambda roles with scoped `ssm:GetParameter` permissions and separate secret-name environment variables. It does not create the SecureString values. These mechanisms are implemented; the following deployment actions were not confirmed in this setup session.

1. **Build with the reviewed CA.** Both packaging scripts include the repository's public `certs/supabase-ca.crt` in `dist/api.zip` and `dist/ingestion.zip` at `certs/supabase-ca.crt` (runtime path `/var/task/certs/supabase-ca.crt`). They fail before building if the source certificate is missing or unreadable. See [certificate provenance and rotation](../certs/README.md). Rebuild both ZIPs after a CA update and verify the packaged bytes before running an approved deployment. The Docker `/certs` mount and workstation `/tmp` file are not available in Lambda. Connection secrets still need the runtime path and full certificate/hostname verification.
2. **Create two SSM SecureStrings in the Lambda region**, outside Terraform, using distinct account passwords. Choose environment-specific paths and set the Terraform variables to those exact paths. The current defaults/examples use `dev`; do not silently use those names for production.

| Terraform variable | Current default parameter path | Secret consumer |
| --- | --- | --- |
| `database_ssm_parameter_name` | `/chapa-tu-choro/dev/database-url` | API: `Database__SsmParameterName` |
| `ingestion_database_ssm_parameter_name` | `/chapa-tu-choro/dev/ingestion-database-url` | Python: `DATABASE_URL_PARAMETER_NAME` |

In the AWS console, open **Systems Manager → Parameter Store → Create parameter**, select **SecureString**, and enter the value privately. Never put real values in this guide, tfvars, Terraform state, shell history or frontend configuration. Standard SSM encryption is assumed by the current IAM configuration; a customer-managed KMS key needs matching scoped `kms:Decrypt`/key permissions. See [AWS SecureString documentation](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html).

These are **templates**, not ready-to-paste credentials. Npgsql values with delimiter characters need connection-string quoting; a double quote inside a double-quoted value is doubled. In a libpq single-quoted value, backslashes and single quotes must be escaped with backslashes. URI passwords require percent encoding instead. Do not paste an unescaped password into any template.

API SecureString (Npgsql format, **Session pooler**, port `5432`):

```text
Host=aws-0-us-east-1.pooler.supabase.com;Port=5432;Database=postgres;Username=ctc_api.xjjivrlwlizkskbhomnc;Password="<API_PASSWORD>";SSL Mode=VerifyFull;Root Certificate=/var/task/certs/supabase-ca.crt;Search Path=public,extensions
```

Ingestion SecureString (libpq format, transaction pooler):

```text
host=aws-0-us-east-1.pooler.supabase.com port=6543 dbname=postgres user=ctc_ingestion.xjjivrlwlizkskbhomnc password='<INGESTION_PASSWORD>' sslmode=verify-full sslrootcert=/var/task/certs/supabase-ca.crt
```

3. **Use Session pooler port `5432` for the production API.** Copy the actual host/port from **Connect → Session pooler**, retaining the restricted `ctc_api.<project-ref>` username, `VerifyFull`, CA and search path. Python ingestion remains on transaction port `6543`; this incident did not validate or change its runtime connection. Both clients continue to disable automatic prepared statements. Keep migrations/backups on direct or session connections. Never run migrations during API/Lambda startup.

   This API-specific choice follows the 2026-11-16 timeout investigation: after switching the API connection and renewing Lambda environments, supplied CloudWatch logs showed metadata, categories and explorer returning 200; metadata completed all stages, including the previously stalled count. The experiment changed both pooler mode and environments, so it does not establish a provider defect or isolate either change as the sole cause. Session connections consume backend capacity for the connection lifetime; retain the small API client pool (maximum 2 per execution environment) and monitor total connections as Lambda concurrency grows. See [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).
4. **Pin `sidpol_source_url`** in the deployment configuration to the reviewed CSV used in step 6. Empty discovery currently fails on the nine-link catalogue. Keep `enable_ingestion_schedule = false` until a manual invocation succeeds.
5. **Review and deploy the built artifacts through the release procedure.** The API retrieves its secret at process startup; recycle/redeploy warm environments after credential rotation. Python retrieves its secret for each new connection. Remove any unintended direct `DATABASE_URL` override, which takes precedence over SSM in Python. The current Lambdas have no customer VPC attachment; adding one requires an egress design for government sources, Supabase and AWS APIs.
6. **Verify through CloudFront:** readiness plus real statistics, map, population and concentration endpoints; TLS failures, pool usage, latency and buffered response sizes; one manually invoked ETL with source provenance. Configure failure notifications and backup/recovery, then enable scheduling. The default scheduled ETL only refreshes statistics/boundaries. Concentration and population are separate jobs; no automatic population download/scheduled adapter is implemented.

See [AWS deployment](deployment.md) for release approval, IAM, cost, rollback and frontend steps. This guide does not provision AWS resources or assert that AWS connectivity has passed.

## 12. Troubleshooting from this setup

| Symptom | Meaning and next action |
| --- | --- |
| `SSL error: certificate verify failed` with `sslrootcert=system` | Use the CA downloaded from the portal, mount it read-only and set the in-container `sslrootcert`/`Root Certificate` path. Keep `verify-full`/`VerifyFull`. This connection failure happens before migration SQL runs. |
| `Found 9 unambiguous CSV download links` | Discovery found multiple candidates. Pin a reviewed official release as in step 6; do not choose the first link or add overlapping files together. |
| `etl_failed`, stage `extract`, `ValueError` after the district download | The setup failure was inside SIDPOL download/discovery. This generic log alone does not establish the reason for every future failure. Run the downloader-only diagnostic below to obtain its safe detailed error. |
| Statistics exist but concentration tables are empty | Run step 7. The statistics ETL does not import ArcGIS concentration. |
| `etl: command not found` | `etl` is a service name. Execute the full `docker compose ... etl ...` block. |
| Concentration `unavailable` | No snapshot was imported for that source/month. Preserve this distinction from zero counts and failed jobs. |
| `COPY FROM not supported with row-level security` for population | Rebuild the current ingestion image. The supported importer stages COPY into a temp table, then INSERTs through RLS. Do not disable RLS or grant bypass privileges to work around an old image. |
| Missing population workbook | Restore the official file at `data/population.xlsx` or set `POPULATION_DATA_DIR`, then run `--check-only` before importing. |
| Migration checksum, unknown receipt or unsafe existing role error | Inspect the conflict and resolve deliberately. Do not delete data, rewrite receipts, change applied SQL or weaken the role guard. |
| API is ready but displays old/local data | Confirm it was started with the Supabase override, then inspect imported periods and metadata. Readiness alone does not identify every dataset or prove complete imports. |

Downloader-only diagnostic (no database writes or credentials):

```bash
docker compose --profile etl run --rm --no-deps \
  --entrypoint python etl -m ingestion.download_official \
  --dataset sidpol --output-dir /tmp/sidpol-check
```

An explicit release can also be validated by appending `--sidpol-url '<reviewed-official-CSV-URL>'` to that diagnostic. Successful Docker image creation/build is not proof of a committed import. Preserve failed-attempt receipts and provenance when investigating recovery.

References: [Supabase roles](https://supabase.com/docs/guides/database/postgres/roles), [Data API security](https://supabase.com/docs/guides/api/securing-your-api), [connections and TLS](https://supabase.com/docs/guides/database/connecting-to-postgres), [Npgsql parameters](https://www.npgsql.org/doc/connection-string-parameters.html), [libpq connection strings](https://www.postgresql.org/docs/current/libpq-connect.html), [psql password prompts](https://www.postgresql.org/docs/current/app-psql.html).
