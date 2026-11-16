import { useId, useRef, useState } from "react";
import type { MonthlyTrend, Trends } from "../lib/api";
import {
  categoryColor,
  formatCount as number,
  formatPeriod as period,
  totalColor,
} from "../lib/trendCharts";
import { ModeSwitch } from "./ui/mode-switch";
import { Button } from "./ui/button";
import { ChartTooltip } from "./ChartTooltip";

type Series = {
  name: string;
  color: string;
  points: MonthlyTrend[];
  dash?: string;
};
type Hover = {
  name: string;
  color: string;
  point: MonthlyTrend;
  x: number;
  y: number;
};
export function MonthlyLine({
  series,
  unit,
  precision = 0,
}: {
  series: Series[];
  unit?: string;
  precision?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const tooltipId = useId();
  const width = 800,
    height = 270,
    left = 95,
    right = 45,
    top = 30,
    bottom = 45;
  const points = series[0]?.points ?? [];
  const max = Math.max(
    1,
    ...series.flatMap((s) => s.points.map((p) => p.reports ?? 0)),
  );
  const x = (i: number) =>
    points.length === 1
      ? width / 2
      : left + (i / (points.length - 1)) * (width - left - right);
  const y = (count: number) =>
    height - bottom - (count / max) * (height - top - bottom);
  const labelCount = Math.min(5, points.length);
  const labels = new Set(
    Array.from({ length: labelCount }, (_, i) =>
      Math.round((i * (points.length - 1)) / Math.max(1, labelCount - 1)),
    ),
  );
  const show = (
    element: SVGCircleElement,
    line: Series,
    point: MonthlyTrend,
  ) => {
    const bounds = box.current!.getBoundingClientRect(),
      target = element.getBoundingClientRect();
    setHover({
      name: line.name,
      color: line.color,
      point,
      x: target.x + target.width / 2 - bounds.x,
      y: target.y - bounds.y,
    });
  };
  if (
    !series.some((line) => line.points.some((point) => point.reports !== null))
  )
    return (
      <p className="empty-state">
        No hay datos disponibles para el período seleccionado.
      </p>
    );
  return (
    <div className="monthly-line-wrap" ref={box}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={
          unit
            ? `Gráfico de líneas de ${unit} por mes`
            : "Gráfico de líneas de denuncias por mes"
        }
        className="line-chart"
      >
        {[0, 0.5, 1].map((ratio) => (
          <g key={ratio}>
            <line
              x1={left}
              x2={width - right}
              y1={y(max * ratio)}
              y2={y(max * ratio)}
              stroke="#dbe6e5"
              strokeDasharray="4 4"
            />
            <text x={left - 10} y={y(max * ratio) + 4} textAnchor="end">
              {number(
                Math.round(max * ratio * 10 ** precision) / 10 ** precision,
              )}
            </text>
          </g>
        ))}
        {series.map((line, lineIndex) => {
          const path = line.points
            .map((point, i) =>
              point.reports === null
                ? ""
                : `${i === 0 || line.points[i - 1].reports === null ? "M" : "L"}${x(i)},${y(point.reports)}`,
            )
            .join(" ");
          const first = line.points.findIndex((p) => p.reports !== null);
          return (
            <g key={line.name} data-series={line.name}>
              <path
                d={path}
                fill="none"
                stroke={line.color}
                strokeDasharray={line.dash}
                strokeWidth="2.5"
              />
              {line.points.map(
                (point, i) =>
                  point.reports !== null && (
                    <circle
                      key={i}
                      className="line-point"
                      cx={x(i)}
                      cy={y(point.reports)}
                      r="4"
                      fill={line.color}
                      pointerEvents="visibleFill"
                      tabIndex={i === first ? 0 : -1}
                      aria-label={`${line.name} · ${period(point.period)}: ${number(point.reports)} ${unit ?? "denuncias"}`}
                      aria-describedby={
                        hover?.name === line.name && hover.point === point
                          ? tooltipId
                          : undefined
                      }
                      onPointerEnter={(e) => show(e.currentTarget, line, point)}
                      onPointerLeave={(e) => {
                        if (document.activeElement !== e.currentTarget)
                          setHover(null);
                      }}
                      onFocus={(e) => show(e.currentTarget, line, point)}
                      onBlur={() => setHover(null)}
                      onClick={(e) => show(e.currentTarget, line, point)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setHover(null);
                        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft")
                          return;
                        e.preventDefault();
                        const nodes =
                          e.currentTarget.parentElement!.querySelectorAll<SVGCircleElement>(
                            "circle",
                          );
                        const index = [...nodes].indexOf(e.currentTarget);
                        nodes[
                          (index +
                            (e.key === "ArrowRight" ? 1 : -1) +
                            nodes.length) %
                            nodes.length
                        ]?.focus();
                      }}
                      data-line-index={lineIndex}
                    />
                  ),
              )}
            </g>
          );
        })}
        {points.map(
          (point, i) =>
            labels.has(i) && (
              <text key={i} x={x(i)} y={height - 8} textAnchor="middle">
                {period(point.period)}
              </text>
            ),
        )}
      </svg>
      {hover && (
        <ChartTooltip
          unit={unit}
          id={tooltipId}
          x={hover.x}
          y={hover.y}
          label={period(hover.point.period)}
          name={hover.name}
          color={hover.color}
          reports={hover.point.reports!}
        />
      )}
    </div>
  );
}

