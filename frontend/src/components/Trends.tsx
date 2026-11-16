import { useEffect, type ReactNode } from "react";
import type {
  Metadata,
  Period,
  ConcentrationOption,
  Trends as TrendsData,
} from "../lib/api";
import { MonthlyEvolution } from "./MonthlyEvolution";
import {
  formatCount as number,
  formatPeriod as period,
} from "../lib/trendCharts";
import { Button } from "./ui/button";
import { CategoryPie } from "../features/trends/CategoryPie";
import { TerritoryBars } from "../features/trends/TerritoryBars";
import { DataTable } from "../features/trends/DataTable";

type Props = {
  onReady?: (ready: boolean) => void;
  children?: ReactNode;
  controls?: ReactNode;
  geographic?: { latestPeriod: Period | null; imports: ConcentrationOption[] };
  data: TrendsData | null;
  metadata: Metadata | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
  geography: string;
  categoryOrder?: string[];
};
export function Trends({
  onReady,
  children,
  data,
  metadata,
  loading,
  error,
  retry,
  geography,
  categoryOrder = [],
  geographic,
  controls,
}: Props) {
  useEffect(() => {
    onReady?.(true);
  }, [onReady]);
  const unit = geographic ? "registros" : "denuncias",
    unitTitle = geographic ? "Registros" : "Denuncias";
  const colorOrder = categoryOrder.length
    ? categoryOrder
    : (data?.categories.map((item) => item.category) ?? []);
  const change = (value: number | null) =>
    value === null
      ? "No calculable"
      : `${value > 0 ? "+" : ""}${value.toLocaleString("es-PE", { maximumFractionDigits: 2 })}%`;
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="trends-panel"
      aria-label="Tendencias históricas"
      aria-busy={loading}
    >
      <header className="trends-header">
        <div>
          <span className="eyebrow">{geography} · Histórico</span>
          <h1>
            {geographic
              ? "Delitos: registros geográficos."
              : "Las denuncias, en el tiempo."}
          </h1>
          <p>
            Conteos oficiales para explorar evolución, modalidades y
            distribución territorial.
          </p>
        </div>
        {data && (
          <span className="period-pill">
            {period(data.from)} — {period(data.to)}
          </span>
        )}
      </header>
      <div className="trends-toolbar">
        <span>Fuente de datos</span>
        {controls}
      </div>
      {geographic && (
        <p className="source-explanation">
          Publicación geográfica MININTER / SIDPOL. Se cuentan filas con UBIGEO
          válido, incluidas las que no tienen coordenada apta. Son registros de
          hechos y clasificaciones, incluidas otras materias; no equivalen a
          delitos únicos ni a hechos judicialmente comprobados. Cada publicación
          anual se analiza por separado.
        </p>
      )}
      {error && (
        <div className="error-banner" role="alert">
          {error} <Button onClick={retry}>Reintentar</Button>
        </div>
      )}
      {loading && (
        <div
          role="status"
          aria-label="Cargando tendencias"
          className="trends-skeleton"
        >
          <span className="skeleton skeleton-heading" />
          <div className="metric-grid">
            {[0, 1, 2, 3].map((i) => (
              <div className="skeleton" key={i} />
            ))}
          </div>
          <div className="skeleton chart-placeholder" />
          <p>Consultando el histórico oficial…</p>
        </div>
      )}
      {!loading &&
        !error &&
        !(geographic ? geographic.latestPeriod : metadata?.latestPeriod) && (
          <p className="status-banner">
            {geographic
              ? "No hay publicaciones geográficas importadas para esta serie. Ejecuta la ingestión oficial de concentración."
              : "Todavía no hay estadísticas importadas. Ejecuta la ingestión oficial para consultar tendencias."}
          </p>
        )}
      {!geographic &&
        !!metadata?.totalRows &&
        !metadata.imports.some((item) => item.kind === "sidpol-national") && (
          <p className="status-banner">
            La importación tiene cobertura limitada. Ejecuta la ETL nacional
            antes de interpretar estas cifras como nacionales.
          </p>
        )}
      {!loading && !error && data && (
        <>
          <div className="metric-grid">
            <section>
              <span>Total disponible del rango</span>
              <strong>
                {data.metrics.totalReports === null
                  ? "Sin datos"
                  : number(data.metrics.totalReports)}
              </strong>
              <small>
                {data.metrics.monthsWithData} de {data.metrics.requestedMonths}{" "}
                meses con registros
              </small>
            </section>
            <section>
              <span>
                {unitTitle} · {period(data.to)}
              </span>
              <strong>
                {data.metrics.currentMonthReports === null
                  ? "Sin datos"
                  : number(data.metrics.currentMonthReports)}
              </strong>
              <small>Último mes seleccionado</small>
            </section>
            <section>
              <span>Variación mensual</span>
              <strong>{change(data.metrics.monthlyChangePercent)}</strong>
              <small>
                Frente al mes anterior (
                {data.metrics.previousMonthReports === null
                  ? "sin datos"
                  : number(data.metrics.previousMonthReports)}
                )
              </small>
            </section>
            <section>
              <span>Variación interanual</span>
              <strong>{change(data.metrics.yearlyChangePercent)}</strong>
              <small>
                {geographic ? (
                  "No se comparan publicaciones de años distintos."
                ) : (
                  <>
                    Frente al mismo mes del año anterior (
                    {data.metrics.previousYearMonthReports === null
                      ? "sin datos"
                      : number(data.metrics.previousYearMonthReports)}
                    )
                  </>
                )}
              </small>
            </section>
          </div>
          {data.metrics.monthsWithData === 0 && (
            <p className="status-banner">
              No hay datos disponibles para el período seleccionado. La ausencia
              de datos no significa cero {unit}.
            </p>
          )}
          {geographic && data.metrics.totalReports === 0 && (
            <p className="status-banner">
              La publicación está disponible, pero no contiene registros para
              este territorio y categoría. Esto no demuestra ausencia de
              delitos.
            </p>
          )}
          <section className="trend-chart">
            <div className="chart-heading">
              <div>
                <span className="chart-index">01 / En el tiempo</span>
                <h2>Evolución mensual</h2>
              </div>
              <span>
                {geographic
                  ? "Registros de la fuente"
                  : "Denuncias registradas"}
              </span>
            </div>
            <MonthlyEvolution
              data={data}
              categoryOrder={colorOrder}
              unit={geographic ? unit : undefined}
            />
            <p className="chart-note">
              Los cortes de la línea indican meses sin datos; los ceros
              corresponden a registros explícitos.
            </p>
            <DataTable
              label="Ver datos mensuales"
              headers={["Mes", unitTitle]}
              rows={data.monthly.map((point) => [
                period(point.period),
                point.reports === null ? "Sin datos" : number(point.reports),
              ])}
            />
          </section>
          <div className="distribution-grid">
            <section className="trend-chart">
              <div className="chart-heading">
                <div>
                  <span className="chart-index">02 / Por modalidad</span>
                  <h2>Distribución por modalidad</h2>
                </div>
                <span>Participación del rango</span>
              </div>
              <CategoryPie
                unit={geographic ? unit : undefined}
                categories={data.categories}
                categoryOrder={colorOrder}
                periodLabel={`${period(data.from)} — ${period(data.to)}`}
              />
              <DataTable
                label="Ver todas las modalidades"
                headers={["Modalidad", unitTitle]}
                rows={data.categories.map((item) => [
                  item.category,
                  number(item.reports),
                ])}
              />
            </section>
            <section className="trend-chart">
              <div className="chart-heading">
                <div>
                  <span className="chart-index">03 / Por territorio</span>
                  <h2>Comparación territorial</h2>
                </div>
                <span>
                  {data.comparisonLevel === "department"
                    ? "Departamentos"
                    : data.comparisonLevel === "province"
                      ? "Provincias"
                      : "Distritos"}{" "}
                  · hasta 10
                </span>
              </div>
              <TerritoryBars areas={data.territories} unit={unit} />
              <DataTable
                label="Ver todos los territorios"
                headers={["Territorio", "UBIGEO", unitTitle]}
                rows={data.territories.map((item) => [
                  item.name,
                  item.code,
                  number(item.reports),
                ])}
              />
            </section>
          </div>
          <p className="method-note">
            Las cifras son conteos absolutos de {unit}, sin normalizar por
            población. Los totales suman únicamente meses con registros. Las
            variaciones comparan el último mes seleccionado con sus referencias,
            aunque queden fuera del rango; no se calculan si faltan datos o la
            referencia es cero. La presencia de registros no garantiza cobertura
            completa. Más registros no implican necesariamente mayor riesgo
            individual.{" "}
            {geographic &&
              "Las categorías nombradas más «Otras modalidades de la fuente» desglosan el total de 2026 sin duplicarlo. En 2025 la distribución contiene únicamente la categoría del archivo elegido."}
          </p>
        </>
      )}
      {children}
      <footer className="map-footer">
        Último período disponible:{" "}
        {(geographic ? geographic.latestPeriod : metadata?.latestPeriod)
          ? period(
              (geographic ? geographic.latestPeriod : metadata?.latestPeriod)!,
            )
          : "Sin datos"}{" "}
        · Fuente:{" "}
        <a
          href={
            geographic
              ? (geographic.imports[0]?.source ??
                "https://aplicaciones.mininter.gob.pe/mapadeldelitogeoreferenciado/")
              : (metadata?.statisticsSource ??
                "https://www.datosabiertos.gob.pe/dataset/denuncias-policiales-registradas-nivel-nacional-mininter")
          }
          target="_blank"
          rel="noreferrer"
        >
          MININTER / SIDPOL {geographic ? "geográfico" : ""} ↗
        </a>
        {geographic && (
          <details>
            <summary>
              Publicaciones del rango ({geographic.imports.length})
            </summary>
            <ul>
              {geographic.imports.map((item) => (
                <li key={`${item.year}/${item.month}/${item.category}`}>
                  <a href={item.source} target="_blank" rel="noreferrer">
                    {period(item)} · {item.label}
                  </a>{" "}
                  · Importado:{" "}
                  {new Date(item.importedAt).toLocaleString("es-PE")}
                </li>
              ))}
            </ul>
          </details>
        )}
      </footer>
    </main>
  );
}
