# Advanced statistics implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline, task by task.

**Goal:** Deliver moving averages, historical/seasonal references and territory-versus-national rates end to end.

**Architecture:** Add an Application projection and use case backed by three bounded, set-based EF reads. Fetch the new insights endpoint alongside history, pin the population release, and reuse the existing SVG charts. Preserve the shared sidebar dates and source units. No schema, workbook or infrastructure changes.

**Tech Stack:** ASP.NET Core 10, EF Core/Npgsql, PostgreSQL/PostGIS, React/TypeScript, Base UI and existing native SVG charts.

**Spec:** The user's Phase 4 request and the definitions below.

## Rules

- Visible range <=120 months; internally read <=36 preceding months for complete references.
- Rolling 3/12 includes the current month. Historical baseline uses the preceding 36 calendar months. Seasonal baseline uses the same month in each of the preceding three years. Never use future observations.
- Require every required count/rate observation for its respective mean. Null is not zero; explicit zero is an observation. Return available/required counts.
- Rates use each observation year's population. National rate is national counts / national population *100000, including the selected territory, with the same category and month. Never average district rates.
- Suppress an affected rate whenever any contributing reporting district lacks a compatible denominator. Preserve counts. Percent differences against zero are unavailable.
- Three EF commands regardless of selected geography: release, annual denominators, server-grouped national/scoped facts. No raw report rows or one-query-per-month/territory loops.
- Existing endpoints, rate-map counts, sidebar range and geographic classification sources remain intact. New endpoint has validation, analytics rate limits, cancellation, ProblemDetails and OpenAPI.
- No new libraries, data files, migrations, remote writes or cloud deployment.

## Tasks

- [x] Write and run failing calculation and query-contract tests.
- [x] Implement Application DTOs/projection/handler, bounded EF repository, endpoint/DI/protection and .http examples.
- [x] Validate SQL translation and fixed query count in disposable PostGIS; exercise HTTP validation, 404, cancellation and rate limiting.
- [x] Add parallel frontend fetching, local presentation controls, themed charts, national reference, accessible values and loading/error/empty states.
- [x] Add unit and desktop/mobile browser regressions, including real local imported-data checks.
- [x] Update methodology, architecture and validation evidence; run builds, lint/types/format and final test suites.

Validation: [advanced statistics evidence](../../evidence/phase-4-advanced-statistics-2026-11-13.json). All work was local; hosted deployment and revised population inputs remain separate operations/source tasks.
