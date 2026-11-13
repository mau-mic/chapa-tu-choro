# Phase 4 population comparison implementation plan

Goal: compare registered SIDPOL reports with same-year INEI population projections in Trends without changing existing statistical or geographic source semantics.

Architecture: additive SQL migration and versioned population observations; Python workbook validation and atomic audited import; EF Core bounded server aggregation and Application rate projection; a cancellable React Trends panel reusing geographic/category filters. No remote infrastructure or Supabase changes.

## Tasks
- [x] Validate the supplied INEI 2018–2026 XLSX: strict schema/UBIGEO, missing historical districts, hierarchy totals; reconcile against local geography/statistics.
- [x] Add migration 007: immutable releases, observations and active-series pointer, restricted direct client access. Add auditable idempotent importer and local Compose instructions.
- [x] Add /api/population/comparison: bounded year/month/geographic/category inputs, same-year denominators, null for unknown counts or missing/incompatible denominators, source provenance, ranked territories and monthly series. Reuse global rate limiting, ProblemDetails, cancellation and logging.
- [x] Add an accessible Trends comparison panel: explicit month/year, raw count/population/rate, monthly evolution and capped ranking; loading/error/retry/empty states, cancellation and no new UI/chart dependencies.
- [x] Run tests/builds/lint/type checks; document commands, methodology, missing census revision and runtime limitations.

Review focus: no zero imputation for absent report months; no missing population treated as zero; no mixing releases or geographic event sources; no repeated import rollback of newer versions; no exposed DB credentials or production mutation.
