import { describe, expect, it } from "vitest";
import { sharedTrendPeriod } from "./trendYears";

const periods = [
  { year: 2025, month: 1 },
  { year: 2025, month: 6 },
  { year: 2026, month: 1 },
  { year: 2026, month: 9 },
];
describe("shared trend period", () => {
  it("uses the latest available month of the final year by default", () => {
    expect(sharedTrendPeriod([2025, 2026], periods, null)).toEqual({
      year: 2026,
      month: 9,
    });
  });
  it("preserves the requested month even when no observation exists", () => {
    expect(sharedTrendPeriod([2025, 2026], periods, 1)).toEqual({
      year: 2026,
      month: 1,
    });
    expect(sharedTrendPeriod([2025, 2025], periods, 9)).toEqual({
      year: 2025,
      month: 9,
    });
  });
  it("keeps the upper end of the range when that year has no observations", () => {
    expect(sharedTrendPeriod([2025, 2027], periods, null)).toEqual({
      year: 2027,
      month: 12,
    });
    expect(sharedTrendPeriod([2024, 2024], periods, null)).toEqual({
      year: 2024,
      month: 12,
    });
  });
  it("preserves internal gaps without inventing report observations", () => {
    expect(
      sharedTrendPeriod(
        [2020, 2020],
        [
          { year: 2018, month: 1 },
          { year: 2026, month: 9 },
        ],
        null,
      ),
    ).toEqual({ year: 2020, month: 12 });
  });
});
