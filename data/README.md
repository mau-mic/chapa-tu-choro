# Official source data (not redistributed)

The current ETL covers Peru nationwide. It produces `SIDPOL.csv`, `districts.geojson` and `departments.geojson`, with original WFS responses and `.source.json` provenance sidecars. Upgrade through the [versioned migration runner](../docs/operations.md#database-upgrades), not individual historical SQL files. Existing Lima-only installations must also rerun ETL; see [national coverage](../docs/nationwide-map.md).

For complete automated extraction through database load, run `python -m ingestion.etl` with `DATABASE_URL` configured, or `docker compose --profile etl run --build --rm etl`. Per-run files are temporary; use the download-only tool below to retain local inputs. See [the ETL guide](../docs/data-ingestion.md).

Run `python -m ingestion.download_official --dataset all` from the project root for unattended acquisition. Real MININTER CSV and INEI WFS downloads were verified on 2026-11-11; local downloaded files remain ignored by Git. The downloader stores source URLs, timestamps and hashes in `.source.json` sidecars, which the importers verify and use automatically.

Supply the original MININTER/SIDPOL aggregated CSV as `data/SIDPOL.csv` and an official INEI district layer exported to two-dimensional WGS84/EPSG:4326 GeoJSON as `data/districts.geojson`.

Required CSV fields: `ANIO,MES,DPTO_HECHO_NEW,PROV_HECHO,DIST_HECHO,UBIGEO_HECHO,P_MODALIDADES,cantidad`. Verify headers against the actual release. The importer does not accept individual-report CSVs in place of aggregated counts.

Expected GeoJSON properties: `UBIGEO`, `NOMBDIST`; override with `--ubigeo-key` and `--name-key`. INEI provides a GeoPackage download: inspect and export the district layer in QGIS, preserving identifiers and checking CRS. Alternatively, the automated downloader gets GeoJSON directly from INEI’s official WFS, without a manual export.

Record the exact government release URL with the importer's `--source-name` flag. No fictional example records are shipped. Dataset files are ignored by Git. See the root README for import commands and the [prelaunch review](../docs/aws-review.md) for release gaps. Native Python commands in this reference assume the [configured environment](../docs/operations.md#database-upgrades).

## Optional police-station map layer (Phase 2)

Basic police-station locations are consulted directly from MININTER's public ArcGIS service after enabling **Mapa → Capas → Comisarías básicas**. This layer does not use these ETL files, change SIDPOL aggregates or require another database import. Do not store or commit a station export here. Its territory filters use source UBIGEO; year/month/crime-category filters apply only to SIDPOL. The source does not declare an update date or specific dataset license. See [official geographic layers](../docs/official-geographic-layers.md) for the inventory, attribution, usage conditions and verification limits.

## Concentration aggregates

The geographic concentration pipeline is now available separately through `python -m ingestion.concentration` or `INGESTION_DATASET=concentration` in Compose/Lambda. It does not write raw incident files here. It reads the fixed official sources into temporary staging and persists district totals/grids and server-only source-location/count groups after INEI checks. The RLS-protected coordinate table supports metric-radius analysis and is never exported as a public point list; no addresses or case IDs are retained. Apply the additive migration and follow the [concentration guide](../docs/concentration.md); existing SIDPOL/INEI import inputs are unchanged.
