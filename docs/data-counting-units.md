# What the application counts

Validated on **2026-11-12 (America/Lima)** using the original local CSV and its matching SHA-256 provenance, the official XLSX dictionary/DOCX metadata, read-only database aggregates and live aggregate/schema queries against the currently imported ArcGIS layer. No case samples, addresses or individual identifiers were downloaded or retained. [Aggregate validation evidence](evidence/data-counting-units-2026-11-12.json).

## Statistical CSV

The [official dictionary](https://www.datosabiertos.gob.pe/sites/default/files/DICCIONARIO_DATOS_Denuncias_Policiales_0.xlsx) defines `cantidad` as **Cantidad de denuncias**. `ANIO` and `MES` identify the fact period, and UBIGEO describes the place of the fact. These are not publication dates. The [catalogue](https://www.datosabiertos.gob.pe/dataset/denuncias-policiales-registradas-nivel-nacional-mininter) describes police complaints covering crimes, faults, violence against women/family members and other reported facts. The [metadata document](https://www.datosabiertos.gob.pe/sites/default/files/METADATO_Denuncias_Policiales_1.docx) identifies PNP DIRTIC as the provider and describes selected principal crime modalities.

The supplied CSV has only eight fields: year, month, department/province/district names, district UBIGEO, grouped modality and quantity. It contains no complaint ID, case ID or source coordinates. A CSV row is an aggregate, not one complaint. Its quantity is the provider's published complaint measure; the file cannot independently establish unique complaint identity across categories or sources. `Otros` cannot be reclassified into crimes/faults/other matters from its label alone.

The original September 2026 CSV sums to **63,043**, exactly matching `monthly_reports`. Its latest period is September 2026. No October statistical total is currently imported.

## Geographic concentration

The active [SIDPOL_DELITOS_TOTAL layer](https://services6.arcgis.com/lMIZrqiJkpM748BR/arcgis/rest/services/SIDPOL_DELITOS_TOTAL/FeatureServer/25?f=pjson) is another SIDPOL-derived release, not an independent catalogue of unreported crime. It contains matter/type/subtype/modality classifications, explicit occurrence year/month, registry-related fields, `id_dgc`, coordinates and an undocumented numeric `estado` field. Its current schema has neither `solo_denuncia` nor `es_delito_x`. Findings from the older unimported Denuncias service must not be attributed to this layer.

Live September/October matter groups were FUERO COMUN, NIÑOS Y ADOLESCENTES and LEYES ESPECIALES. Type labels include offences against property/life/liberty/public safety, juvenile-law records, violence-law records and drug trafficking. These are provider classifications, not judicial findings or evidence that every row is a unique formal complaint. The broader catalogue's mention of faults does not prove that this active layer includes every kind of fault or every SIDPOL classification.

| Period | All geographic source rows | Distinct `id_dgc` values in import audit | Rows with accepted territory | Mappable rows |
| --- | ---: | ---: | ---: | ---: |
| September 2026 | 45,558 | 39,416 | 39,705 | 39,660 |
| October 2026 | 44,062 | 38,145 | 38,449 | 38,414 |

Live type/matter aggregate sums reconcile with the imported source-row totals, without transfer truncation. Repeated `id_dgc` values demonstrate that row counts and distinct IDs differ; their identity relationship is not sufficiently documented to deduplicate blindly or call distinct IDs unique crimes. The 2025 extortion archive omits that business ID, preventing even this diagnostic there. Exact coordinate-pair multiplicity also does not establish unique cases.

Current named category code sets are disjoint at the row-modality level; `all` includes those rows and other modalities. This does not establish distinct business events across categories or make the separately published 2025 archives additive.

The importer retains safe aggregate counts and private coordinate/count groups, not source case IDs, free text or addresses. It does not retain the complete matter/type hierarchy. Adding those filters would require a deliberate ingestion/storage/contract extension; they cannot be inferred reliably from current public aggregates alone.

## Valid and invalid crossings

- **Supported now:** compare source-specific aggregates for the same occurrence year/month and UBIGEO-derived territory. Existing concentration analytics already show the independent CSV total as context, summing all CSV modalities and retaining missing periods as null.
- **Possible after reconciliation:** compare compatible modalities, with explicit source code-to-label mapping, reporting cutoffs and counting-unit definitions. Similar names alone are insufficient.
- **Not supported:** match individual complaints between these files, deduplicate a combined total, add their counts as independent crimes, or subtract geographic rows from CSV quantities to estimate unreported crime. The aggregated CSV supplies no common case key and both releases originate from SIDPOL.
- **Internal geographic quality measure:** mappable rows divided by source rows describes the fraction of this particular release that passed location/territory checks. It is not a unique-complaint reporting rate, CSV geocoding rate or estimate of all actual crime.

Studying unreported victimization requires an independently validated source with an appropriate population, period and statistical methodology. Neither current imported release supplies such a measure. No new import or application behavior was introduced by this validation.

## Separate dashboards

Tendencias now offers distinct CSV-complaint and geographic-record dashboards with source-specific filters. This is an alternative view of the existing publications, not a row-level reconciliation or an estimate of unreported crimes. See [trend semantics and contracts](trends.md#geographic-dashboard).
