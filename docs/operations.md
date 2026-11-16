# Local operations

Commands run from the repository root unless stated otherwise. Use local/test databases for development. Live migrations, deployment and production data changes require explicit approval.

For hosted database setup and data migration, follow the [complete Supabase/PostgreSQL runbook](supabase-setup.md): portal settings, CA certificate, roles, three separate imports, verification and local/API/AWS connection steps. The ordinary Compose commands below target local PostGIS.

## Start the application

```bash
docker compose --profile app up --build -d
```

Open `http://localhost:5173` and check `http://localhost:5173/api/ready`. Compose waits for healthy PostGIS, runs the one-shot `migrate` service, and starts the API or ETL only after migration succeeds. This applies to fresh and existing volumes. It publishes the web and database on loopback and proxies `/api` to its private API container. `docker compose down` preserves the database volume.

The checked-in database password is a disposable local placeholder. Override Compose and backend connection settings together outside that disposable environment. `ConnectionStrings__Default` overrides the API connection; ingestion uses `DATABASE_URL` (or the documented server-side parameter configuration). Never put database credentials in `VITE_*` variables. Leave `VITE_API_BASE_URL` empty for the same-origin proxy. A separate API origin needs an explicit safe CORS allowlist entry; see [browser access](browser-access.md).

## Native hot reload

Requirements: .NET 10 SDK, Node.js 22.22.2+ (22 LTS), 24.15+ or 26+, and Python 3.11+ for ingestion.

```bash
docker compose --profile etl run --build --rm migrate
dotnet restore backend/ChapaTuChoro.slnx
dotnet run --project backend/src/ChapaTuChoro.Api --launch-profile http
```

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Vite proxies `/api` to the native API on localhost:5080. The API container does not publish that host port.

Compose gives nginx a fixed address on a dedicated proxy network, configured by `CTC_WEB_ADDRESS` (default `172.29.84.10`) within `CTC_PROXY_SUBNET` (default `172.29.84.0/24`). The API trusts only that proxy peer for forwarded client IPs, and nginx overwrites incoming `X-Forwarded-For`. If the subnet conflicts with a local network, override both settings together with an address inside the new subnet. See [proxy limits](rate-limiting.md#proxies-and-lambda).

## Database upgrades

Compose app/ETL startup runs the versioned migration service automatically. To run it explicitly:

```bash
docker compose --profile etl run --build --rm migrate
```

For native Python, install [uv](https://docs.astral.sh/uv/getting-started/installation/) and create an isolated environment first:

```bash
uv venv .venv
uv pip install --python .venv/bin/python -r ingestion/requirements.txt
docker compose up -d --wait postgis
export DATABASE_URL='postgresql://ctc:local_only_replace_me@localhost:5432/chapatuchoro'
uv run --python .venv/bin/python --no-project python -m ingestion.migrate
```

The runner reads the ordered `db/migrations.json` manifest and records each SQL file’s SHA-256 in `public.schema_migrations`. The active sequence is `001_baseline.sql` → `002_ingestion_leases.sql` → `003_population.sql` → `004_database_access.sql`. The baseline includes the earlier upgrades now retained in `db/archive/`; do not run those separately. See [migration ownership and numbering](../db/README.md) and [Supabase roles and manual credentials](supabase-setup.md).

An advisory transaction lock serializes runs. The updated runner recognizes old receipt names (`001_schema.sql`, `006_ingestion_leases.sql`, `007_population.sql`) and validates their checksums/order before translating them to the new names. It preserves checksums, original application dates and data; completed SQL is not replayed. Pending migrations, receipt renames and new ledger entries commit together. Failures roll back all changes. Unknown receipts, duplicate old/current receipts, gaps and altered checksums fail explicitly. Keep using the updated runner after normalization; older packages cannot read the new names.

For an existing unversioned installation, adoption compares its tables, columns, defaults, types, geometry SRIDs, constraints, indexes and RLS against a scratch baseline. It rejects incompatible objects, creates missing baseline objects, verifies the resulting structure and records the baseline digest. This does not invent import history or reset data. Inspect and resolve reported drift before retrying; do not delete the volume or edit an already applied migration to silence a mismatch.

PostGIS initialization does not mount schema SQL. The migration service applies the baseline and later upgrades and establishes the ledger for a new volume. Keep the migration role separate from the read-only API and restricted ingestion roles. Schema provisioning is an operator step, never an API startup or ingestion Lambda cold-start action.

## Ingest and inspect

After database migration:

```bash
docker compose --profile etl run --build --rm etl
# Native alternative with the same DATABASE_URL:
uv run --python .venv/bin/python --no-project python -m ingestion.etl
```

The statistical ETL downloads official MININTER CSV and INEI geometry, validates them and commits data/audit together. It requires reachable government services; changed schemas, ambiguous releases and HTTP failures stop explicitly. Download-only and manual validation/import commands remain in [data ingestion](data-ingestion.md).

[Concentration](concentration.md#run-locally) is a separate source/month pipeline. Never substitute its row counts for CSV reports or combine overlapping archives. Inspect operations with:

```bash
uv run --python .venv/bin/python --no-project python -m ingestion.tracking sources --limit 100
uv run --python .venv/bin/python --no-project python -m ingestion.tracking runs --limit 20
uv run --python .venv/bin/python --no-project python -m ingestion.tracking freshness
```

See [tracking](ingestion/tracking.md) for outcomes and abandoned-run reconciliation, [catalogue](sources/catalog.md) for usage evidence and [freshness](ingestion/freshness.md) for observation-date semantics. A successful container build is not proof of a successful import. Preserve explicit `failed`, `unavailable` and unknown states.

## Deployment boundaries

[AWS deployment](deployment.md) is the release checklist; [the prelaunch review](aws-review.md) records costs and blockers. [Data ingestion](data-ingestion.md) defines Lambda ingestion settings, and [static publishing](seo/publishing.md) defines exports/canonical origins. Local startup does not enable cloud scheduling, remote migrations or public indexing.
