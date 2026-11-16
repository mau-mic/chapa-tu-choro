# Historical SQL upgrades

These original scripts are retained as references and regression fixtures. Their contents are already included in `../001_baseline.sql` and they are excluded from the active manifest:

- `002_national_geography.sql`
- `003_concentration.sql`
- `004_concentration_locations.sql`
- `005_source_catalog_tracking.sql`

Do not apply them as additional migrations. Use the [active sequence and compatibility procedure](../README.md). Dated documentation/evidence may still mention their original paths and numbering.
