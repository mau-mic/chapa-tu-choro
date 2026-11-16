# Official-data ETL

Phase 4 adds a separate [INEI population XLSX import and comparison](ingestion/population.md). It uses the supplied 2018–2026 workbook, preserves release history and does not change the existing statistical or geographic feeds.

See [Phase 3 tracking setup](ingestion/tracking.md) and the [persistent source catalogue](sources/catalog.md). Run the [versioned migration command](operations.md#database-upgrades) before updated automatic or manual write jobs.

**National coverage:** the ETL now retains all valid district statistics and all INEI district geometries, and additionally requests official department boundaries. Existing databases need the [versioned schema upgrade](operations.md#database-upgrades) before running it. See [nationwide map and migration](nationwide-map.md). Earlier Lima/Callao counts below describe the initial verification, not the new import scope.

One Python pipeline runs locally, in Docker Compose, and as the ingestion Lambda. Every run requests **both** official sources (MININTER CSV plus INEI district and department layers), validates their relationship, and inserts/updates district boundaries and report aggregates in PostgreSQL/PostGIS. Manual downloads, QGIS exports, S3 uploads and separate import commands are not required for the normal flow.

```mermaid
flowchart LR
  Trigger[Local CLI / Compose / EventBridge] --> ETL[Shared Python ETL]
  MIN[MININTER catalogue and official CSV] --> ETL
  INEI[INEI district WFS] --> ETL
  ETL --> Validate[Normalize and validate]
  Validate --> Archive[Optional private S3 source archive]
  Archive --> Load[One database transaction]
  Load --> DB[(PostgreSQL / PostGIS)]
```

## Local development: Docker Compose

Start Docker, then run from the repository root:

```bash
# Start the application and its PostGIS database.
docker compose --profile app up --build -d

# Extract, transform and load both government datasets.
docker compose --profile etl run --build --rm etl
# Equivalent shortcut: make etl
```

The ETL service starts/waits for PostGIS if it is not already running. It runs once and exits with status 0 on success or a nonzero status on failure; it is not a continuously running service. No AWS account or local Python installation is needed for this route. Compose supplies only disposable local credentials and does not pass AWS credentials into this container. Inputs live in a writable container directory; the database lives in the existing persistent `postgis_data` volume.

Open <http://localhost:5173> and refresh after the ETL completes. Check <http://localhost:5173/api/metadata> for imported periods and source audit entries. Match at least one district/category/month with the source before treating a deployment as verified.

## Local development: Python

With PostgreSQL/PostGIS running and the [versioned migrations](operations.md#database-upgrades) applied:

```bash
uv venv .venv
uv pip install --python .venv/bin/python -r ingestion/requirements.txt
source .venv/bin/activate
export DATABASE_URL='postgresql://ctc:local_only_replace_me@localhost:5432/chapatuchoro'
uv run --python .venv/bin/python --no-project python -m ingestion.etl
```

Install [uv](https://docs.astral.sh/uv/getting-started/installation/) first. The remaining native commands assume this activated environment. The default `data/etl` workspace is ignored by Git. Each invocation gets a separate temporary directory, removed on success or failure. Use `--work-dir /some/writable/directory` or `ETL_WORK_DIR` to change its parent. For retained files or debugging, use:

```bash
python -m ingestion.download_official --dataset all
python -m ingestion.import_sidpol data/SIDPOL.csv --check-only
python -m ingestion.import_districts data/districts.geojson --check-only
```

The standalone import commands remain supported for deliberate, manually supplied official files; the normal ETL calls both importers automatically with a shared transaction.

## Extract and transform

- **MININTER:** discover a single CSV download link from the [official catalogue](https://www.datosabiertos.gob.pe/dataset/denuncias-policiales-registradas-nivel-nacional-mininter). If the catalogue provides no unambiguous release, fail rather than guess. Pin a verified release with `SIDPOL_SOURCE_URL` or `--sidpol-url` when needed. Discovery can follow a single resource-detail page; multiple resource choices require a pinned URL.
- **INEI:** request the complete official `Interoperabilidad:ig_distrito` WFS layer in EPSG:4326, verify returned/matched feature counts, and retain all districts nationwide. Also request `Interoperabilidad:ig_departamento` for the national overview. The standard WFS request avoids INEI's filtered-request failure. Preserve the raw response; normalize actual `ubigeo`/`nombdist` properties to the importer contract without changing coordinates or names. No QGIS conversion or invented geometry is involved. See the [INEI portal](https://ide.inei.gob.pe/).
- Only credential-free HTTPS government URLs and redirects are accepted. Each HTTP operation has a 60-second socket timeout. Transient 429/500/502/503/504 and network failures receive up to three attempts with bounded backoff. 403/418 are explicit access failures; there is no cookie automation or access-control bypass. Download limits are 256 MiB for CSV and 64 MiB for WFS.
- The CSV contract is UTF-8, optional BOM, comma/semicolon separation, with `ANIO,MES,DPTO_HECHO_NEW,PROV_HECHO,DIST_HECHO,UBIGEO_HECHO,P_MODALIDADES,cantidad`. These are aggregated report counts, not individual case records. Periods, nonnegative integer counts, category lengths, geographic identifiers and names must be valid.
- GeoJSON requires district Polygon/MultiPolygon geometries, closed rings, finite two-dimensional coordinates and verified WGS84 metadata. PostGIS additionally rejects invalid/empty/zero-area polygons at load time. No silent geometry repair occurs.
- Cross-source validation checks department/district names within each district-period and reports province-label variation groups and reports unmatched district identifiers. Missing geometry is a reported coverage issue, not a fabricated zero; matching statistics still load and remain visible in totals/ranking.
- Transformation groups source counts by year/month/UBIGEO/category (implemented by staging and SQL aggregation during load). The run summary includes scanned/selected/out-of-scope/rejected rows, aggregate-key count, source report sum, district coverage and latest source period. A sum that exceeds the existing SQL integer capacity fails atomically.

## Load semantics and recovery

All source inputs are downloaded and validated **before** a database connection is opened. A single outer PostgreSQL transaction contains the department/district geometry imports, the statistics import and their `import_runs` entries. Their internal transactions become savepoints. Failure of either load rolls back all boundary changes, report changes and audit entries from the run.

An advisory transaction lock serializes writers, including standalone imports; the pipeline waits at most 15 seconds for a lock. Each SQL statement has a 180-second timeout. Geometry inputs use bulk COPY staging and set-based PostGIS validation/upserts to avoid thousands of network round trips for national coverage. Downloads and S3 operations happen before the database transaction, keeping database locks short. Psycopg disables server-side prepared statements for Supabase transaction-pooler compatibility and uses a 10-second connection timeout.

Repeated national CSV SHA-256 hashes are skipped under the `sidpol-national` audit kind; a receipt from the older Lima-only import cannot skip the first national load. Revised CSV keys are upserted with their new aggregate count; the previous count is never added again. Boundaries are upserted by UBIGEO, and duplicate source-audit hashes do not create extra audit records. Geometry processing counts describe processed upserts, not necessarily newly inserted rows.

**No deletion reconciliation:** absent keys in a later file are retained. Use compatible official releases; do not mix overlapping partial releases as if they were complete historical snapshots. A failed run is safe to retry, but a retry using catalogue discovery can select a newer official release. Pin the source URL for repeatable release selection.

Logs are JSON with run ID, stage, durations, counts and checksums. The final JSON includes source URLs, hashes, archive objects and load results. Failures identify `configuration`, `extract`, `transform`, `archive`, or `load` plus the exception type. Database connection strings and raw exception messages are not logged. Use download-only validation to inspect source-format problems. Never put credentials or tokens in source URLs.

Statistical releases use incremental key replacement: duplicate keys within one release are summed; supplied `(year, month, UBIGEO, category)` keys replace retained values; omitted keys remain. A previously imported byte checksum is skipped even after a newer revision, so replaying an older file cannot undo that revision. Corrections require a newly published or explicitly reviewed revised file, not deletion of the checksum audit or destructive snapshot reconciliation.

## Production: Lambda

The handler is `ingestion.lambda_handler.handler`; it delegates to the same `run_etl` use case. Event payloads cannot override configured source URLs, secrets or destinations. Failures raise an exception so Lambda records the error and applies configured retries.

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL_PARAMETER_NAME` | Name of an existing SSM SecureString containing the ingestion PostgreSQL URI |
| `DATABASE_URL` | Direct URI alternative; intended for local development, takes precedence over SSM |
| `SIDPOL_SOURCE_URL` | Optional pinned official CSV URL; empty enables catalogue discovery |
| `DATA_BUCKET` | Optional source-archive bucket; supplied by Terraform for Lambda |
| `ETL_WORK_DIR` | Local workspace parent; Lambda always uses `/tmp/chapa-tu-choro-etl` |

SSM is read for each new ETL connection, so warm Lambda invocations do not indefinitely cache an old secret. The SSM URI must use a TLS-enabled connection appropriate to your Supabase project; configure certificate verification for production. The Lambda needs outbound HTTPS to both government sites, SSM and S3, plus outbound access to PostgreSQL. The supplied Lambda has no VPC attachment; adding one requires providing appropriate internet egress. Source reachability from a local machine does not prove reachability from an AWS IP address.

Terraform defines Python 3.13, x86_64, 1,536 MiB memory, 1,024 MiB `/tmp`, a 900-second execution limit and reserved concurrency 1. Each invocation cleans its workspace; no stale warm-container file is reused. Lambda's writable scratch directory is `/tmp`; see [AWS ephemeral-storage documentation](https://docs.aws.amazon.com/lambda/latest/dg/configuration-ephemeral-storage.html).

When `DATA_BUCKET` is configured, archive the CSV, original WFS response, normalized GeoJSON and provenance sidecars for all three datasets under `official/<sha256>/<filename>` using server-side encryption. Keys address file contents. **Archive failure prevents loading**. An archive can remain after a later database rollback; an archived source alone does not mean the run committed. The bucket and CloudWatch logs are private infrastructure already represented in Terraform; no new queue or orchestration service is needed.

### Database provisioning and least privilege

Apply the [versioned schema migrations](operations.md#database-upgrades) with an authorized migration role; the ETL never creates the database/schema or installs PostGIS in production. Migration 004 supplies the `ctc_ingestion_writer` and `ctc_api_reader` permission groups, including RLS policies. Follow [Supabase setup](supabase-setup.md) to provision separate login accounts/passwords. Ingestion can upsert statistics/boundaries and append import receipts, read the source catalogue, update attempt tracking and use temporary staging/identity sequences. The statistics importer has no DELETE privilege; the concentration importer can delete only its series (with derived-row cascades). The API is read-only on its application dependencies. Neither runtime group can alter the schema or migration ledger.

Configure two distinct SSM parameters. `database_ssm_parameter_name` contains the API's **Npgsql connection string** (`Host=...;Database=...;Username=...;Password=...`). `ingestion_database_ssm_parameter_name` contains a **PostgreSQL URI or libpq DSN** for the ingestion writer role. Their default paths are `/chapa-tu-choro/dev/database-url` and `/chapa-tu-choro/dev/ingestion-database-url`. Empty/invalid paths are rejected, and a Lambda precondition rejects using the same parameter for both applications. There is no shared-secret fallback. Set both paths explicitly for production. Create/update the SecureString outside Terraform so the secret value is not placed in Terraform state. If using a customer-managed KMS key, grant scoped `kms:Decrypt` permission as well; the template assumes the standard SSM encryption configuration.

The ingestion IAM policy permits reading only its configured SSM parameter and writing only `official/*` in the existing archive bucket. It no longer needs `s3:GetObject` or a manually uploaded `SIDPOL_S3_KEY`.

### Package and schedule

Build only the Python Lambda artifact:

```bash
bash scripts/package-ingestion.sh
# dist/ingestion.zip
```

The script packages dependency versions from `ingestion/requirements.lock` using Linux x86_64 / CPython 3.13 binary wheels, regardless of the workstation's Python version. Source modules are placed under `ingestion/` at the ZIP root; tests, downloaded data and secrets are excluded. The all-Lambda script calls this packager after building the API. Native dependencies must match the Lambda runtime/architecture; see [AWS Python ZIP packaging guidance](https://docs.aws.amazon.com/lambda/latest/dg/python-package.html).

Relevant Terraform settings:

```hcl
ingestion_database_ssm_parameter_name = "/chapa-tu-choro/prod/ingestion-database-url"
sidpol_source_url                    = "" # Discover from catalogue, or pin a verified release URL.
enable_ingestion_schedule            = true
ingestion_schedule_expression        = "rate(7 days)"
```

Deployment still requires reviewing the **whole** existing Terraform stack, its resources and costs, building both expected ZIP artifacts, supplying secrets/schema, and explicitly applying the reviewed deployment. No infrastructure has been deployed by this change. The schedule defaults to disabled; after deployment and a successful test invocation, enable it deliberately. No manual government-file upload is required.

EventBridge invokes the Lambda asynchronously. The schedule bounds delivery retries to two attempts/one hour, and Lambda execution retries to one retry/one hour; these are separate mechanisms. See [AWS Scheduler/Lambda guidance](https://docs.aws.amazon.com/lambda/latest/dg/with-eventbridge-scheduler.html). There is no DLQ or failure alarm in this MVP; monitor CloudWatch `Errors`, `Throttles`, duration and ETL failure logs and add alerting before relying on unattended production operation. Do not assume failed scheduled runs notify anyone automatically.

Migration from the old implementation: remove `sidpol_s3_key` from custom tfvars and `SIDPOL_S3_KEY` from manually managed Lambda settings. S3 is now the **archive output**, not a source someone must upload first. Rebuild the ingestion ZIP and review the IAM/environment/schedule changes before deployment.

## Validation

```bash
python -m unittest discover -s ingestion/tests -v
python -m compileall -q ingestion
docker compose --profile etl config --quiet
bash -n scripts/package-ingestion.sh scripts/package-lambdas.sh
terraform -chdir=infra/terraform fmt -check
```

Real PostgreSQL tests require a disposable local/test PostGIS database:

```bash
export CTC_TEST_DATABASE_URL='postgresql://ctc:local_only_replace_me@localhost:5432/chapatuchoro'
python -m unittest discover -s ingestion/tests -v
```

They use isolated schemas and explicitly synthetic fixtures; they verify full-pipeline idempotency and rollback of boundaries/audits when the report load fails. HTTP fixtures keep CI independent of government-site outages. CI supplies PostGIS for these tests. Live source downloads were verified on 2026-11-11; complete source-to-database and AWS execution must also be validated in their actual environments. See [validation notes](mvp-validation.md).

## Geographic concentration dataset

`INGESTION_DATASET=concentration` selects the separate ArcGIS-to-PostGIS aggregate pipeline in CLI/Compose and the existing Lambda handler. Default statistical ingestion is unchanged. Start PostgreSQL with `docker compose up -d --wait postgis` and successfully run the [versioned migration command](operations.md#database-upgrades) before running imports. Compose ETL startup waits for healthy PostGIS and the successful one-shot migration service, including existing volumes. Native Python requires the explicit migration command first. Follow the [ordered setup and troubleshooting](concentration.md#run-locally) for `postgis is not running` or `UndefinedTable`; no volume reset is needed. Source URLs are fixed to the verified tenant/layers; period/category extraction never unions overlapping 2026 archives. Raw case rows and identifiers remain temporary. Committed data includes aggregates/audits plus server-only validated coordinate/count groups for metric-radius queries; no addresses or personal fields are requested or stored. The coordinate table has RLS and rejects browser-role access. A `locations-v1` checksum forces one reimport of older snapshots; exact repeats remain idempotent. See [concentration setup and source semantics](concentration.md) for scoped monthly runs, backfill, checksum/rollback behavior and environment options. No schedules or production resources were changed.

## Read-only statistical publication export

After a successful national SIDPOL import, `python -m ingestion.export_statistics --output frontend/.generated/statistics.json` exports a consistent aggregate edition for the frontend build. It reads only statistics and safe provenance, does not alter ingestion history or data, and preserves the previous file on failure. A failed build/export must not be published. This is a separate publication operation, not an automatic Lambda deployment. Local Compose commands, Supabase read permissions, static-period semantics and rebuild steps are documented in [SEO publishing](seo/publishing.md).

Source recency is available through `python -m ingestion.tracking freshness`; see [the freshness validator](ingestion/freshness.md) for reporting-month versus occurrence-month semantics and unknown/future dates.
