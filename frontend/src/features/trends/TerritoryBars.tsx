import type { AreaStatistic } from "../../lib/api";
import { formatCount as number } from "../../lib/trendCharts";
export function TerritoryBars({
  areas,
  unit = "denuncias",
}: {
  areas: AreaStatistic[];
  unit?: string;
}) {
  if (!areas.length)
    return (
      <p className="empty-state">
        Sin registros territoriales para esta selección.
      </p>
    );
  const max = Math.max(1, ...areas.map((item) => item.reports));
  return (
    <div
      className="territory-bars"
      role="img"
      aria-label={`Gráfico de barras de ${unit} por territorio`}
    >
      {areas.slice(0, 10).map((item) => (
        <div key={item.code}>
          <div className="bar-label">
            <span>
              {item.name} <small>{item.code}</small>
            </span>
            <strong>{number(item.reports)}</strong>
          </div>
          <div className="bar-track">
            <span style={{ width: `${(item.reports / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
