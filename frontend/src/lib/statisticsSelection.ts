import type { Period } from "./api";
// Only this explicit subset of URL filters is supported; no source URLs or arbitrary parameters.
export function initialStatisticsSelection(search: string): {
  department: string;
  period: Period | null;
} {
  const query = new URLSearchParams(search);
  const department = query.get("department") ?? "";
  const year = query.get("year") ?? "";
  const month = query.get("month") ?? "";
  const validPeriod =
    /^20\d{2}$|^2100$/.test(year) && /^(?:[1-9]|1[0-2])$/.test(month);
  return {
    department: /^(0[1-9]|1\d|2[0-5])$/.test(department) ? department : "",
    period: validPeriod ? { year: Number(year), month: Number(month) } : null,
  };
}
