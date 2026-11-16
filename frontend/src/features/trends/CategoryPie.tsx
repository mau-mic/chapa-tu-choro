import { useId, useRef, useState } from "react";
import type { CategoryTotal } from "../../lib/api";
import { categoryColor, formatCount as number } from "../../lib/trendCharts";
import { ChartTooltip } from "../../components/ChartTooltip";
export function CategoryPie({
  categories,
  categoryOrder,
  periodLabel,
  unit,
}: {
  categories: CategoryTotal[];
  categoryOrder: string[];
  periodLabel: string;
  unit?: string;
}) {
  const slices = categories,
    total = categories.reduce((sum, item) => sum + item.reports, 0);
  const box = useRef<HTMLDivElement>(null),
    tooltipId = useId();
  const [hover, setHover] = useState<{
    slice: CategoryTotal;
    x: number;
    y: number;
  } | null>(null);
  let accumulated = 0;
  return (
    <div className="pie-layout">
      {total > 0 ? (
        <div className="pie-chart-wrap" ref={box}>
          <svg
            viewBox="0 0 220 220"
            role="img"
            aria-label="Gráfico circular de distribución por modalidad"
            className="pie-chart"
          >
            {slices.map((slice, i) => {
              if (slice.reports === 0) return null;
              const start = (accumulated / total) * Math.PI * 2 - Math.PI / 2;
              accumulated += slice.reports;
              const end = (accumulated / total) * Math.PI * 2 - Math.PI / 2;
              const label = `${slice.category}: ${number(slice.reports)} (${((slice.reports / total) * 100).toFixed(1)}%)`;
              const show = (element: SVGElement) => {
                const bounds = box.current!.getBoundingClientRect(),
                  svg = element.ownerSVGElement!.getBoundingClientRect();
                const angle = (start + end) / 2;
                setHover({
                  slice,
                  x:
                    svg.x -
                    bounds.x +
                    ((110 + 60 * Math.cos(angle)) / 220) * svg.width,
                  y:
                    svg.y -
                    bounds.y +
                    ((110 + 60 * Math.sin(angle)) / 220) * svg.height,
                });
              };
              const interactions = {
                className: "pie-slice",
                tabIndex: 0,
                "aria-label": label,
                "aria-describedby":
                  hover?.slice === slice ? tooltipId : undefined,
                onPointerEnter: (e: React.PointerEvent<SVGElement>) =>
                  show(e.currentTarget),
                onPointerLeave: (e: React.PointerEvent<SVGElement>) => {
                  if (document.activeElement !== e.currentTarget)
                    setHover(null);
                },
                onFocus: (e: React.FocusEvent<SVGElement>) =>
                  show(e.currentTarget),
                onBlur: () => setHover(null),
                onClick: (e: React.MouseEvent<SVGElement>) =>
                  show(e.currentTarget),
                onKeyDown: (e: React.KeyboardEvent<SVGElement>) => {
                  if (e.key === "Escape") setHover(null);
                },
              };
              return slice.reports === total ? (
                <circle
                  key={`${i}-${slice.category}`}
                  {...interactions}
                  cx="110"
                  cy="110"
                  r="100"
                  fill={categoryColor(slice.category, categoryOrder)}
                />
              ) : (
                <path
                  key={`${i}-${slice.category}`}
                  {...interactions}
                  d={`M110,110 L${110 + 100 * Math.cos(start)},${110 + 100 * Math.sin(start)} A100,100 0 ${end - start > Math.PI ? 1 : 0},1 ${110 + 100 * Math.cos(end)},${110 + 100 * Math.sin(end)} Z`}
                  fill={categoryColor(slice.category, categoryOrder)}
                  stroke="#fff"
                  strokeWidth="2"
                />
              );
            })}
          </svg>
          {hover && slices.includes(hover.slice) && (
            <ChartTooltip
              unit={unit}
              id={tooltipId}
              x={hover.x}
              y={hover.y}
              label={periodLabel}
              name={hover.slice.category}
              color={categoryColor(hover.slice.category, categoryOrder)}
              reports={hover.slice.reports}
              detail={`${((hover.slice.reports / total) * 100).toFixed(1)}% del total del rango`}
            />
          )}
        </div>
      ) : (
        <p className="empty-state">
          Sin cantidades positivas para representar la distribución.
        </p>
      )}
      <ul className="chart-key">
        {slices.map((slice, i) => (
          <li key={`${i}-${slice.category}`}>
            <i
              style={{
                background: categoryColor(slice.category, categoryOrder),
              }}
              aria-hidden="true"
            />
            <span>{slice.category}</span>
            <b>
              {total > 0
                ? `${((slice.reports / total) * 100).toFixed(1)}%`
                : "—"}
            </b>
          </li>
        ))}
      </ul>
    </div>
  );
}
