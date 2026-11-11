import type { Period } from "./api";
export const formatCount = (value: number) => value.toLocaleString("es-PE");
export const formatPeriod = (value: Period) =>
  new Intl.DateTimeFormat("es-PE", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(value.year, value.month - 1, 1)));
const palette = [
  "#257b71",
  "#c48436",
  "#6386a5",
  "#8f6ba3",
  "#389eb0",
  "#aa5963",
  "#5d8b40",
  "#b18778",
  "#466174",
  "#8a852d",
];
export function categoryColor(category: string, order: string[]): string {
  const index = [...new Set(order)].sort().indexOf(category);
  if (index >= 0 && index < palette.length) return palette[index];
  const hash = [...category].reduce(
    (value, char) => (value * 31 + char.charCodeAt(0)) >>> 0,
    0,
  );
  return `hsl(${hash % 360} 40% 42%)`;
}
export const totalColor = "#257b71";
