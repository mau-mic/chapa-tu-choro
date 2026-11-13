import { useState } from "react";
import type {
  Period,
  PopulationComparisonData,
  PopulationHistoryPoint,
} from "../../lib/api";
import { months } from "../../lib/calendar";
import { usePopulationComparison } from "../../hooks/usePopulationComparison";
import { Button } from "../../components/ui/button";

const integer = new Intl.NumberFormat("en-US");
const decimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const number = (value: number | null, rate = false) =>
  value === null
    ? "No hay datos disponibles"
    : (rate ? decimal : integer).format(value);

export function PopulationComparison({
  period,
  department,
  province,
  district,
  category,
}: {
  period: Period | null;
  department: string;
  province: string;
  district: string;
  category: string;
}) {
  const state = usePopulationComparison(
    period?.year,
    period?.month,
    department,
    province,
    district,
    category,
  );
  return <PopulationComparisonContent period={period} {...state} />;
}

export function PopulationComparisonContent({
  period,
  history,
  data,
  loading,
  error,
  retry,
}: {
  period: Period | null;
  history?: PopulationHistoryPoint[];
  data: PopulationComparisonData | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}) {
  const [metric, setMetric] = useState<"rate" | "count">("rate");
  const selected = data?.monthly.find((p) => p.month === data.month);
  const ranking = data
    ? [...data.ranking]
        .sort((a, b) =>
          metric === "rate"
            ? (b.ratePer100k ?? -1) - (a.ratePer100k ?? -1) ||
              a.ubigeo.localeCompare(b.ubigeo)
            : b.reports - a.reports || a.ubigeo.localeCompare(b.ubigeo),
        )
        .slice(0, 15)
    : [];
  const maximum = Math.max(
    1,
    ...ranking.map((item) =>
      metric === "rate" ? (item.ratePer100k ?? 0) : item.reports,
    ),
  );
  const monthly =
    history ??
    data?.monthly
      .filter((p) => p.month <= data.month)
      .map((p) => ({
        period: { year: data.year, month: p.month },
        reports: p.reports,
        ratePer100k: p.ratePer100k,
      })) ??
    [];
  return (
    <section
      className="population-comparison"
      aria-labelledby="population-heading"
      aria-busy={loading}
    >
      <div className="population-heading">
        <div>
          <h2 id="population-heading">Denuncias y población</h2>
          <p>
            Compara cantidades y tasas con los filtros territoriales y de
            modalidad seleccionados.
          </p>
        </div>
        <p className="population-period" aria-live="polite">
          {period
            ? `${months[period.month - 1]} ${period.year} · Período compartido`
            : "Sin período disponible"}
        </p>
      </div>
      {loading ? (
        <p role="status">Cargando comparación de población…</p>
      ) : error ? (
        <div role="alert">
          <p>{error}</p>
          <p>
            Comprueba que el Excel de población esté importado y que cubra el
            año elegido.
          </p>
          <Button variant="ghost" onClick={retry}>
            Reintentar comparación
          </Button>
        </div>
      ) : !data ? (
        <p>No hay datos disponibles para el período seleccionado.</p>
      ) : (
        <>
          <dl className="population-totals">
            <div>
              <dt>Población proyectada</dt>
              <dd>{number(data.population)}</dd>
            </div>
            <div>
              <dt>Denuncias del mes</dt>
              <dd>{number(selected?.reports ?? null)}</dd>
            </div>
            <div>
              <dt>Denuncias por 100.000 habitantes</dt>
              <dd>{number(selected?.ratePer100k ?? null, true)}</dd>
            </div>
          </dl>
          <p>
            Población de referencia: 30 de junio de {data.year}. Proyección INEI
            preliminar; no incorpora los resultados definitivos del Censo 2025.
          </p>
          {(selected?.rowsWithoutPopulation ?? 0) > 0 && (
            <p role="status">
              Hay registros sin población compatible. Se conserva el conteo y se
              omite la tasa agregada.
            </p>
          )}
          <div className="population-columns">
            <div>
              <h3>
                Evolución mensual · {monthly[0]?.period.year ?? data.year}
                {monthly[0]?.period.year !== data.year ? `–${data.year}` : ""}
              </h3>
              <div
                className="population-table population-monthly-table"
                role="region"
                aria-label="Serie mensual del período seleccionado"
                tabIndex={0}
              >
                <table>
                  <caption className="sr-only">
                    Denuncias y tasa mensual; meses sin registros figuran como
                    no disponibles.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Período</th>
                      <th scope="col">Denuncias</th>
                      <th scope="col">Por 100.000 hab.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthly.map((p) => (
                      <tr key={`${p.period.year}/${p.period.month}`}>
                        <th scope="row">
                          {months[p.period.month - 1]} {p.period.year}
                        </th>
                        <td>{number(p.reports)}</td>
                        <td>{number(p.ratePer100k, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h3>
                Comparación territorial · {months[data.month - 1]} {data.year}
              </h3>
              <label>
                Ordenar territorios
                <select
                  name="population-ranking-metric"
                  value={metric}
                  onChange={(event) =>
                    setMetric(event.target.value as "rate" | "count")
                  }
                >
                  <option value="rate">Tasa por 100.000 habitantes</option>
                  <option value="count">Cantidad de denuncias</option>
                </select>
              </label>
              {!ranking.length ? (
                <p>No hay datos disponibles para el período seleccionado.</p>
              ) : (
                <div className="population-table">
                  <table>
                    <caption>
                      Hasta 15{" "}
                      {data.level === "department"
                        ? "departamentos"
                        : data.level === "province"
                          ? "provincias"
                          : "distritos"}
                      . Se muestran únicamente territorios con registros en el
                      mes.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Territorio</th>
                        <th scope="col">Población</th>
                        <th scope="col">Denuncias</th>
                        <th scope="col">Por 100.000 hab.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.map((item) => (
                        <tr key={item.ubigeo}>
                          <th scope="row">
                            {item.name}
                            <span
                              className="population-bar"
                              aria-hidden="true"
                              style={{
                                width: `${(100 * (metric === "rate" ? (item.ratePer100k ?? 0) : item.reports)) / maximum}%`,
                              }}
                            />
                          </th>
                          <td>{number(item.population)}</td>
                          <td>{number(item.reports)}</td>
                          <td>{number(item.ratePer100k, true)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          <p>
            La tasa divide las denuncias del mes entre la población del mismo
            año y multiplica por 100.000. No se anualiza. No mide el riesgo
            individual ni la distribución de residentes por calle; las zonas
            pequeñas pueden presentar tasas inestables.
          </p>
          <details>
            <summary>Fuente y metodología del denominador</summary>
            <p>
              <a href={data.source.sourceUrl} target="_blank" rel="noreferrer">
                INEI · Proyecciones 2018–2026
              </a>
              . Versión SHA-256:{" "}
              <code className="population-hash">{data.source.sha256}</code>.
              Importada:{" "}
              {new Intl.DateTimeFormat("es-PE", {
                dateStyle: "medium",
                timeZone: "America/Lima",
              }).format(new Date(data.source.importedAt))}
              . La ausencia de registros no se convierte en cero. Las filas
              geográficas de delitos se mantienen separadas.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
