import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { concentrationApi, type GeographicTrendsData } from "../lib/api";
import { useGeographicTrends } from "./useGeographicTrends";
vi.mock("../lib/api", () => ({
  concentrationApi: { metadata: vi.fn(), trends: vi.fn() },
}));
const option = {
  year: 2026,
  month: 10,
  category: "all",
  label: "Todos",
  source: "https://example.test",
  importedAt: "2026-11-12T00:00:00Z",
};
// Synthetic aggregate fixtures only.
const fixture: GeographicTrendsData = {
  countingUnit: "source-classification-rows",
  countScope: "valid-ubigeo-including-unmappable",
  latestPeriod: { year: 2026, month: 10 },
  imports: [option],
  data: {
    from: { year: 2026, month: 1 },
    to: { year: 2026, month: 10 },
    category: "all",
    department: null,
    province: null,
    district: null,
    comparisonLevel: "department",
    departments: [{ code: "15", name: "TEST" }],
    provinces: [],
    districts: [],
    metrics: {
      totalReports: 10,
      monthsWithData: 2,
      requestedMonths: 10,
      currentMonthReports: 4,
      previousMonthReports: null,
      previousYearMonthReports: null,
      monthlyChangePercent: null,
      yearlyChangePercent: null,
    },
    monthly: [],
    categories: [],
    territories: [],
    categorySeries: [],
  },
};
const metadata = {
  setupRequired: false,
  available: [
    option,
    { ...option, month: 1 },
    { ...option, year: 2025, category: "robbery", label: "Robo", month: 9 },
    { ...option, year: 2025, category: "robbery", label: "Robo", month: 1 },
  ],
};
afterEach(() => vi.resetAllMocks());
it("starts only when enabled, cancels stale requests, keeps source periods and forbids an invented archive total", async () => {
  vi.mocked(concentrationApi.metadata).mockResolvedValue(metadata);
  let finish!: (data: GeographicTrendsData) => void;
  vi.mocked(concentrationApi.trends)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(fixture);
  const hook = renderHook(
    ({ enabled, department }) =>
      useGeographicTrends(enabled, department, "", ""),
    { initialProps: { enabled: false, department: "" } },
  );
  expect(concentrationApi.metadata).not.toHaveBeenCalled();
  hook.rerender({ enabled: true, department: "" });
  await waitFor(() => expect(concentrationApi.trends).toHaveBeenCalledTimes(1));
  const signal = vi.mocked(concentrationApi.trends).mock.calls[0][7]!;
  hook.rerender({ enabled: true, department: "15" });
  await waitFor(() => expect(hook.result.current.data).toEqual(fixture));
  expect(signal.aborted).toBe(true);
  await act(async () => finish({ ...fixture, countingUnit: "stale" }));
  expect(hook.result.current.data?.countingUnit).toBe(
    "source-classification-rows",
  );
  act(() => hook.result.current.setYear(2025));
  await waitFor(() =>
    expect(concentrationApi.trends).toHaveBeenLastCalledWith(
      2025,
      1,
      9,
      "robbery",
      "15",
      "",
      "",
      expect.any(AbortSignal),
    ),
  );
  expect(
    hook.result.current.categoryOptions.some(([key]) => key === "all"),
  ).toBe(false);
  act(() => hook.result.current.setFromMonth(9));
  await waitFor(() =>
    expect(concentrationApi.trends).toHaveBeenLastCalledWith(
      2025,
      9,
      9,
      "robbery",
      "15",
      "",
      "",
      expect.any(AbortSignal),
    ),
  );
  hook.rerender({ enabled: false, department: "15" });
  expect(hook.result.current.data).toBeNull();
});
it("clears old data on failure and retries explicitly", async () => {
  vi.mocked(concentrationApi.metadata).mockResolvedValue(metadata);
  vi.mocked(concentrationApi.trends)
    .mockRejectedValueOnce(new Error("HTTP 503"))
    .mockResolvedValue(fixture);
  const hook = renderHook(() => useGeographicTrends(true, "", "", ""));
  await waitFor(() => expect(hook.result.current.error).toBe("HTTP 503"));
  expect(hook.result.current.data).toBeNull();
  act(() => hook.result.current.retry());
  await waitFor(() => expect(hook.result.current.data).toEqual(fixture));
  expect(hook.result.current.error).toBeNull();
});
