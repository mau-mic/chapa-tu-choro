import { HistoricalInsights } from "./HistoricalInsights";
import type { PopulationInsightsState } from "../../hooks/usePopulationInsights";
import { useEffect, useState } from "react";
import { MonthlyLine } from "../../components/MonthlyEvolution";
import { ModeSwitch } from "../../components/ui/mode-switch";
import { Button } from "../../components/ui/button";
import { categoryColor, totalColor } from "../../lib/trendCharts";
import type {
  PopulationHistoryData,
  PopulationHistoryPoint,
} from "../../lib/api";
import { PopulationComparisonContent } from "./PopulationComparison";
import { DataQuality } from "./DataQuality";
import { ViewLoading } from "./ViewLoading";

export function PopulationAnalysis({
  state,
  insights,
  compared,
  setCompared,
  onReady,
}: {
  insights?: PopulationInsightsState;
  state: {
    data: PopulationHistoryData | null;
    loading: boolean;
    error: string | null;
    retry: () => void;
  };
  compared: string[] | null;
  setCompared: (codes: string[] | null) => void;
  onReady?: (ready: boolean) => void;
}) {
  useEffect(() => {
    onReady?.(true);
  }, [onReady]);
  const [metric, setMetric] = useState<"rate" | "count">("rate");
  const [search, setSearch] = useState("");
  const data = state.data;
  if (!data)
    return state.error ? (
      <section className="population-comparison" role="alert">
        <h2>Denuncias y población</h2>
        <p>{state.error}</p>
        <p>Comprueba la importación de población y el período seleccionado.</p>
        <Button onClick={state.retry}>Reintentar comparación</Button>
      </section>
    ) : state.loading ? (
      <ViewLoading label="Cargando tasas históricas…" />
    ) : (
      <section className="population-comparison">
        <h2>Denuncias y población</h2>
        <p>No hay datos disponibles para el período seleccionado.</p>
      </section>
    );
  const selected = compared ?? data.series.map((s) => s.code);
  const choices = data.territories
    .filter(
      (t) =>
        selected.includes(t.code) ||
        `${t.name} ${t.code}`
          .toLocaleLowerCase("es-PE")
          .includes(search.toLocaleLowerCase("es-PE")),
    )
    .slice(0, 50);
  const points = (rows: PopulationHistoryPoint[]) =>
    rows.map((p) => ({
      period: p.period,
      reports: metric === "rate" ? p.ratePer100k : p.reports,
    }));
  const unit =
    metric === "rate" ? "denuncias por 100.000 habitantes" : "denuncias";
  const closing = data.monthly.at(-1)!;
  const comparison = {
    year: data.to.year,
    month: data.to.month,
    level: data.level,
    population: closing.population,
    source: data.source,
    monthly: data.monthly
      .filter((p) => p.period.year === data.to.year)
      .map((p) => ({
        month: p.period.month,
        reports: p.reports,
        ratePer100k: p.ratePer100k,
        rowsWithoutPopulation: p.missingPopulationDistricts,
      })),
    ranking: data.ranking,
  };
  return (
    <>
      <section
        className="normalized-history"
        aria-labelledby="normalized-heading"
        aria-busy={state.loading}
      >
        <h2 id="normalized-heading">Histórico y comparación territorial</h2>
        <p>
          Cada mes usa la población proyectada de su propio año. Las tasas no se
          suman ni anualizan; las medias se identifican por separado.
        </p>
        <ModeSwitch
          label="Métrica de comparación histórica"
          value={metric}
          onValueChange={setMetric}
          options={[
            { value: "rate", label: "Por 100.000 habitantes" },
            { value: "count", label: "Cantidad de denuncias" },
          ]}
        />
        {insights ? (
          <HistoricalInsights state={insights} history={data} metric={metric} />
        ) : (
          <>
            <h3>Evolución del ámbito seleccionado</h3>
            <MonthlyLine
              series={[
                {
                  name: "Ámbito seleccionado",
                  color: totalColor,
                  points: points(data.monthly),
                },
              ]}
              unit={unit}
              precision={metric === "rate" ? 2 : 0}
            />
          </>
        )}
        <fieldset className="territory-comparison">
          <legend>Comparar territorios · hasta 4</legend>
          {data.territories.length > 12 && (
            <label>
              Buscar territorios para comparar
              <input
                name="compare-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          )}
          <div className="comparison-options">
            {choices.map((t) => (
              <label key={t.code}>
                <input
                  type="checkbox"
                  checked={selected.includes(t.code)}
                  disabled={selected.length >= 4 && !selected.includes(t.code)}
                  onChange={(e) =>
                    setCompared(
                      e.target.checked
                        ? [...selected, t.code]
                        : selected.filter((c) => c !== t.code),
                    )
                  }
                />
                {t.name}
              </label>
            ))}
          </div>
          {data.territories.length > 50 && (
            <p>
              Se muestran hasta 50 opciones. Busca por nombre o UBIGEO para
              acotar.
            </p>
          )}
          <Button variant="ghost" onClick={() => setCompared(null)}>
            Restablecer comparación
          </Button>
        </fieldset>
        {state.error && (
          <div role="alert">
            <p>{state.error}</p>
            <Button onClick={state.retry}>Reintentar comparación</Button>
          </div>
        )}
        {state.error ? null : state.loading ? (
          <p role="status">Actualizando comparación…</p>
        ) : data.series.length ? (
          <>
            <MonthlyLine
              series={data.series.map((s) => ({
                name: s.name,
                color: categoryColor(s.code, []),
                points: points(s.points),
              }))}
              unit={unit}
              precision={metric === "rate" ? 2 : 0}
            />
            <ul className="comparison-key">
              {data.series.map((s) => (
                <li key={s.code}>
                  <i
                    aria-hidden="true"
                    style={{ background: categoryColor(s.code, []) }}
                  />
                  {s.name}
                </li>
              ))}
            </ul>
            <details>
              <summary>Ver valores de los territorios comparados</summary>
              <div className="population-table">
                <table>
                  <caption>
                    Valores mensuales; una tasa ausente conserva su conteo
                    original.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Período</th>
                      {data.series.map((s) => (
                        <th key={s.code} scope="col">
                          {s.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.monthly.map((p, i) => (
                      <tr key={`${p.period.year}/${p.period.month}`}>
                        <th scope="row">
                          {p.period.year}/
                          {String(p.period.month).padStart(2, "0")}
                        </th>
                        {data.series.map((s) => {
                          const value =
                            metric === "rate"
                              ? s.points[i].ratePer100k
                              : s.points[i].reports;
                          return (
                            <td key={s.code}>
                              {value === null
                                ? "No hay datos disponibles"
                                : value.toLocaleString("es-PE", {
                                    maximumFractionDigits: 2,
                                  })}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        ) : (
          <p>Selecciona territorios para comparar su evolución.</p>
        )}
        <p>
          Las tasas pueden ser inestables con poblaciones pequeñas y no
          representan riesgo individual. Los cortes indican valores no
          disponibles, no ceros.
        </p>
      </section>
      <DataQuality quality={data.quality} />
      <PopulationComparisonContent
        period={data.to}
        history={data.monthly}
        data={comparison}
        loading={false}
        error={null}
        retry={state.retry}
      />
    </>
  );
}
