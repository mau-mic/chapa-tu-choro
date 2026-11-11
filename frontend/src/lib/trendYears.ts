import type { Period } from "./api";
export type YearRange = [number, number];
export function yearBounds(periods: Period[]): YearRange | null {
  return periods.length
    ? [
        Math.min(...periods.map((p) => p.year)),
        Math.max(...periods.map((p) => p.year)),
      ]
    : null;
}
export function clampYears(
  value: YearRange,
  bounds: YearRange,
  activeThumb = 0,
): YearRange {
  let start = Math.max(bounds[0], Math.min(bounds[1], Math.round(value[0])));
  let end = Math.max(start, Math.min(bounds[1], Math.round(value[1])));
  // Preserve the existing API bound of 120 inclusive months.
  if (end - start > 9) {
    if (activeThumb === 0) end = start + 9;
    else start = end - 9;
  }
  return [start, end];
}
export function yearPeriods(
  years: YearRange,
  _periods: Period[],
): { from: Period; to: Period } {
  return {
    from: { year: years[0], month: 1 },
    to: { year: years[1], month: 12 },
  };
}

/** One monthly endpoint for both historical charts and population comparisons. */
export function sharedTrendPeriod(
  years: YearRange,
  periods: Period[],
  requestedMonth: number | null,
): Period | null {
  if (!periods.length) return null;
  if (years[0] > years[1]) return null;
  if (requestedMonth !== null && requestedMonth >= 1 && requestedMonth <= 12)
    return { year: years[1], month: requestedMonth };
  const available = periods.filter((p) => p.year === years[1]);
  return {
    year: years[1],
    month: available.length ? Math.max(...available.map((p) => p.month)) : 12,
  };
}