export function MonthlyEvolution({
  data,
  categoryOrder,
  unit,
}: {
  data: Trends;
  categoryOrder: string[];
  unit?: string;
}) {
  const [mode, setMode] = useState<"total" | "category">("total");
  const [selected, setSelected] = useState<string[] | null>(null);
  const available = data.categorySeries;
  const visible = available.filter(
    (line) => selected === null || selected.includes(line.category),
  );
  const lines: Series[] =
    mode === "total"
      ? [
          {
            name: unit ? "Total de registros" : "Total de denuncias",
            color: totalColor,
            points: data.monthly,
          },
        ]
      : visible.map((line) => ({
          name: line.category,
          color: categoryColor(line.category, categoryOrder),
          points: line.monthly,
        }));
  return (
    <>
      <div className="line-controls">
        <ModeSwitch
          label="Series del gráfico de líneas"
          value={mode}
          onValueChange={setMode}
          options={[
            { value: "total", label: "Total" },
            { value: "category", label: "Por modalidad" },
          ]}
        />
        <span className="chart-note">
          Pasa el cursor o toca un punto. Con teclado: enfoca una serie y usa ←
          →.
        </span>
      </div>
      {mode === "category" && (
        <fieldset className="line-category-filters">
          <legend className="sr-only">
            Modalidades en la evolución mensual
          </legend>
          {available.map((line) => (
            <label key={line.category}>
              <input
                type="checkbox"
                checked={visible.includes(line)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...visible.map((v) => v.category), line.category]
                      : visible
                          .filter((v) => v !== line)
                          .map((v) => v.category),
                  )
                }
              />
              <i
                style={{
                  background: categoryColor(line.category, categoryOrder),
                }}
                aria-hidden="true"
              />
              {line.category}
            </label>
          ))}
          {!!available.length && (
            <>
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Todas
              </Button>
              <Button variant="ghost" onClick={() => setSelected([])}>
                Ninguna
              </Button>
            </>
          )}
        </fieldset>
      )}
      {lines.length ? (
        <MonthlyLine
          unit={unit}
          key={lines.map((line) => line.name).join("/")}
          series={lines}
        />
      ) : (
        <p className="empty-state">
          Selecciona al menos una modalidad con registros para dibujar su
          evolución.
        </p>
      )}
      {mode === "category" && visible.length > 0 && (
        <details className="chart-data">
          <summary>Ver datos mensuales por modalidad</summary>
          <div className="chart-table-scroll">
            <table>
              <caption className="sr-only">Evolución por modalidad</caption>
              <thead>
                <tr>
                  <th scope="col">Mes</th>
                  {visible.map((line) => (
                    <th scope="col" key={line.category}>
                      {line.category}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.monthly.map((point, i) => (
                  <tr key={i}>
                    <th scope="row">{period(point.period)}</th>
                    {visible.map((line) => (
                      <td key={line.category}>
                        {line.monthly[i].reports === null
                          ? "No hay datos disponibles"
                          : number(line.monthly[i].reports!)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </>
  );
}
