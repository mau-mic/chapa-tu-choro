import type { ConcentrationData, ConcentrationMetadata } from "../lib/api";
import { MonthlyLine } from "./MonthlyEvolution";
import { formatCount } from "../lib/trendCharts";
import { Button } from "./ui/button";
type Props = {
  mapDetail?: {
    data: import("../lib/api").MapCellsData | null;
    loading: boolean;
    error: string | null;
    outsideCoverage: boolean;
  };
  metadata: ConcentrationMetadata | null;
  selection: string;
  setSelection: (v: string) => void;
  data: ConcentrationData | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
};
export function ConcentrationPanel({
  mapDetail,
  metadata,
  selection,
  setSelection,
  data,
  loading,
  error,
  retry,
}: Props) {
  const [year, month, category] = selection.split("/");
  const options = metadata?.available ?? [];
  const years = [...new Set(options.map((o) => o.year))];
  const cats = options.filter((o) => o.year === Number(year));
  const choose = (y: string, c: string, m: string) => {
    const available = options.filter((o) => o.year === Number(y));
    const cat = available.some((o) => o.category === c)
      ? c
      : (available.find((o) => o.category === "all")?.category ??
        available.find((o) => o.category === "robbery")?.category ??
        available[0]?.category);
    const next =
      available.find((o) => o.category === cat && o.month === Number(m)) ??
      available.find((o) => o.category === cat);
    if (next) setSelection(`${next.year}/${next.month}/${next.category}`);
  };
  return (
    <section
      className="concentration-panel"
      aria-label="Concentración de registros oficiales"
    >
      <h2>Concentración geográfica</h2>
      <p className="lead">
        Registros de la fuente geográfica oficial. Una fila puede representar
        una clasificación; no equivale a un delito único ni a riesgo individual.
      </p>
      <div className="filter-grid">
        <label>
          Año de concentración
          <select
            value={year ?? ""}
            disabled={!options.length}
            onChange={(e) => choose(e.target.value, category, month)}
          >
            {!years.length && <option value="">Sin datos</option>}
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        <label>
          Mes de concentración
          <select
            value={month ?? ""}
            disabled={!selection}
            onChange={(e) => choose(year, category, e.target.value)}
          >
            {[
              ...new Set(
                cats.filter((o) => o.category === category).map((o) => o.month),
              ),
            ].map((m) => (
              <option key={m} value={m}>
                {new Intl.DateTimeFormat("es-PE", {
                  month: "long",
                  timeZone: "UTC",
                }).format(new Date(Date.UTC(2026, m - 1, 1)))}
              </option>
            ))}
          </select>
        </label>
        <label className="full-row">
          Categoría geográfica
          <select
            value={category ?? ""}
            disabled={!selection}
            onChange={(e) => choose(year, e.target.value, month)}
          >
            {[...new Map(cats.map((o) => [o.category, o])).values()].map(
              (o) => (
                <option key={o.category} value={o.category}>
                  {o.label}
                </option>
              ),
            )}
          </select>
        </label>
      </div>
      {year === "2025" && (
        <p className="method-note">
          2025 utiliza archivos por categoría. No se calcula un total conjunto
          de archivos que podrían solaparse. Solo se ofrecen períodos
          importados.
        </p>
      )}
      {loading && (
        <div role="status" className="ranking-skeleton">
          <span className="skeleton skeleton-row" />
          <span className="skeleton skeleton-row" />
          Cargando concentración…
        </div>
      )}
      {error && (
        <div role="alert" className="error-banner">
          {error} <Button onClick={retry}>Reintentar concentración</Button>
        </div>
      )}
      {!loading && !error && !options.length && (
        <p className="status-banner">
          {metadata?.setupRequired
            ? "La base necesita la actualización de concentración."
            : "Todavía no hay instantáneas geográficas importadas."}{" "}
          Consulta el README para ejecutar la ETL. El histórico SIDPOL sigue
          disponible en Estadísticas.
        </p>
      )}
      {data && !loading && (
        <>
          <div className="summary-box">
            <span>Registros mapeables de esta selección</span>
            <strong className="big-number">
              {formatCount(data.mappedRecords)}
            </strong>
            <span>
              {formatCount(data.sourceRecords)} filas con UBIGEO válido ·{" "}
              {formatCount(data.sourceRecords - data.mappedRecords)} sin
              ubicación apta
            </span>
          </div>
          {mapDetail ? (
            <p className="method-note" aria-live="polite">
              {mapDetail.loading ? (
                "Actualizando las agrupaciones de la vista…"
              ) : mapDetail.data ? (
                <>
                  Agrupación del mapa:{" "}
                  {mapDetail.data.gridMetres < 1000
                    ? `${mapDetail.data.gridMetres} m`
                    : `${mapDetail.data.gridMetres / 1000} km`}{" "}
                  por lado en proyección cartográfica.{" "}
                  {formatCount(mapDetail.data.cells.length)} agrupaciones
                  cargadas para esta vista y su margen;{" "}
                  {formatCount(mapDetail.data.suppressedCells)} no se dibujan
                  por tener menos de {mapDetail.data.minimumCellRecords}{" "}
                  registros.
                </>
              ) : mapDetail.outsideCoverage ? (
                "La vista está fuera de la cobertura de Perú."
              ) : (
                "El detalle del mapa no está disponible para esta vista."
              )}{" "}
              El total superior corresponde al territorio seleccionado. La
              precisión de origen no está certificada.
            </p>
          ) : (
            <>
              <p className="method-note">
                Celdas agregadas de {data.gridMetres / 1000} km en proyección
                cartográfica; mínimo {data.minimumCellRecords} registros por
                celda visible.{" "}
                {formatCount(data.mappedRecords - data.visibleRecords)}{" "}
                registros mapeables quedan en celdas ocultas por baja cantidad.
                La precisión de origen no está certificada.
              </p>
            </>
          )}
          {data.mappedRecords === 0 && (
            <p className="empty-state">
              No hay ubicaciones aptas para estos filtros. No significa ausencia
              de denuncias.
            </p>
          )}
          <h3>Evolución dentro de la misma fuente/año</h3>
          <MonthlyLine
            unit="registros mapeables"
            series={[
              {
                name: "Registros mapeables",
                color: "#ad6843",
                points: Array.from(
                  { length: 12 },
                  (_, i) =>
                    data.monthly.find((p) => p.period.month === i + 1) ?? {
                      period: { year: data.selection.year, month: i + 1 },
                      reports: null,
                    },
                ),
              },
            ]}
          />
          <details className="concentration-context">
            <summary>Analítica territorial y contexto SIDPOL</summary>
            <p>{data.comparisonNote}</p>
            <div className="chart-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Territorio</th>
                    <th>Filas fuente</th>
                    <th>Mapeables</th>
                    <th>SIDPOL · todas las modalidades</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ranking.map((a) => (
                    <tr key={a.code}>
                      <th scope="row">
                        {a.name} · {a.code}
                      </th>
                      <td>{formatCount(a.sourceRecords)}</td>
                      <td>{formatCount(a.mappedRecords)}</td>
                      <td>
                        {a.sidpolReports === null
                          ? "Sin datos"
                          : formatCount(a.sidpolReports)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          {data.quality && (
            <details className="concentration-context">
              <summary>Calidad de la instantánea nacional</summary>
              <p>
                {formatCount(data.quality.sourceRows)} filas de origen;{" "}
                {data.quality.distinctSourceIdentifiers == null
                  ? "identificadores de negocio distintos: no disponibles en la fuente"
                  : `${formatCount(data.quality.distinctSourceIdentifiers)} identificadores de negocio distintos`}
                . Se conservan las clasificaciones repetidas, sin tratarlas como
                delitos únicos. Los registros con UBIGEO inválido no entran en
                los totales territoriales.
              </p>
              <p>
                La ETL registra coordenadas ausentes o incompatibles,
                ubicaciones fuera del distrito declarado y límites faltantes.
                Estos controles no certifican precisión ni cobertura de todos
                los hechos.
              </p>
            </details>
          )}
          <p className="method-note">
            Fuente:{" "}
            <a
              href={data.selection.source}
              target="_blank"
              rel="noopener noreferrer"
            >
              MININTER / SIDPOL geográfico ↗
            </a>
            <br />
            Instantánea importada:{" "}
            {new Date(data.selection.importedAt).toLocaleString("es-PE")}. No se
            suman a los conteos CSV ni se identifica a personas. Licencia
            específica y significado de los identificadores pendientes de
            aclaración con el proveedor.
          </p>
        </>
      )}
    </section>
  );
}
