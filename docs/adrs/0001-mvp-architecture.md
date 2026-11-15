# ADR 0001 — MVP modular architecture and dependencies

- Status: accepted for starter
- Date: 2026-11-10

## Decision

One **statistics bounded context** with clean project dependencies: Domain <- Application <- Infrastructure, with API as composition root. Each application use case has a dedicated concrete handler registered in DI. Query read models and public API DTOs are separate from the domain model. The API translates expected errors into HTTP ProblemDetails. Unexpected errors are centralized in `IExceptionHandler`.

## SharedKernel evaluation

**Do not create a SharedKernel project for this MVP.** We have one active bounded context. Result and Error are application primitives, not domain entities shared across independently governed contexts. Premature SharedKernel references would create coupling without reuse. Revisit only after two bounded contexts demonstrably share domain concepts that must evolve together.

## MediatR evaluation

**Do not add MediatR.** Current MediatR 13+ is offered under commercial / reciprocal open-source licensing; earlier versions retain their original licenses. It is not accurate to say it is universally paid, but it is also unnecessary for 2–3 query handlers. Explicit handler injection is simpler, easier to debug and avoids licensing considerations. Reassess if the codebase gains meaningful pipeline behaviors, request dispatch and cross-cutting composition needs. See https://luckypennysoftware.com/faq .

## ORM and SQL

EF Core is used for entity mapping and LINQ queries. One PostGIS-specific GeoJSON query uses parameterized Npgsql SQL within Infrastructure to keep spatial query shape explicit. `db/001_schema.sql` creates the initial MVP schema: **do not run `EnsureCreated` or EF migrations over this existing bootstrap without a proper baseline migration plan**.

## AWS cost / portability

React static build -> private S3 + CloudFront. API -> .NET Lambda managed runtime and private Function URL through CloudFront OAC. Ingestion -> Python Lambda + EventBridge. Database -> Supabase Postgres/PostGIS. The Dockerfile is retained for portability. Avoid ECS, NAT Gateway, ALB and API Gateway in MVP. If API latency, throughput or operational requirements change, benchmark an always-on container before migrating.

## Logging

Serilog JSON -> standard output -> Lambda CloudWatch Logs. Optional subscription -> Data Firehose -> private S3 (disabled in Terraform by default due to usage costs). Direct per-request S3 writes are deliberately avoided: they add latency, PUT costs and unreliability during exception handling. CloudWatch is the immediate operational sink; S3 is long-term archive when explicitly enabled.

## Alternatives rejected

- Separate microservices for each feature before requirements justify them.
- MediatR and a generic abstraction for every class.
- Direct database connections from the React browser.
- Exact location pins generated from aggregated police reports.
- Persisting Lambda log files in `/tmp` and assuming they will eventually reach S3.

## Implementation update — 2026-11-13

The dependency and deployment decisions above remain. The application now has multiple statistical/spatial use cases, with EF Core and parameterized SQL in Infrastructure. Schema changes are managed by the versioned `db/migrations.json` runner; `001_schema.sql` is its baseline, not a script to apply manually on every startup. See [current architecture](../architecture.md) and [migration operations](../operations.md#database-upgrades). The [prelaunch review](../aws-review.md) records remaining Lambda compatibility and release checks.

On 2026-11-14 the active files were renamed to `001_baseline.sql`, `002_ingestion_leases.sql` and `003_population.sql`, preserving SQL/checksums. The earlier 002–005 upgrades moved to `db/archive/`. The [compatibility procedure](../../db/README.md) translates verified old ledger names transactionally, without replaying completed SQL.
