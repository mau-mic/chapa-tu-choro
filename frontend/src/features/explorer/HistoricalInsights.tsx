import { useState } from "react";
import { MonthlyLine } from "../../components/MonthlyEvolution";
import { Button } from "../../components/ui/button";
import type { PopulationHistoryData, PopulationAverage } from "../../lib/api";
import type { PopulationInsightsState } from "../../hooks/usePopulationInsights";
import { formatPeriod, totalColor } from "../../lib/trendCharts";

const referenceColor = "#6386a5",
  baselineColor = "#c48436";
const number = (n: number | null) =>
  n === null
    ? "No hay datos disponibles"
    : n.toLocaleString("es-PE", { maximumFractionDigits: 2 });
const percent = (n: number | null) =>
  n === null ? "No calculable" : `${n > 0 ? "+" : ""}${number(n)}%`;
const averageValue = (value: PopulationAverage, metric: "rate" | "count") =>
  metric === "rate" ? value.ratePer100k : value.reports;

export function HistoricalInsights({
  state,
  history,
  metric,
}: {
  state: PopulationInsightsState;
  history: PopulationHistoryData;
  metric: "rate" | "count";
}) {
  const [smoothing, setSmoothing] = useState<"none" | "3" | "12">("3");
  const [baseline, setBaseline] = useState<"none" | "seasonal" | "historical">(
    "seasonal",
  );
  const unit =
    metric === "rate" ? "denuncias por 100.000 habitantes" : "denuncias";
  const actual = {
    name: "Ámbito seleccionado",
    color: totalColor,
    points: history.monthly.map((p) => ({
      period: p.period,
      reports: metric === "rate" ? p.ratePer100k : p.reports,
    })),
  };
  const data = state.data;
  const mismatch =
    data &&
    (data.source.sha256 !== history.source.sha256 ||
      data.monthly.length !== history.monthly.length ||
      data.monthly.some((point, i) => {
        const original = history.monthly[i];
        return (
          point.period.year !== original.period.year ||
          point.period.month !== original.period.month ||
          point.scope.reports !== original.reports ||
          point.scope.population !== original.population ||
          point.scope.ratePer100k !== original.ratePer100k
        );
      }));
  if (state.loading || state.error || !data || mismatch)
    return (
      <section className="historical-insights">
        <h3>Evolución del ámbito seleccionado</h3>
        <MonthlyLine
          series={[actual]}
          unit={unit}
          precision={metric === "rate" ? 2 : 0}
        />
        {state.loading ? (
          <p role="status">Cargando medias móviles y referencias…</p>
        ) : state.error || mismatch ? (
          <div role="alert">
            <p>
              {mismatch
                ? "Los datos cambiaron entre consultas. Actualiza el análisis para usar la misma referencia."
                : state.error}
            </p>
            <Button onClick={state.retry}>Reintentar análisis</Button>
          </div>
        ) : (
          <p>
            No hay datos disponibles para el análisis del período seleccionado.
          </p>
        )}
      </section>
    );
  const value = (row: (typeof data.monthly)[number]) =>
    metric === "rate" ? row.scope.ratePer100k : row.scope.reports;
  const rolling = (row: (typeof data.monthly)[number]) =>
    smoothing === "12" ? row.scope.rolling12 : row.scope.rolling3;
  const reference = (row: (typeof data.monthly)[number]) =>
    baseline === "historical"
      ? row.scope.historicalBaseline
      : row.scope.seasonalBaseline;
  const referenceName =
    baseline === "historical"
      ? "Media de los 36 meses anteriores"
      : "Mismo mes de los 3 años anteriores";
  const series = [
    {
      name: "Ámbito seleccionado",
      color: totalColor,
      points: data.monthly.map((p) => ({
        period: p.period,
        reports: value(p),
      })),
    },
    ...(smoothing === "none"
      ? []
      : [
          {
            name: `Media móvil de ${smoothing} meses`,
            color: referenceColor,
            dash: "6 3",
            points: data.monthly.map((p) => ({
              period: p.period,
              reports: averageValue(rolling(p), metric),
            })),
          },
        ]),
    ...(baseline === "none"
      ? []
      : [
          {
            name: referenceName,
            color: baselineColor,
            dash: "2 4",
            points: data.monthly.map((p) => ({
              period: p.period,
              reports: averageValue(reference(p), metric),
            })),
          },
        ]),
  ];
  const last = data.monthly.at(-1)!;
  return (
    <section className="historical-insights">
      <h3>Evolución y referencias históricas</h3>
      <div className="insight-controls">
        <label>
          Media móvil
          <select
            name="moving-average"
            value={smoothing}
            onChange={(e) => setSmoothing(e.target.value as typeof smoothing)}
          >
            <option value="none">Sin suavizado</option>
            <option value="3">3 meses</option>
            <option value="12">12 meses</option>
          </select>
        </label>
        <label>
          Referencia histórica
          <select
            name="historical-reference"
            value={baseline}
            onChange={(e) => setBaseline(e.target.value as typeof baseline)}
          >
            <option value="none">Sin referencia</option>
            <option value="seasonal">Mismo mes · 3 años previos</option>
            <option value="historical">36 meses anteriores</option>
          </select>
        </label>
      </div>
      <MonthlyLine series={series} unit={unit} precision={2} />
      <ul className="comparison-key">
        {series.map((s) => (
          <li key={s.name}>
            <i aria-hidden="true" style={{ background: s.color }} />
            {s.name}
          </li>
        ))}
      </ul>
      <p>
        Las medias móviles incluyen el mes observado. Las referencias usan
        únicamente meses anteriores, incluso si quedan fuera del rango visible.
        Se requieren todas las observaciones de cada ventana; no se rellenan los
        meses ausentes.
      </p>
      <p>
        Referencias del mes final · {formatPeriod(data.to)} · {unit}
      </p>
      <dl className="quality-grid" aria-label="Referencias del mes final">
        {[
          {
            name: "Media histórica · 36 meses anteriores",
            average: last.scope.historicalBaseline,
            change: last.scope.historicalChange,
          },
          {
            name: "Comparación estacional · mismo mes, 3 años previos",
            average: last.scope.seasonalBaseline,
            change: last.scope.seasonalChange,
          },
        ].map((item) => (
          <div key={item.name}>
            <dt>{item.name}</dt>
            <dd>{number(averageValue(item.average, metric))}</dd>
            <small>
              {metric === "rate"
                ? item.average.rateObservations
                : item.average.reportObservations}
              /{item.average.requiredObservations} observaciones · variación:{" "}
              {percent(
                metric === "rate"
                  ? item.change.ratePercent
                  : item.change.reportsPercent,
              )}
            </small>
          </div>
        ))}
      </dl>
      <details>
        <summary>Ver medias y referencias mensuales</summary>
        <div
          className="population-table population-monthly-table"
          role="region"
          aria-label="Medias y referencias mensuales"
          tabIndex={0}
        >
          <table>
            <caption>{unit}; los valores ausentes no son cero.</caption>
            <thead>
              <tr>
                <th scope="col">Mes</th>
                <th scope="col">Observado</th>
                <th scope="col">Media móvil · 3 meses</th>
                <th scope="col">Media móvil · 12 meses</th>
                <th scope="col">Media histórica · 36 meses</th>
                <th scope="col">Referencia estacional</th>
              </tr>
            </thead>
            <tbody>
              {data.monthly.map((p) => (
                <tr key={`${p.period.year}/${p.period.month}`}>
                  <th scope="row">{formatPeriod(p.period)}</th>
                  <td>{number(value(p))}</td>
                  <td>{number(averageValue(p.scope.rolling3, metric))}</td>
                  <td>{number(averageValue(p.scope.rolling12, metric))}</td>
                  <td>
                    {number(averageValue(p.scope.historicalBaseline, metric))}
                  </td>
                  <td>
                    {number(averageValue(p.scope.seasonalBaseline, metric))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <h3>Territorio frente a Perú</h3>
      {data.scopeCode === "000000" ? (
        <p>
          Selecciona un departamento, provincia o distrito para compararlo con
          Perú.
        </p>
      ) : (
        <>
          <p>
            Tasas mensuales por 100.000 habitantes · {formatPeriod(data.to)}.
            Perú incluye el territorio seleccionado.
          </p>
          <dl className="quality-grid" aria-label="Comparación con Perú">
            <div>
              <dt>Territorio seleccionado</dt>
              <dd>{number(last.scope.ratePer100k)}</dd>
            </div>
            <div>
              <dt>Perú</dt>
              <dd>{number(last.national.ratePer100k)}</dd>
            </div>
            <div>
              <dt>Diferencia por 100.000 habitantes</dt>
              <dd>{number(last.nationalDifferencePer100k)}</dd>
            </div>
            <div>
              <dt>Variación frente a Perú</dt>
              <dd>{percent(last.nationalDifferencePercent)}</dd>
            </div>
          </dl>
          <MonthlyLine
            series={[
              {
                name: "Territorio seleccionado",
                color: totalColor,
                points: data.monthly.map((p) => ({
                  period: p.period,
                  reports: p.scope.ratePer100k,
                })),
              },
              {
                name: "Perú",
                color: referenceColor,
                dash: "6 3",
                points: data.monthly.map((p) => ({
                  period: p.period,
                  reports: p.national.ratePer100k,
                })),
              },
            ]}
            unit="tasas territoriales y nacionales por 100.000 habitantes"
            precision={2}
          />
          <ul className="comparison-key">
            <li>
              <i aria-hidden="true" style={{ background: totalColor }} />
              Territorio seleccionado
            </li>
            <li>
              <i aria-hidden="true" style={{ background: referenceColor }} />
              Perú
            </li>
          </ul>
          <p>
            La tasa nacional divide las denuncias nacionales entre la población
            nacional del mismo año; no promedia tasas distritales. Se conservan
            la categoría y los meses seleccionados. Una referencia cero no
            permite calcular una variación porcentual.
          </p>
          <details>
            <summary>Ver comparación mensual con Perú</summary>
            <div
              className="population-table population-monthly-table"
              role="region"
              aria-label="Comparación mensual con Perú"
              tabIndex={0}
            >
              <table>
                <caption>
                  Tasas mensuales por 100.000 habitantes; no representan riesgo
                  individual.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Mes</th>
                    <th scope="col">Territorio</th>
                    <th scope="col">Perú</th>
                    <th scope="col">Diferencia</th>
                    <th scope="col">Variación</th>
                  </tr>
                </thead>
                <tbody>
                  {data.monthly.map((p) => (
                    <tr key={`${p.period.year}/${p.period.month}`}>
                      <th scope="row">{formatPeriod(p.period)}</th>
                      <td>{number(p.scope.ratePer100k)}</td>
                      <td>{number(p.national.ratePer100k)}</td>
                      <td>{number(p.nationalDifferencePer100k)}</td>
                      <td>{percent(p.nationalDifferencePercent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
