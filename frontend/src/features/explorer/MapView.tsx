import { ModeSwitch } from "../../components/ui/mode-switch";
import { useExplorer } from "./ExplorerContext";
import { months, format } from "../../lib/calendar";
import { Button } from "../../components/ui/button";
import { lazy, Suspense } from "react";
import { FeatureBoundary, ViewLoading } from "./ViewLoading";
import { MapDetailControls } from "../../components/MapDetailControls";
import { RadiusControls } from "../../components/RadiusControls";
import { MapLayerControls } from "../../components/MapLayerControls";
const LazyCrimeMap = lazy(() =>
  import("../../components/CrimeMap").then((module) => ({
    default: module.CrimeMap,
  })),
);

export function MapView() {
  const {
    view,
    showStatistics,
    setShowStatistics,
    mapMode,
    setMapMode,
    showStations,
    setShowStations,
    showStreets,
    setShowStreets,
    state,
    metadata,
    category,
    department,
    setDepartment,
    province,
    district,
    setDistrict,
    mapData,
    summary,
    loading,
    error,
    setMapViewport,
    density,
    detail,
    mapCells,
    mapGridMetres,
    radius,
    stations,
    setSelection,
    periodLabel,
    departmentName,
    districtName,
    provinceName,
    chooseArea,
    selected,
    mapVisited,
    independentGeography,
    setMapModuleReady,
  } = useExplorer();
  return (
    <main
      id={view === "map" ? "main-content" : undefined}
      tabIndex={-1}
      className="map-panel"
      hidden={view !== "map"}
    >
      <div className="map-header">
        <div>
          <span className="eyebrow">
            {districtName
              ? `${departmentName} / ${provinceName ? `${provinceName} / ` : ""}${districtName}`
              : provinceName
                ? `${departmentName} / ${provinceName}`
                : (departmentName ?? "Perú · Vista nacional")}
          </span>
          <h1>
            {mapMode === "statistics"
              ? "Mapa de denuncias"
              : "Concentración de registros"}
          </h1>
        </div>
        <span className="period-pill">
          {mapMode === "concentration"
            ? density.data
              ? `${months[density.data.selection.month - 1]} ${density.data.selection.year}`
              : density.selection
                ? `${months[Number(density.selection.split("/")[1]) - 1]} ${density.selection.split("/")[0]}`
                : "Sin selección geográfica"
            : periodLabel}
        </span>
      </div>
      <div className="geographic-navigation">
        {department ? (
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setSelection(null);
                setDepartment("");
              }}
            >
              ← Volver a Perú
            </Button>
            <span>
              {districtName ?? provinceName ?? departmentName ?? department} ·{" "}
              {district ? "Distrito" : "Distritos"}
            </span>
          </>
        ) : (
          <span>Perú · Departamentos</span>
        )}
      </div>
      <div className="map-toolbar">
        <ModeSwitch
          label="Representación del mapa"
          value={mapMode}
          onValueChange={setMapMode}
          options={[
            { value: "statistics", label: "Estadísticas" },
            { value: "concentration", label: "Concentración" },
          ]}
        />
        {mapMode === "statistics" && (
          <ModeSwitch
            label="Métrica del mapa"
            value={state.mapMetric}
            onValueChange={state.setMapMetric}
            options={[
              { value: "count", label: "Cantidad" },
              { value: "rate", label: "Por 100.000 hab." },
            ]}
          />
        )}
        {mapMode === "concentration" && <MapDetailControls detail={detail} />}
        {mapMode === "concentration" && (
          <RadiusControls
            loading={density.loading}
            available={Boolean(density.data?.spatialDetailAvailable)}
            analysis={radius}
          />
        )}
        <MapLayerControls
          streets={showStreets}
          setStreets={setShowStreets}
          showStatisticsControl={mapMode === "statistics"}
          statistics={mapMode === "statistics" && showStatistics}
          setStatistics={(value) => {
            setMapMode("statistics");
            setShowStatistics(value);
          }}
          stations={showStations}
          setStations={setShowStations}
          loading={stations.loading}
          error={stations.error}
          count={stations.data?.features.length ?? null}
          fetchedAt={stations.fetchedAt}
          retry={stations.retry}
        />
      </div>
      <div className="map-frame">
        <div className="map-messages" aria-live="polite">
          {mapMode === "concentration" && independentGeography.error && (
            <div role="alert" className="error-banner">
              No se pudieron cargar los límites geográficos.{" "}
              <Button onClick={independentGeography.retry}>
                Reintentar límites
              </Button>
            </div>
          )}
          {mapMode === "statistics" &&
            !!metadata?.totalRows &&
            !metadata.imports.some(
              (item) => item.kind === "sidpol-national",
            ) && (
              <p className="status-banner">
                La importación anterior tiene cobertura limitada. Ejecuta la ETL
                nacional actualizada antes de interpretar el total como
                nacional.
              </p>
            )}
          {mapMode === "statistics" && loading && (
            <p role="status" className="status-banner">
              Consultando datos oficiales…
            </p>
          )}
          {mapMode === "statistics" && error && (
            <div role="alert" className="error-banner">
              {error} <Button onClick={state.retry}>Reintentar</Button>
            </div>
          )}
          {mapMode === "statistics" &&
            !loading &&
            !error &&
            !metadata?.latestPeriod && (
              <p className="status-banner">
                Todavía no hay estadísticas importadas. Carga el CSV oficial de
                MININTER y el GeoJSON distrital de INEI siguiendo el README.
              </p>
            )}
          {mapMode === "statistics" && !!summary?.districtsWithoutGeometry && (
            <p className="status-banner">
              {summary.districtsWithoutGeometry} distritos con denuncias no
              tienen geometría. Sus cifras están incluidas en el total y el
              ranking.
            </p>
          )}
          {mapMode === "statistics" &&
            !loading &&
            !error &&
            summary?.districtsWithData === 0 && (
              <p className="status-banner">
                Sin registros para este período y modalidad. Los distritos se
                muestran como «Sin datos».
              </p>
            )}
        </div>
        {(mapVisited || view === "map") && (
          <FeatureBoundary onError={() => setMapModuleReady(true)}>
            <Suspense fallback={<ViewLoading label="Preparando mapa…" />}>
              <LazyCrimeMap
                metric={state.mapMetric}
                onReady={setMapModuleReady}
                onViewportChange={
                  view === "map" && mapMode === "concentration"
                    ? setMapViewport
                    : undefined
                }
                analysisRadiusMetres={
                  radius.active ? radius.radiusMetres : undefined
                }
                mapDetailError={detail.error}
                mapDetailLoading={Boolean(
                  density.data?.spatialDetailAvailable && detail.loading,
                )}
                mapSuppressedCells={detail.data?.suppressedCells}
                locationBased={Boolean(density.data?.spatialDetailAvailable)}
                radiusGeometry={radius.data?.area ?? null}
                onRadiusPick={radius.active ? radius.pick : undefined}
                showStreets={showStreets && view === "map"}
                stations={stations.data}
                concentration={mapMode === "concentration"}
                densityCells={mapCells}
                densityGridMetres={mapGridMetres}
                showStatistics={mapMode === "statistics" && showStatistics}
                data={mapData}
                periodLabel={
                  mapMode === "concentration"
                    ? density.data
                      ? `${months[density.data.selection.month - 1]} ${density.data.selection.year}`
                      : "Cargando período…"
                    : periodLabel
                }
                onSelect={chooseArea}
                selectedUbigeo={selected?.code ?? null}
                department={department}
                province={province}
                district={district}
                loading={
                  mapMode === "statistics"
                    ? loading && !error
                    : independentGeography.loading ||
                      (density.loading && !density.error) ||
                      (detail.loading && !detail.error)
                }
              />
            </Suspense>
          </FeatureBoundary>
        )}
        {mapMode === "statistics" &&
          !loading &&
          !error &&
          mapData &&
          mapData.features.length === 0 && (
            <div className="map-empty">
              Sin límites geográficos disponibles para esta vista. Ejecuta la
              ETL nacional de INEI.
            </div>
          )}
        {mapMode === "statistics" && selected && (
          <section
            className="district-info"
            aria-label="Distrito seleccionado"
            aria-live="polite"
          >
            <Button
              variant="ghost"
              className="close-info"
              onClick={() => {
                setSelection(null);
                setDistrict("");
              }}
              aria-label="Cerrar información del distrito"
            >
              ×
            </Button>
            <div className="eyebrow">DISTRITO / {selected.code}</div>
            <h3>{selected.name}</h3>
            <strong>
              {selected.reports === null
                ? "Sin datos"
                : `${format(selected.reports)} denuncias`}
            </strong>
            {state.mapMetric === "rate" && (
              <p>
                {selected.ratePer100k == null
                  ? "Tasa no disponible"
                  : `${selected.ratePer100k.toLocaleString("es-PE", { maximumFractionDigits: 2 })} por 100.000 habitantes · tasa mensual`}
              </p>
            )}
            <p>
              {periodLabel} · {category || "Todas las modalidades"}
            </p>
            {!mapData?.features.some(
              (f) => f.properties.code === selected.code,
            ) && <p>Geometría no disponible.</p>}
          </section>
        )}
        <div
          hidden={!showStatistics || mapMode !== "statistics"}
          className="map-legend"
          aria-label={
            state.mapMetric === "rate"
              ? "Leyenda de tasa mensual de denuncias"
              : "Leyenda de cantidad absoluta de denuncias"
          }
        >
          <strong>
            {state.mapMetric === "rate"
              ? "Denuncias por 100.000 habitantes · mes"
              : `Denuncias por ${department ? "distrito" : "departamento"}`}
          </strong>
          <div className="legend-scale">
            {(state.mapMetric === "rate"
              ? [
                  [null, "No disponible", "#d8dfe3"],
                  [0, "0", "#f2f6f5"],
                  [1, ">0–<100", "#c2ddd7"],
                  [100, "100–<250", "#86c9b9"],
                  [250, "250–<500", "#4ca694"],
                  [500, "500+", "#257b71"],
                ]
              : [
                  [null, "Sin datos", "#d8dfe3"],
                  [0, "0", "#f2f6f5"],
                  [1, department ? "1–99" : "1–999", "#c2ddd7"],
                  [100, department ? "100–499" : "1 000–4 999", "#86c9b9"],
                  [500, department ? "500–999" : "5 000–9 999", "#4ca694"],
                  [1000, department ? "1 000+" : "10 000+", "#257b71"],
                ]
            ).map(([value, label, color]) => (
              <span key={String(value)}>
                <i style={{ background: String(color) }} />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <footer className="map-footer">
        <div>
          {mapMode === "statistics" &&
            state.mapMetric === "rate" &&
            !loading &&
            !error && (
              <p className="map-rate-note">
                Población INEI del mismo año · proyección preliminar. No es
                riesgo individual.
                {!state.populationAvailable &&
                  " Importa las proyecciones para calcular tasas."}
                {!!state.quality?.missingPopulationDistricts &&
                  " Hay registros sin población compatible; algunas tasas se omiten."}
              </p>
            )}
          {mapMode === "concentration"
            ? "Último período SIDPOL (CSV)"
            : "Último período disponible"}
          :{" "}
          <strong>
            {metadata?.latestPeriod
              ? `${months[metadata.latestPeriod.month - 1]} ${metadata.latestPeriod.year}`
              : "Sin datos"}
          </strong>
          <br />
          Fuente estadística:{" "}
          <a
            href={
              metadata?.statisticsSource ??
              "https://www.datosabiertos.gob.pe/dataset/denuncias-policiales-registradas-nivel-nacional-mininter"
            }
            target="_blank"
            rel="noreferrer"
          >
            MININTER / SIDPOL ↗
          </a>{" "}
          · Límites:{" "}
          <a
            href={metadata?.geometrySource ?? "https://ide.inei.gob.pe/"}
            target="_blank"
            rel="noreferrer"
          >
            INEI ↗
          </a>
        </div>
        <details>
          <summary>
            Datos y trazabilidad ({metadata?.totalRows ?? 0} filas agregadas)
          </summary>
          {metadata?.imports.length ? (
            <ul>
              {metadata.imports.map((item) => (
                <li key={`${item.kind}-${item.sha256}`}>
                  <strong>{item.kind.toUpperCase()}</strong>: {item.name}
                  <br />
                  <span>
                    Importado:{" "}
                    {new Date(item.importedAt).toLocaleString("es-PE")} ·
                    SHA-256: {item.sha256}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No hay importaciones registradas.</p>
          )}
        </details>
      </footer>
    </main>
  );
}
