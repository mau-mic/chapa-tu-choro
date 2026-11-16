# An engineer's first hour

Chapa Tu Choro answers three user questions: what registered reports exist for a territory, how those statistics change over time, and where someone can find an official reporting channel. It does not accept complaints or publish user-submitted incidents.

## Product use cases

| User action | Application behavior | Important limit |
| --- | --- | --- |
| Open Mapa → Estadísticas | Browse official boundaries, report counts/rates, territory details and rankings | Counts are registered reports, not all crime or personal risk |
| Open Mapa → Concentración | Browse separate geographic classification aggregates and radius counts | These rows are not verified unique incidents or exact public event locations |
| Open Tendencias → Denuncias | Compare counts, same-year population rates, territories, moving averages, past references and Peru | The sidebar owns the date range; missing values remain unavailable |
| Open Tendencias → Delitos | Analyze one supported geographic publication/category/year | Annual sources have different definitions and cannot be merged into one historical total |
| Open Denunciar | Find official portals, phone links and requirements | Reports are submitted to the external authority, not this application |

## Vocabulary

- **UBIGEO:** the official territorial identifier; store it as text to preserve leading zeroes.
- **Report count:** the sum of the CSV's published quantity, not the number of CSV rows.
- **Geographic record:** a row/classification in a separate MININTER publication. It is not interchangeable with a CSV report.
- **Rate:** monthly reports / same-year projected population × 100,000. It is not annualized or an individual's risk.
- **Release:** an imported source version identified by checksum and provenance.
- **Ingestion attempt:** an auditable execution, including failures and no-change outcomes.
- **Freshness:** the latest observation/reference period in retained data, distinct from the time of import.

## Run, load and verify

1. Follow the root [README](../README.md) to start Compose.
2. Check `/api/ready` through port 5173. A healthy database can still contain no statistics.
3. Import the [official CSV/boundaries](data-ingestion.md); import [population](ingestion/population.md) for normalized statistics. Concentration has its own [procedure](concentration.md#run-locally).
4. Check source periods and counts in the app. Missing inputs should produce an empty state, never fictional observations.
5. Follow [testing](testing.md). Use disposable schemas/test databases for integration checks.

## Where to work

| Change | Location |
| --- | --- |
| React views, filters and shared state | `frontend/src/features/explorer/` |
| Charts and reporting guide | `frontend/src/components/`, `frontend/src/features/trends/` |
| HTTP contracts and fetch lifecycle | `frontend/src/lib/api.ts`, `frontend/src/hooks/` |
| Minimal API bindings and HTTP protection | `backend/src/ChapaTuChoro.Api/` |
| Validation, statistics and use cases | `backend/src/ChapaTuChoro.Application/` |
| Domain invariants and policies | `backend/src/ChapaTuChoro.Domain/` |
| EF Core, SQL and external integrations | `backend/src/ChapaTuChoro.Infrastructure/` |
| Acquisition, validation and audited imports | `ingestion/` |
| Ordered schema changes | `db/migrations.json`, versioned SQL in `db/` |
| Local containers / proposed AWS resources | `compose.yaml`, `docker/`, `infra/terraform/` |

Read [architecture](architecture.md) for dependency directions. An endpoint binds input and maps a Result; calculations belong in Application and persistence belongs in Infrastructure. Add a versioned migration when the schema changes; do not edit an already applied migration.

## Before publishing

The functional MVP is not a deployed service. Follow [the release procedure](deployment.md), resolve the [prelaunch blockers](aws-review.md), and review source-reuse decisions. Terraform validation and historical passing tests do not replace target-environment checks. Phase 5 news ingestion remains outside the current MVP.
