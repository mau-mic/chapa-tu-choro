import type { ExpressionSpecification } from "maplibre-gl";

// Fixed count colors; heat intensity remains relative to the current selection.
export const densityStops = [
  [5, "#e8bd79"],
  [25, "#d9903d"],
  [100, "#c56330"],
  [500, "#a83d35"],
  [2500, "#692c42"],
] as const;
export const densityCountColor: ExpressionSpecification = [
  "step",
  ["get", "records"],
  densityStops[0][1],
  ...densityStops.slice(1).flatMap(([count, color]) => [count, color]),
];
export const densityFade: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  6.5,
  0,
  8.5,
  0.92,
];
// Keep the map's composite expression and the HTML legend on the same zoom curve.
// Values are visual symbol sizes in pixels, not a geographic radius.
const radiusZoomStops = [
  [6.5, 0.65],
  [9, 1],
  [12, 1.6],
  [15, 2.3],
  [18, 2.65],
] as const;
function radiusScale(zoom: number) {
  if (zoom <= radiusZoomStops[0][0]) return radiusZoomStops[0][1];
  for (let i = 1; i < radiusZoomStops.length; i++) {
    const [end, scale] = radiusZoomStops[i],
      [start, previous] = radiusZoomStops[i - 1];
    if (zoom <= end)
      return previous + ((scale - previous) * (zoom - start)) / (end - start);
  }
  return radiusZoomStops[radiusZoomStops.length - 1][1];
}
export const densityRadius = (records: number, maximum: number, zoom: number) =>
  (3 + 15 * Math.sqrt(records / Math.max(5, maximum))) * radiusScale(zoom);
export function densityRadiusExpression(
  maximum: number,
): ExpressionSpecification {
  const base: ExpressionSpecification = [
    "+",
    3,
    ["*", 15, ["sqrt", ["/", ["get", "records"], Math.max(5, maximum)]]],
  ];
  // MapLibre requires zoom to be the input of the top-level interpolate expression.
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    ...radiusZoomStops.flatMap(([zoom, scale]) => [zoom, ["*", scale, base]]),
  ] as ExpressionSpecification;
}
export const densityColor = (records: number) =>
  [...densityStops].reverse().find(([count]) => records >= count)?.[1] ??
  densityStops[0][1];
