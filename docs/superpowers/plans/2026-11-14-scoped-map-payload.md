# Scoped map response implementation plan

**Goal:** remove the nationwide full-resolution `/api/map` response that exceeds buffered Lambda limits, preserving official counts and the working explorer.

**Design:** retain the GeoJSON contract and one SQL query, require a two-digit department and accept optional province/district within it. Validate in Application, bind in API and simplify/filter in PostGIS exactly as the explorer does. Missing observations remain null; scopes with no polygons return an empty collection. Do not change stored boundaries, ingestion or AWS resources.

The existing frontend uses `/api/explorer`; remove its unused unscoped map client. Separate static geometry/statistical contracts and vector tiles remain later optimizations, not prerequisites for this bounded fix.

- [x] Add failing HTTP regressions for missing/malformed/mismatched map scope.
- [x] Implement scoped handler/repository/API, retaining cancellation and rate limiting.
- [x] Add PostGIS regressions proving scoping, exact counts/nulls/zeroes and reduced geometry without database mutation.
- [x] Remove unused frontend client and verify frontend checks.
- [x] Build/test the backend; measure national explorer plus every imported department, province and representative district using the local official dataset.
- [x] Update current deployment/API documentation and preserve dated review evidence.

No commits, production migration or cloud deployment are authorized in this task.
