# Source freshness from imported observations

Run `python -m ingestion.tracking freshness --limit 200` using private ingestion database credentials. It works in the existing Python CLI/Compose/Lambda-compatible runtime; no public endpoint or frontend change is introduced. In Compose, rebuild the ETL image, then use:

```bash
docker compose --profile etl build etl
docker compose --profile etl run --rm --entrypoint python etl -m ingestion.tracking freshness
```

Apply the [versioned migration runner](../operations.md#database-upgrades) before using updated ingestion tools. Freshness itself adds no table: this read model derives results on each invocation using one repeatable-read, read-only transaction. It does not contact providers or change statistics or execution history. Rebuilding the normal ingestion Lambda artifact includes the module; the scheduled handler continues its normal imports rather than acting as an operational HTTP endpoint.

## Date semantics

- SIDPOL national CSV: maximum actual `(ANIO, MES)` retained in `monthly_reports`, with national-import provenance required. An explicitly recorded zero still constitutes an observation.
- Geographic crime sources: maximum `(año_hecho, mes_hecho)` of nonempty imported source snapshots, calculated independently for each source key. Empty future/unavailable snapshots never advance recency. The importer already validates every retained row against that source/month. Category archives are not merged across sources or years.
- INEI boundaries, basic stations and street context: unknown observation date. An import timestamp, filename year, service modification timestamp or request time does not become an event date.

Current retained crime datasets have **month precision**. The result exposes `latest_data_period: {year, month}`, not an invented exact day. Even if an upstream API has another day-level field, this validator does not claim to have validated or retained it. Validated day-level recency would require a separate adapter/storage enhancement.

The result includes `date_basis` (`reporting_period`, `occurrence_month`, or `unknown`), `age_months`, `last_imported_at`, and `last_attempt_finished_at`. These timestamps retain their distinct meanings: a locally finished attempt is not proof of a successful remote availability check. `evaluated_on` uses the America/Lima calendar date. Importing the same old data today does not advance its data period.

## Validation states

- `dated`: a supported data period no later than the current month. This means a date is known, **not** that all observations are current or complete.
- `invalid_future_period`: the latest retained month lies after the current Lima month. The period remains visible for investigation; it is not silently ignored or used to alter/delete source data.
- `unknown`: no supported date or no qualifying observations.

No overdue/current threshold or expected publication cadence is invented. A 2025 archive can legitimately remain dated 2025. Scheduled health checks, stale-source policies, UI badges and abandoned-run reconciliation remain separate Phase 3 work. The CLI returns the validation states as JSON; future-period findings are report results rather than a process-exit failure. Database/configuration errors still fail explicitly using sanitized tracking errors.

Tests cover old data imported today, unknown dates, archives, month rollover/future validation, explicit zero observations, exclusion of empty future snapshots, independent sources and reconciliation with real PostGIS queries in isolated synthetic schemas.

Population projections use their maximum imported June 30 reference period (`date_basis: projection_reference`) from the active release. That is an annual denominator reference, not a crime occurrence or census date. Reimporting the workbook does not advance it. Apply the manifest through `003_population.sql` with the migration runner before using this read model. See [population provenance](population.md).

A known population projection uses `status: projected`, including future reference years. Future projections are legitimate and are not classified as invalid future crime observations; negative `age_months` retains its calendar meaning. This status is not a claim that a projection was observed by a census.
