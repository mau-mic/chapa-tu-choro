# Testing

Use local/test databases and synthetic fixtures. External provider availability and cloud deployment require separate checks. Commands run from the repository root unless stated otherwise.

## Local checks

Install Node/.NET prerequisites from [operations](operations.md#native-hot-reload), then prepare Python and frontend dependencies:

```bash
uv venv .venv
uv pip install --python .venv/bin/python -r ingestion/requirements.txt
npm --prefix frontend ci
```

Run the checks used for each affected part:

```bash
dotnet restore backend/ChapaTuChoro.slnx
dotnet build backend/ChapaTuChoro.slnx --configuration Release --no-restore
dotnet test backend/ChapaTuChoro.slnx --configuration Release --no-build
uv run --python .venv/bin/python --no-project python -m unittest discover -s ingestion/tests -v
npm --prefix frontend run lint
npm --prefix frontend run format:check
npm --prefix frontend run typecheck
npm --prefix frontend test
npm --prefix frontend run build
```

Use `npm --prefix frontend run format` to apply frontend formatting. Database suites skip without their connection settings: a passing run with skips does not verify PostGIS. Keep lockfiles and check `npm audit` after dependency changes; its result describes that dependency tree at that time.

## Real PostGIS integration

Start an isolated PostGIS database with a test role allowed to create disposable schemas, then set both suite connections:

```bash
export CTC_TEST_CONNECTIONSTRING='Host=localhost;Database=chapatuchoro_test;Username=ctc;Password=test_only'
export CTC_TEST_DATABASE_URL='postgresql://ctc:test_only@localhost:5432/chapatuchoro_test'
dotnet test backend/ChapaTuChoro.slnx --configuration Release --no-build
uv run --python .venv/bin/python --no-project python -m unittest discover -s ingestion/tests -v
```

These commands do not create the database or administrator role. The isolated test administrator needs CREATEROLE plus database/schema grant authority; permission tests also simulate Supabase roles and a non-superuser migration operator. Tests use uniquely named schemas, synthetic fixtures and real restricted login roles, and clean up afterward. Migration 004 changes cluster roles and the migration owner's future-object defaults, so use a disposable PostGIS instance, not the application's development database or a shared cluster. Never point the settings at production. Checks cover spatial/grouped queries, filtering, atomic rollback, migration lifecycle, repeat imports and population denominator/version semantics.

For focused role/RLS verification, use the same isolated `CTC_TEST_DATABASE_URL`:

```bash
uv run --python .venv/bin/python --no-project python -m unittest ingestion.tests.test_database_access ingestion.tests.test_migrate ingestion.tests.test_population -v
```

## Browser tests

```bash
cd frontend
npx playwright install chromium
npm run test:e2e
```

This builds the production site, type-checks fixtures and runs desktop/mobile Playwright projects. CI builds once and uses `test:e2e:built`. Set `CTC_E2E_API_URL` to a running real API for the separate CORS browser project; CI starts a published local .NET API and checks its real `/api/health` without requiring a database.

[Browser coverage](browser-tests.md) explains WebGL checks and failure artifacts. UI fixtures intercept external data; they do not establish source rights, provider availability or production behavior.

## CI and evidence

The [workflow](../.github/workflows/ci.yml) runs backend/Python PostGIS jobs independently, caches dependencies by their inputs, cancels superseded runs and retains failure artifacts for seven days. Actions are pinned and permissions read-only. Local inspection does not prove a successful remote Actions run.

Read the [evidence directory](evidence/) for dated commands/results, not a cumulative test count:

| Change | Evidence |
| --- | --- |
| Repository refactor and baseline checks | [Maintainability](evidence/maintainability-validation-2026-11-13.json) |
| Population workbook, rates and missing-data semantics | [Population](evidence/phase-4-population-2026-11-13.json) |
| Shared sidebar dates and scroll regression | [Filters/scroll](evidence/shared-trends-filters-2026-11-13.json), [simple shared period](evidence/simple-shared-period-2026-11-13.json) |
| Rate map, history, peers and initial loader | [Phase 4 closeout](evidence/phase-4-closeout-2026-11-13.json) |
| Strict moving means, prior-only baselines and weighted national comparison | [Advanced statistics](evidence/phase-4-advanced-statistics-2026-11-13.json) |
| Terraform and local payload/storage review | [Prelaunch review](evidence/prelaunch-review-2026-11-13.json) |
| Scoped district map, count preservation and buffered-response headroom | [Map payload validation](evidence/scoped-map-payloads-2026-11-14.json) |
| Migration numbering, legacy receipts, concurrency and rollback | [Migration compatibility](evidence/migration-numbering-2026-11-14.json) |
| Restricted API/ingestion roles, RLS, population staging and non-superuser provisioning | [Database access](evidence/database-access-2026-11-14.json) |

Population tests use synthetic workbooks; the government Excel is not required in CI. Application/API/PostGIS/frontend/browser suites check null versus zero, same-year population, source alignment, bounded queries, cancellation, errors and retry. Formula/availability rules live in the [population contract](ingestion/population.md), not duplicated here.

For older checks, use the [historical ledger](archive/mvp-validation.md). The earlier SDK environment needed `-p:AllowMissingPrunePackageData=true` for `NETSDK1226`; restricted environments may also need writable .NET/NuGet/temp directories. These are environment workarounds, not standard project requirements.
