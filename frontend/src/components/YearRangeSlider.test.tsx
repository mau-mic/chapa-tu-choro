import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { YearRangeSlider } from "./YearRangeSlider";
import { clampYears, yearBounds, yearPeriods } from "../lib/trendYears";
import { categoryColor } from "../lib/trendCharts";

describe("available year range", () => {
  it("exposes two accessible thumbs and commits a changed year", () => {
    const commit = vi.fn();
    render(
      <YearRangeSlider
        value={[2018, 2026]}
        bounds={[2018, 2026]}
        onCommit={commit}
      />,
    );
    fireEvent.change(screen.getByRole("slider", { name: "Año inicial" }), {
      target: { value: "2020" },
    });
    expect(commit).toHaveBeenLastCalledWith([2020, 2026]);
    expect(screen.getByRole("slider", { name: "Año final" })).toHaveValue(
      "2026",
    );
  });
  it("preserves selected calendar years and missing boundary months and supports a single imported year", () => {
    const periods = [
      { year: 2018, month: 4 },
      { year: 2026, month: 9 },
    ];
    expect(yearBounds(periods)).toEqual([2018, 2026]);
    expect(yearPeriods([2018, 2026], periods)).toEqual({
      from: { year: 2018, month: 1 },
      to: { year: 2026, month: 12 },
    });
    expect(yearPeriods([2020, 2020], periods)).toEqual({
      from: { year: 2020, month: 1 },
      to: { year: 2020, month: 12 },
    });
    render(
      <YearRangeSlider
        value={[2026, 2026]}
        bounds={[2026, 2026]}
        onCommit={vi.fn()}
      />,
    );
    expect(screen.getByText("Único año disponible")).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(yearBounds([])).toBeNull();
  });
  it("enforces ten inclusive calendar years without excluding available bounds", () => {
    expect(clampYears([2000, 2026], [2000, 2026], 0)).toEqual([2000, 2009]);
    expect(clampYears([2000, 2026], [2000, 2026], 1)).toEqual([2017, 2026]);
  });
  it("keeps category colors stable when ranking order changes", () => {
    expect(categoryColor("Robo", ["Robo", "Hurto"])).toBe(
      categoryColor("Robo", ["Hurto", "Robo"]),
    );
    expect(categoryColor("Robo", ["Robo", "Hurto"])).not.toBe(
      categoryColor("Hurto", ["Hurto", "Robo"]),
    );
  });
});
