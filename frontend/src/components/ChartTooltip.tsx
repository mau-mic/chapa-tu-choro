import { formatCount } from "../lib/trendCharts";

type Props = {
  id: string;
  x: number;
  y: number;
  label: string;
  name: string;
  color: string;
  reports: number;
  detail?: string;
  unit?: string;
};

export function ChartTooltip({
  id,
  x,
  y,
  label,
  name,
  color,
  reports,
  detail,
  unit = "denuncias registradas",
}: Props) {
  return (
    <div
      id={id}
      role="tooltip"
      className={`chart-tooltip ${y < 75 ? "below-point" : ""}`}
      style={{ left: `clamp(115px, ${x}px, calc(100% - 115px))`, top: y }}
    >
      <span>{label}</span>
      <div>
        <i style={{ background: color }} aria-hidden="true" />
        {name}
      </div>
      <strong>
        {formatCount(reports)} <small>{unit}</small>
      </strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
