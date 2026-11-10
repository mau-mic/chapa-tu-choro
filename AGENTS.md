# Chapa Tu Choro — Codex Engineering Instructions

## Project overview

Chapa Tu Choro is a public web application for exploring crime statistics and reported incidents in Peru, initially focused on Lima and Callao.

The application should provide reliable, understandable geographic information using official government datasets and, eventually, independently sourced recent incident reports.

This is a real application intended for public use, not a demonstration project. Prioritize maintainability, correctness, data quality, security, performance and cost efficiency.

## Technology stack

**Backend**
- ASP.NET Core 10, C#, Minimal APIs
- Clean Architecture and pragmatic Domain-Driven Design
- Domain,Application, Infrastructure and API layer
- EF Core, Npgsql and NetTopologySuite
- Result pattern for expected application errors
- ProblemDetails for standardized HTTP errors
- Serilog for structured logging
- xUnit and integration testing

**Frontend**
Use React, TypeScript, Vite, Tailwind CSS, shadcn/ui and Base UI.
Chapa Tu Choro should have a unique, modern, map-first visual identity. Avoid creating a generic administration dashboard.

- Use shadcn/ui selectively for accessible interactive components.
- Use Base UI primitives directly when a component requires fully custom behavior or presentation.
- Use Tailwind CSS to implement the application's visual design.
- Create custom components for map overlays, incident cards, district statistics, legends and geographic filters.
- Prefer composition over unnecessary component abstractions.
- Do not introduce additional UI libraries unless their functionality is clearly justified.
- Prioritize responsive layouts, accessibility and performance.
- Keep the map as the primary visual element.
- Avoid excessive cards, unnecessary borders, decorative gradients and visual clutter.
- Maintain a consistent visual identity through shared design tokens, typography, spacing and colors.
- Keep functional components independent from specific styling choices where practical.

**Data and ingestion**
- PostgreSQL with PostGIS
- Supabase as the managed PostgreSQL provider
- Python for ETL and future AI-assisted processing
- Official MININTER and INEI datasets as primary statistical/geographic sources

**Infrastructure**
- Docker and Docker Compose for local development
- AWS Lambda for the .NET API and scheduled Python ingestion
- Amazon S3 and CloudFront for frontend hosting
- Amazon EventBridge Scheduler for ingestion triggers
- GitHub Actions for CI/CD
- Terraform for infrastructure as code
- AWS CloudWatch for operational logs, with optional S3 archival

## Backend architecture

Preserve the existing four-layer architecture:

**Domain**
- Contains entities, value objects, domain invariants and domain behavior.
- Must not reference Application, Infrastructure or API.
- Avoid anemic domain models where business invariants justify domain behavior.

**Application**
- Contains use cases, handlers, DTOs and abstractions.
- Depends on Domain, never Infrastructure.
- Use the existing Result pattern for expected business and application failures.
- Prefer explicit use-case handlers and constructor dependency injection.
- Do not introduce MediatR unless specifically requested.

**Infrastructure**
- Implements Application abstractions.
- Contains EF Core, external integrations, repositories and persistence configuration.
- Use strongly typed Options with validation for external integrations.
- Use typed HttpClient integrations when communicating with HTTP services.
- Configure database access, retry policies and timeouts appropriately.

**API**
- Uses ASP.NET Core Minimal APIs.
- Keeps endpoints thin.
- Maps application Result errors to appropriate HTTP responses.
- Uses ProblemDetails consistently.
- Uses a centralized exception handler for unexpected failures.
- Never expose internal exception details or credentials to clients.

Do not introduce a SharedKernel project or additional architectural layers without a demonstrated need.

Favor clear code over unnecessary abstractions, generic repositories, excessive patterns or premature microservices.

## Frontend principles

- Build a professional, modern, map-first interface.
- Keep components reasonably small and reusable.
- Use TypeScript types for API contracts.
- Separate data-fetching logic from presentation.
- Provide clear loading, error, empty and success states.
- Make the application responsive for mobile and desktop.
- Use accessible controls, semantic markup and keyboard support.
- Avoid excessive dependencies and visual complexity.

## Data integrity and public safety

- Never invent crime incidents, geographic coordinates, official statistics or sources.
- Keep aggregated official statistics separate from individual reported incidents.
- Preserve data provenance and original source references.
- Distinguish occurrence dates from publication dates.
- Represent uncertainty in incident locations and verification states.
- Do not publish sensitive victim information or unverified accusations as established facts.
- Ensure ingestion jobs are idempotent and auditable.
- Do not infer that high report counts necessarily imply higher individual crime risk.

## Security and reliability

- Never hardcode secrets or commit credentials.
- Keep database credentials server-side.
- Use least-privilege database roles.
- Parameterize SQL queries.
- Validate external data and API inputs.
- Avoid logging sensitive information.
- Include appropriate tests for new behavior.
- Consider cancellation, timeouts, retry safety and failure scenarios.
- Never silently swallow errors.

## Development workflow

Before modifying code:

1. Inspect relevant files and understand existing conventions.
2. Identify dependencies and affected components.
3. Explain significant architectural changes when necessary.
4. Prefer the smallest coherent implementation.
5. Preserve working functionality and public contracts unless a change is required.

During implementation:

- Write working code rather than placeholders.
- Include relevant tests.
- Reuse existing patterns where appropriate.
- Avoid introducing packages without a clear reason.
- Update documentation when contracts or setup instructions change.
- Do not rewrite unrelated modules.
- Do not deploy infrastructure, incur cloud costs, alter production data, or perform destructive database operations without explicit approval.

After implementation:

- Run relevant builds, tests, linters and type checks where available.
- Fix issues introduced by the changes.
- Report what changed, which tests passed, what could not be verified, and any remaining limitations.
- Never claim a test passed unless it was executed successfully.

## Engineering priorities

Prefer, in order:

1. Correctness and data integrity
2. Security and privacy
3. Maintainability and testability
4. Simplicity and cost efficiency
5. Performance supported by measurements
6. Scalability when justified by real requirements

The objective is a reliable, production-minded MVP, not maximum architectural complexity.