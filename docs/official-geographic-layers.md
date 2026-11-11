# Phase 2 — official geographic layers

Current application additions are documented separately in the [concentration guide](concentration.md) and the [street basemap section](#street-basemap-and-real-road-names). The inventory below records the earlier station/source investigation; its initial statements about unimplemented concentration describe that investigation, not the current feature set.

Research and local verification: **2026-11-11 (America/Lima)**. The initial proof of concept displayed **basic police-station locations**, independent of historical SIDPOL statistics. A subsequent [read-only Denuncias source validation](mininter-denuncias-validation.md) checked aggregates and small field-restricted samples; it did not implement a layer from that older Denuncias service. Its source coverage, coordinate-status, identity, date and reuse limitations remain separate from the station POC and the later concentration integration.

## Discovery and service inventory

For the live browser tour, verified 2025 archive periods and a proposed native concentration mode, see [viewer/history integration assessment](mininter-viewer-tour-integration.md). This is research and design; no crime-density layer has been added to the application.

The [exact MININTER crime viewer supplied on 2026-11-12](mininter-exact-viewer-source.md) declares a separate ArcGIS Online `SIDPOL_DELITOS_TOTAL/FeatureServer/25` point layer with a heatmap renderer and 2026 records. Its source must be validated independently from the older `ogc/denuncias` service audited here. The application still integrates only basic stations as its optional MININTER overlay.

Primary references:

- [MININTER service catalogue](https://geoportal.mininter.gob.pe/index.php/servicios/catalogo-de-servicios), [interoperability standards](https://geoportal.mininter.gob.pe/index.php/documentacion/estandares).
- [GEOIDEP national catalogue, MININTER](https://www.geoidep.gob.pe/catalogo-nacional-de-servicios-web?id_institucion=81). Its public service links identify the current `geomininter` host. A catalogue's “Disponible” indicator does not guarantee live availability.
- [Current ArcGIS service metadata](https://geomininter.mininter.gob.pe/arcgis/rest/services/ogc/lineabase/MapServer?f=pjson), [basic-station layer metadata](https://geomininter.mininter.gob.pe/arcgis/rest/services/ogc/lineabase/MapServer/2?f=pjson).
- [Esri documented layer query API](https://developers.arcgis.com/rest/services-reference/enterprise/query-map-service-layer/).

| Public service | Observed support / result | Decision |
| --- | --- | --- |
| MININTER legacy `seguridadciudadana.mininter.gob.pe/arcgis/services/servicios_ogc/policia_nacional_peru/MapServer/WMSServer` | WMS 1.3.0; station and police-administration layers listed in MININTER's catalogue | Reference only; do not reuse its layer IDs on the current service |
| Current `geomininter.mininter.gob.pe/arcgis/services/ogc/lineabase/MapServer/WMSServer?service=WMS&request=GetCapabilities` | WMS 1.3.0; geographic CRS:84/EPSG:4326 advertised, not EPSG:3857 | Direct Web Mercator raster tiles need additional projection/BBOX handling; not used in this POC |
| Current `geomininter.mininter.gob.pe/arcgis/rest/services/ogc/lineabase/MapServer` | Public Map/Query/Data service, JSON/GeoJSON/PBF, EPSG:4326, pagination and maximum 2,000 records per response | Use documented REST layer query with GeoJSON, not viewer traffic or a private endpoint |
| Current `.../arcgis/services/ogc/lineabase/MapServer/WFSServer?service=WFS&request=GetCapabilities` | REST metadata advertises WFS extension, but this request returned HTTP 200 with an empty body | No usable WFS capabilities/schema verified; do not assume feature access works |
| GEOIDEP's GeoPERÚ `espacialg.geoperu.gob.pe/geoserver/geoperu/peru_internet_comisarias_/wms?service=WMS&request=GetCapabilities` | HTTP 403 | Not used; no access-control bypass |

Current `lineabase` layers (REST and WMS numbering are **different**):

| Layer | Geometry | REST ID | Current WMS ID | Scope / observation |
| --- | --- | --- | --- | --- |
| Comisarías Familia | Point | 0 | 6 | 48 features at verification; not integrated |
| Jurisdicciones Comisarías Familia | Polygon | 1 | 5 | Police jurisdictions; not administrative districts |
| Comisarías Básicas | Point | **2** | 4 | **1,330** features at verification, nationwide distribution; integrated |
| Sectores Comisarías Básicas | Polygon | 3 | 3 | Police sectors; not integrated |
| Jurisdicciones Comisarías Básicas | Polygon | 4 | 2 | Police jurisdictions; not integrated |
| División Policial | Polygon | 5 | 1 | Police administration; not integrated |
| Región Policial | Polygon | 6 | 0 | Police administration; not integrated |

Basic-station extent observed: longitude approximately −81.305 to −68.981, latitude −18.177 to −0.971. This supports nationwide distribution, **not guaranteed exhaustive coverage**. Counts are observations, not hardcoded application expectations. No station inventory year, last-update date, positional accuracy or completeness declaration was found in the inspected layer metadata. The page footer's copyright year is not a dataset date.

The national catalogue also lists Barrio Seguro, Puestos Fronterizos and Denuncias services, station jurisdictions/sectors and viewer applications. Initially these were inventoried only as advertised resources. The subsequent [Denuncias validation](mininter-denuncias-validation.md) confirmed public query access and found substantial quality/coverage limits, including geometry in records explicitly marked unlocated. Other unintegrated services' feature content and conditions remain unvalidated. No full crime-event dataset was downloaded or imported. A catalogue-advertised station ZIP was not downloaded or bundled.

## Usage conditions

[Published GEOIDEP–GEOPERÚ terms](https://www.geoidep.gob.pe/static/docs/terminos_condiciones.pdf) describe informational/territorial reuse, provider rights, attribution to the provider and platform, citation of the provider's license, availability/accuracy limitations and prohibited misuse. They do not establish a specific MININTER dataset license. The inspected service's description/copyright fields were empty; this POC does **not** label the data public domain or assign an open license.

The UI attributes MININTER/PNP and GEOIDEP–GEOPERÚ, links directly to the service, catalogues and terms, and distinguishes consultation time from an undeclared update date. Specific provider licensing/redistribution conditions and production availability still need confirmation before production use. This sprint does not publish, export, persist or archive the station dataset. Points are fetched on explicit opt-in and kept only in browser memory. Completed responses are reusable for 15 minutes; an active snapshot is not refreshed automatically. Government-side changes or outages remain external dependencies.

## Smallest integration and architecture

The existing MapLibre instance and SIDPOL/INEI source IDs, contracts, queries and filters are preserved. No backend endpoint, database table, migration, ETL modification, dependency, proxy service, environment variable or infrastructure resource is added.

- `frontend/src/lib/policeStations.ts`: fixed public REST layer-2 adapter, selected fields only, GeoJSON validation and bounded in-memory cache.
- `frontend/src/hooks/usePoliceStations.ts`: opt-in loading, 20-second overall timeout, abort on disable/navigation/unmount, retry and independent status; geographic filtering by UBIGEO.
- `frontend/src/components/MapLayerControls.tsx`: independent **Denuncias SIDPOL** (on by default) and **Comisarías básicas** (off by default) controls, brown-point legend, attribution, loading/error/empty/count and consultation time.
- `frontend/src/components/CrimeMap.tsx`: separate `police-stations` GeoJSON source/circle layer above the existing choropleth, safe text-only popup, separate rendering error and resize-aware camera fit. Selecting a station never triggers selection of the polygon underneath.
- `frontend/src/App.tsx` and `styles.css`: connect the hook/controls using existing geographic state and responsive layout. Tests cover the adapter, hook and map integration.

The browser calls only:

```text
https://geomininter.mininter.gob.pe/arcgis/rest/services/ogc/lineabase/MapServer/2/query
  ?f=geojson&where=1%3D1
  &outFields=objectid%2Ccomisaria%2Cid_dpto%2Cid_prov%2Cid_dist
  &outSR=4326&returnGeometry=true&orderByFields=objectid
  &resultOffset=0&resultRecordCount=1000
```

Pagination continues by the number actually received, honoring transfer-limit flags, for at most five pages. HTTP/provider errors, oversized text responses (2 million characters per page), invalid/non-Point geometry, non-finite/out-of-range coordinates, inconsistent 2/4/6-digit geographic prefixes and duplicate IDs reject the load; partial results are never drawn or cached. No names, contact information or other personnel attributes are requested. Unit tests use explicitly synthetic transport fixtures, never shipped map data.

Live GETs, including browser CORS, worked without a token. Requests omit credentials and referrer. Upstream CORS is controlled by MININTER and may change. The application's existing same-origin backend policy/rate limiter remains unchanged; its limits do not govern browser calls to MININTER. No automatic retry or background polling is added. Re-enable within the cache lifetime reuses the completed response; failed loads can be retried explicitly.

Department/province/district filters match source UBIGEO; **year, month and crime modality apply only to SIDPOL**. A zero station selection means no matching records returned, not absence of police service. Station counts never enter SIDPOL totals/ranking, risk scores or rates. Popup text explains that these installations do not represent the selected SIDPOL period. The optional station layer can be viewed independently even when statistics fail; its default camera needs imported INEI boundaries for territory-specific framing.

## Run and validate locally

Use the existing README setup and `docker compose --profile app up --build -d`. Open `http://localhost:5173`, leave **Denuncias SIDPOL** enabled and opt into **Comisarías básicas**. Internet access to the fixed official HTTPS service is required. No station download/import step or API key is needed. Existing SIDPOL/INEI imports continue to drive statistics, ranking, territory selectors and geographic framing.

```bash
cd frontend
npm run build
npm test
```

Automated tests stub the upstream service and renderer; government availability is not a unit-test dependency. Real-browser verification, exact executed counts, observed coverage and limitations are recorded in [validation notes](mvp-validation.md). For later layers, recheck capabilities, ID/geometry/schema, geographic and temporal coverage, CORS, transfer limits, terms and attribution independently. Do not convert police jurisdictions into INEI administrative boundaries or treat stations as crimes.

## Street basemap and real road names

Implemented and verified **2026-11-12 (America/Lima)**. **Calles y referencias**, enabled by default under Mapa → Capas, adds a light street basemap in both Estadísticas and Concentración. OpenFreeMap serves OpenStreetMap/OpenMapTiles vector data and fonts, independently of MININTER/INEI statistical sources. The [public service](https://openfreemap.org/) currently requires no account or API key and permits commercial use, but offers no SLA. Follow the [provider integration guide](https://openfreemap.org/quick_start/) and current terms for service use. This integration does not prefetch areas or implement offline downloads.

The fixed [Positron style](https://tiles.openfreemap.org/styles/positron), [vector TileJSON](https://tiles.openfreemap.org/planet) and provider font endpoint are requested directly by the browser. No database credentials or crime counts are sent to the provider. As with other external tile services, it receives normal network requests revealing the requested map area and client connection information. A local/Spanish street name is preferred when the vector feature supplies it; otherwise the published local name is used. Major road names appear from approximately zoom 12.2, minor street names from zoom 14, subject to data availability and label collision. Buildings and land-use references appear with the provider's zoom-dependent styling. No address search, routing, geocoding or Google Maps content is included.

The frontend validates the style's expected vector source, glyph endpoint and road/name layers. It imports base surfaces, then road lines and readable labels around the existing statistical/density layers without replacing the canvas or application sources. Provider boundary lines are omitted; INEI remains the authority for the application's administrative filters. Icon-only layers and sprite dependencies are omitted. OpenFreeMap, OpenMapTiles and OpenStreetMap credits are shown by the map attribution control, including on mobile. With the control disabled, the provider source is removed. A neutral INEI land surface and administrative outlines remain visible when statistical coloring is also off, so disabling all optional layers does not blank the map. The same neutral fallback is used during a street-provider failure. It has no crime counts, statistical popups or count legend. The toggle selection is retained between map modes; the street source is suspended outside the Map view.

Initial loading has a 20-second deadline. HTTP/style/known provider tile or glyph failures remove the contextual source and show a retry message; original geometry, aggregate counts, filters and station controls remain available. There are no automatic repeated retries. A successful style is cached in memory for re-enabling, not stored as an offline map. The provider's current geography is not historical geography for the selected reporting period; its completeness and naming depend on OpenStreetMap. Seeing a street below a concentration cell does not attribute that cell's reports to the street or improve the source's location precision.

No import, migration, backend contract, extra library or infrastructure service is required. For an existing local stack, rebuild only the frontend:

```bash
docker compose --profile app up --build -d --no-deps web
```

If the local stack is stopped, start it with `docker compose --profile app up --build -d` instead. Open http://localhost:5173, zoom into a district, and use **Calles y referencias** to compare the views. See [executed validation](mvp-validation.md) for actual Lima road names, preserved counts, provider-outage recovery and mobile checks.
