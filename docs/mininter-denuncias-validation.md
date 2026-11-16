# MININTER Denuncias — source validation

> Historical source investigation: the observations and proposed next steps below describe the recorded investigation date. For the implemented integration and current limits, read [concentration](concentration.md), [methodology](methodology.md) and the [prelaunch review](aws-review.md).

Checked **2026-11-11, America/Lima**. This is a read-only investigation, not a crime-layer implementation or production import.

**Scope correction, 2026-11-12:** the exact viewer later supplied by the user uses a different ArcGIS Online layer, with 2026 records. This audit applies only to the `ogc/denuncias/MapServer/0` source below. Its June-2025 cutoff and coordinate-status findings must not be applied to that viewer. See [verified viewer/source mapping](mininter-exact-viewer-source.md).

**Decision: technically accessible, conditionally suitable for a historical georeferenced-report prototype; not validated for a public, comprehensive crime-area/hotspot product.** Public accessibility is verified. Coverage, location semantics, identity, classification and reuse conditions prevent treating all points as distinct, accurately located crimes.

## Source and evidence

- Discovery: [GEOIDEP catalogue, MININTER](https://www.geoidep.gob.pe/catalogo-nacional-de-servicios-web?id_institucion=81). The published Denuncias WMS URL identifies the same official ArcGIS service; no protected viewer traffic, credentials or access-control bypass was used.
- [Service metadata](https://geomininter.mininter.gob.pe/arcgis/rest/services/ogc/denuncias/MapServer?f=pjson), [layer 0 metadata](https://geomininter.mininter.gob.pe/arcgis/rest/services/ogc/denuncias/MapServer/0?f=pjson), [item information](https://geomininter.mininter.gob.pe/arcgis/rest/services/ogc/denuncias/MapServer/info/iteminfo?f=pjson), [layer XML metadata](https://geomininter.mininter.gob.pe/arcgis/rest/services/ogc/denuncias/MapServer/0/metadata).
- [Official crime-map service guide](https://www.gob.pe/es/33281-conocer-los-lugares-donde-se-han-denunciado-delitos-e-incidencias-mapa-del-delito), [GEOIDEP–GEOPERÚ terms](https://www.geoidep.gob.pe/static/docs/terminos_condiciones.pdf), [Esri query documentation](https://developers.arcgis.com/rest/services-reference/enterprise/query-map-service-layer/).
- [Sanitized evidence JSON](evidence/mininter-denuncias-validation-2026-11-11.json) contains the exact read-only query URLs, returned aggregate results, sampling method, metadata digests and diagnostic counts. No raw incident geometry, addresses, free text or record IDs are retained in the repository. Some web-reader requests failed; direct public HTTPS requests succeeded. The Gob.pe page returned 418 during this validation and was not used as proof of live API availability.

Queries were sequential with 20–30-second request timeouts and response-size caps. Samples were deliberately small and field-restricted. This was not a bulk export, a representative national survey, a national deduplication exercise or a transactionally consistent database snapshot.

## Technical access

| Check | Observed result |
| --- | --- |
| Authentication | Public read requests succeeded without a token or credentials |
| Source | ArcGIS Server 11.0; MapServer layer 0, `denuncias`, point geometry |
| Formats / CRS | JSON, GeoJSON, PBF; EPSG:4326 supported |
| Transfer limits | Maximum 2,000 features per response; ordered pagination supported |
| Statistics | Counts, grouped statistics, distinct counts and SQL expressions supported |
| Spatial bins | `supportsLod=false`; no native hexagon/grid binning support established |
| WMS | 1.3.0, layer `0`, CRS:84/EPSG:4326; point layer with simple renderer, not a verified heatmap endpoint |
| CORS | Responses to tested GETs echoed `http://localhost:5173`; no new browser/WebGL test or production-origin test performed |
| Scoped pagination | Two ordered pages of 100 returned 200 different `objectid` values, with transfer-limit flags indicating more data |

The existing MapLibre/PostGIS stack could support a bounded prototype. The browser should not download 9.4 million records. Any approved ingestion must bound period/territory, handle transfer limits, reject incomplete loads and avoid automatic high-frequency source polling.

## Coverage and dates

Total returned count: **9,400,491 rows**, not a verified count of distinct crimes. Counts grouped by occurrence year, coordinate status, department and source each reconciled to that total, with no transfer-limit indication in the aggregate results. All 25 department codes `01`–`25` appeared; this establishes department representation, not exhaustive coverage. Every row's `fuente` value was `DGIS`; the XML resource title references SIDPOL, but no authoritative reconciliation with the imported SIDPOL CSV was established.

- Occurrence year fields range from **1923 to 2025**. The sparse pre-2018 tail needs review; historical occurrence dates alone do not prove invalid records or complete early coverage.
- Latest occurrence timestamp: **2025-06-30T22:35:00Z**. Latest registration timestamp: **2025-06-30T23:59:46Z**. Registration begins at **2018-01-01T00:01:09Z**.
- The 2025 month aggregate contains **January–June only**, totaling **683,773 rows**. No 2026 occurrence year was returned.
- All `fecha_actualizacion` values had the same observed minimum/maximum: **2025-06-30T00:00:00Z**. This is a field value, not proof of the last successful refresh or complete coverage through that date.
- XML metadata resource title: `SIDPOL_MARZO_2025_COMPLETO_WITH_BarrioS`; creation `20250715`, modification `20250403`. These differ from record-date bounds and must not become the application's reporting period.

The existing SIDPOL choropleth's imported availability through September 2026 must remain independent. The new source must expose its own available periods; selecting 2026 must never silently display June 2025 points.

## Location completeness and quality

| `estado_coord` | Rows | Interpretation |
| --- | ---: | --- |
| CON COORDENADA | 4,141,361 | 44.05% marked georeferenced; this is not a positional accuracy guarantee |
| SIN COORDENADA | 5,259,017 | Exclude from any incident-location or concentration rendering |
| SIN COORDENADA XX | 79 | Exclude; no definition verified |
| SIN COORDENADA YY | 34 | Exclude; no definition verified |

Completeness varies significantly over time:

| Occurrence year | All rows | Marked georeferenced | Share |
| --- | ---: | ---: | ---: |
| 2018 | 807,363 | 537,029 | 66.52% |
| 2019 | 936,091 | 462,531 | 49.41% |
| 2020 | 1,046,982 | 436,465 | 41.69% |
| 2021 | 1,318,227 | 525,699 | 39.88% |
| 2022 | 1,480,376 | 627,897 | 42.41% |
| 2023 | 1,577,280 | 940,322 | 59.62% |
| 2024 | 1,524,066 | 510,731 | 33.51% |
| 2025, January–June | 683,773 | 86,908 | 12.71% |

For **Lima department (`15`), June 2025**, only **3,115 of 36,677 rows (8.49%)** were marked georeferenced. These are row-based shares across all source classifications, not unique-crime geocoding rates. Coverage must be calculated again after applying any chosen crime filter.

Validation results:

- A nationwide aggregate found **zero** rows marked `CON COORDENADA` with null, zero or out-of-world-range latitude/longitude attributes. This did not validate every geometry or its location inside the claimed district.
- The first 100 ordered georeferenced rows in the Lima/June scope all had Point geometry, coordinates matching their latitude/longitude attributes within `1e-7` degrees, coordinates within a broad Peru bounding box, and consistent 2/4/6-digit department/province/district prefixes. They contained **85 distinct coordinate pairs**. Repeated coordinates do not establish duplicates or accuracy.
- **All 25 sampled `SIN COORDENADA` rows also had plausible Point geometry and matching coordinate attributes.** They contained 15 distinct coordinate pairs. **Geometry presence and numeric bounds alone cannot identify a usable incident location.** The provider's meaning for these points is unresolved; they must not be used to manufacture apparent hotspots or substituted with station/district centers.
- No national point-in-INEI polygon check, station-coordinate comparison, uncertainty estimate or independent positional verification was performed. Samples were ordered, overlapping and limited to one department/month; they cannot establish nationwide accuracy.

## Identity, dates and classification

Within Lima/June 2025: **36,677 rows**, **34,090 distinct `id_dgc` values**, **zero null `id_dgc` values**. Therefore identifiers repeat. This may represent multiple classifications or another one-to-many relationship; it does not by itself prove erroneous duplicates. Source metadata has a unique `objectid` index and a non-unique `id_dgc` index, without an adequate business-identity definition. `objectid` uniqueness in a snapshot does not guarantee stability after a provider republishes the dataset.

In the two-page georeferenced sample: 200 unique `objectid` values but 182 distinct `id_dgc` values; all 200 had modality and occurrence-date values, and none had an occurrence timestamp after registration. The source year/month fields matched UTC date components for all 200. Converting those dates to America/Lima moved **19** rows into a different month. `dateFieldsTimeReference` is null and `datesInUnknownTimezone` is false. Preserve source date fields and explicit year/month separately; confirm actual timestamp semantics before converting or grouping by inferred local dates.

The same Lima/June scope contains these source classifications:

| `es_delito_x` | `solo_denuncia` | Rows |
| --- | ---: | ---: |
| 1.Delitos | 1 | 16,408 |
| 2.Faltas | 1 | 1,308 |
| 3. Niños y adolescentes | 1 | 99 |
| 4.Violencia contra la mujer e int | 1 | 7,741 |
| Otros | 0 | 9,339 |
| Otros | 1 | 1,782 |

Do not label the entire source as crimes. The precise meaning of `solo_denuncia`, category relationships and `id_dgc` must be documented before counting unique reports. No SIDPOL CSV comparison or mapping of its `P_MODALIDADES` to this layer's modality fields was completed; do not force identical counts, dates or category selectors across the two sources.

## Terms, privacy and readiness

The inspected service/layer description and copyright fields and item `licenseInfo`/`accessInformation` are empty. XML metadata did not supply a specific dataset license or operational quality dictionary. GEOIDEP–GEOPERÚ terms describe informational reuse, provider rights, attribution, provider-license citation and service/accuracy limitations. They do not establish a specific license for bulk redistribution of these incident records. Confirmation remains necessary before production reuse.

The layer schema includes exact-address/free-text fields. Those fields were excluded from all sample requests. Only aggregate findings and diagnostics are retained. A future public view should aggregate validated records to appropriately coarse cells, avoid exact incident pins/addresses and disclose missing-location coverage. A density surface would describe the selected georeferenced reports, not all crime or individual risk; cell size, sparse-cell handling and category selection need deliberate review.

Required before public integration:

1. Obtain the provider's dataset-specific reuse conditions and definitions for identity, classifications, dates and coordinate status/accuracy.
2. Establish a valid crime/report counting unit, idempotent import identity and source-specific category mapping. Do not blindly discard all repeated `id_dgc` rows or sum all rows as crimes.
3. Limit availability to this source's actual periods, exclude every unlocated/unknown status, verify geographic containment and quarantine incompatible records without invented coordinates.
4. Publish source-scoped geocoding coverage for each filter, preserve SIDPOL separately and validate how missing locations affect the proposed visualization.
5. Run a bounded historical prototype with aggregated output and privacy review. Public production readiness remains unestablished by this audit.

No application, database, ETL, infrastructure or dependency changes were made. No news ingestion, full incident export, AWS action or production-data write occurred. See [geographic integration inventory](official-geographic-layers.md).
