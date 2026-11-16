# Source used by the user-provided MININTER crime map

> Historical source investigation: the observations and proposed next steps below describe the recorded investigation date. For the implemented integration and current limits, read [concentration](concentration.md), [methodology](methodology.md) and the [prelaunch review](aws-review.md).

Checked **2026-11-12, America/Lima**. This resolves the exact viewer URL supplied after the separate Denuncias source audit. Public configuration and aggregate results were inspected; no incident features were downloaded and no map layer was implemented.

## Verified public configuration chain

1. [User-provided viewer](https://aplicaciones.mininter.gob.pe/mapadeldelitogeoreferenciado/) returns an HTML iframe pointing to [Mapa del Delito v2.0](https://mininter-dgis.maps.arcgis.com/apps/webappviewer/index.html?id=ffc03c3586b142b988c931312d7da17b).
2. Its [public application configuration](https://mininter-dgis.maps.arcgis.com/sharing/rest/content/items/ffc03c3586b142b988c931312d7da17b/data?f=pjson) declares web-map ID `12c50349456c4ad5b253d522f2fab73c`.
3. The [public web-map definition](https://mininter-dgis.maps.arcgis.com/sharing/rest/content/items/12c50349456c4ad5b253d522f2fab73c/data?f=pjson) declares **DELITOS PRIORIZADOS**, with renderer type **heatmap**, backed by [SIDPOL_DELITOS_TOTAL/FeatureServer/25](https://services6.arcgis.com/lMIZrqiJkpM748BR/arcgis/rest/services/SIDPOL_DELITOS_TOTAL/FeatureServer/25).
4. The same service supplies modality-filtered layers for robbery, theft, extortion, homicide and other classifications. The web map also declares station/boundary layers from `MAPA_BASE` and a separate SIPCOP municipal-occurrences layer. Their independent contents were not audited here.

The heatmap is a renderer applied to a point layer. This is not evidence of a separate authoritative crime-area polygon dataset or a standalone heatmap API. These are public configuration declarations, not a completed browser-rendering test or verification of all widget behavior.

## Correction to the earlier source comparison

| Source | Observed availability | Scope of validation |
| --- | --- | --- |
| `geomininter.mininter.gob.pe/.../ogc/denuncias/MapServer/0` | 9,400,491 rows; latest occurrence June 2025 | Earlier [Denuncias audit](mininter-denuncias-validation.md), with its coordinate-status and identity findings |
| `services6.arcgis.com/lMIZrqiJkpM748BR/.../SIDPOL_DELITOS_TOTAL/FeatureServer/25` | **487,787 rows, occurrence year 2026, months January–October** | Exact viewer's declared point source; public access, metadata and aggregate availability checked here |

The earlier audit does **not** establish the coverage or quality of the exact viewer's source. In particular, the old June-2025 cutoff and old georeferencing percentages must not be attributed to this viewer. The ten 2026 monthly counts reconcile to 487,787; these are rows, not verified unique crimes, and do not prove complete coverage of each month.

The exact layer is named `SIDPOL_DELITOS_TOTAL_PC`. Public metadata supports JSON/GeoJSON/PBF, pagination and statistics, with a 2,000-feature limit. Its date fields include TimestampOffset types, and its schema has `estado` rather than the older source's `estado_coord`; the old status and date rules cannot be copied without validation. The public source item's description, license and attribution fields are empty. The web map's Esri basemap license does not establish a license for these crime records.

## Remaining work before integration

The subsequent [live viewer tour and historical-source investigation](mininter-viewer-tour-integration.md) found separately published 2025 category archives, tested public controls and documented a bounded integration proposal. The active source remains 2026-only; the older archives overlap and have different period ranges.

Validate this exact layer's counting unit, repeated identifiers, coordinate accuracy/eligibility, date semantics, geographic containment, category filters, completeness and dataset-specific reuse conditions. Keep its source-specific availability and counts separate from both the older Denuncias service and the imported SIDPOL CSV. Metadata edit dates are not reporting-period guarantees. No blanket public-production approval follows from access being public.

[Sanitized evidence](evidence/mininter-exact-viewer-source-2026-11-12.json) records public application/layer declarations, selected metadata and exact aggregate query URLs/results. Checks verified the configuration chain, declared heatmap renderer, occurrence-year bounds and monthly reconciliation. No application, ETL, database, dependencies or infrastructure changed; no production writes, service edits or append operations were attempted.
