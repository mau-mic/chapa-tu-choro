# Phase 4 advanced statistics closeout

Goal: multi-year normalized histories, side-by-side territorial series, rate map, visible quality indicators, public methodology and coordinated first-load reveal.

Architecture: extend the existing versioned population read model with a bounded (120 month, four selected territories) history use case and three set-based EF queries. Keep raw counts and geographic source units intact. Derive map rates from the same projection and retain unknown values. Hoist history fetching into Explorer state to start alongside existing queries; present charts with existing SVG components and add no chart service. The initial loader covers essential data/modules until ready or failed, while optional external overlays retain independent states.

- [x] Test same-year denominators across years, sparse months, unknown population/geometry, scope/selection bounds and rate-map preservation.
- [x] Implement history contracts/projection/repository/API, cancellation/rate limits, three-query evidence and HTTP examples.
- [x] Implement normalized history charts, four-territory selection, count/rate comparisons and visible quality summary.
- [x] Implement map count/rate switch with preserved raw counts, correct legend/popups and unavailable-value handling.
- [x] Implement coordinated initial loader with accessible status, no infinite wait on empty/error/module failure, and stable map dimensions.
- [x] Update public methodology, requirements and guides; run unit, PostGIS, browser/build/lint checks and local real-data validation. No production/Supabase/AWS changes.

Validation: [local closeout evidence](../evidence/phase-4-closeout-2026-11-13.json). Additional official population revisions and finer census geography remain source-dependent improvements, not inferred data. No production resources were changed.

The broader original Phase 4 analytics have subsequently been implemented: strict 3/12-month moving means, prior-only 36-month historical and same-month three-year seasonal references, and a weighted national-rate comparison. See the [advanced implementation plan](../superpowers/plans/2026-11-13-advanced-statistics.md) and [validation evidence](../evidence/phase-4-advanced-statistics-2026-11-13.json). Population revisions, finer spatial census data and target-environment deployment checks remain separate source/operations work.
