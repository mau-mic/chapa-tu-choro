import { useExplorer } from "./ExplorerContext";
import { format } from "../../lib/calendar";
import { DataQuality } from "./DataQuality";
export function StatisticsRanking() {
  const {
    view,
    mapMode,
    department,
    ranking,
    summary,
    loading,
    error,
    periodLabel,
    max,
    chooseArea,
    selectedCode,
    state,
  } = useExplorer();
  const rateMaximum = Math.max(
    1,
    ...ranking.map((row) => row.ratePer100k ?? 0),
  );
  return (
    view === "map" &&
    mapMode === "statistics" && (
      <>
        <div className="summary-box" aria-live="polite">
          <div className="eyebrow">DENUNCIAS REGISTRADAS</div>
          <div className="big-number">
            {loading ? (
              <span
                className="skeleton skeleton-total"
                aria-label="Cargando total"
              />
            ) : summary ? (
              format(summary.reports)
            ) : (
              "—"
            )}
          </div>
          <span>
            {summary
              ? `${summary.districtsWithData} distritos con registros · ${periodLabel}`
              : "Perú"}
          </span>
        </div>
        <div className="section-title">
          <h2>{department ? "Ranking distrital" : "Ranking departamental"}</h2>
          <span>
            {state.mapMetric === "rate"
              ? "Tasa mensual / 100.000 hab."
              : "Conteo absoluto"}
          </span>
        </div>
        <div className="ranking" aria-busy={loading}>
          {loading && (
            <div className="ranking-skeleton" aria-label="Cargando ranking">
              {[0, 1, 2, 3].map((row) => (
                <div className="skeleton skeleton-row" key={row} />
              ))}
            </div>
          )}
          {ranking.map((item, index) => (
            <button
              className="rank-row"
              key={item.code}
              onClick={() =>
                chooseArea({
                  ...item,
                  level: department ? "district" : "department",
                })
              }
              aria-pressed={selectedCode === item.code}
            >
              <span className="rank-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="rank-detail">
                <span className="rank-heading">
                  <strong>{item.name}</strong>
                  <b>
                    {state.mapMetric === "rate"
                      ? item.ratePer100k == null
                        ? "No disponible"
                        : format(item.ratePer100k)
                      : format(item.reports)}
                  </b>
                </span>
                <span className="rank-track">
                  <span
                    style={{
                      width: `${((state.mapMetric === "rate" ? (item.ratePer100k ?? 0) : item.reports) / (state.mapMetric === "rate" ? rateMaximum : max)) * 100}%`,
                    }}
                  />
                </span>
              </span>
            </button>
          ))}
          {!loading && !error && ranking.length === 0 && (
            <p className="empty-state">
              No hay registros para este filtro. La ausencia de datos no
              significa cero denuncias.
            </p>
          )}
        </div>
        {state.mapMetric === "rate" && state.quality && (
          <DataQuality quality={state.quality} />
        )}
      </>
    )
  );
}
