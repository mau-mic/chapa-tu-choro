import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  concentrationApi,
  type ConcentrationData,
  type MapCellsData,
} from "../lib/api";
import { useConcentrationMap } from "./useConcentrationMap";
import { mapGridSize, peruBounds } from "../lib/mapViewport";
vi.mock("../lib/api", () => ({ concentrationApi: { cells: vi.fn() } }));
// Synthetic transport fixtures, never bundled as official observations.
const selection = {
  year: 2026,
  month: 10,
  category: "all",
  label: "Test",
  source: "https://example.test",
  importedAt: "2026-11-12T00:00:00Z",
};
const snapshot: ConcentrationData = {
  selection,
  spatialDetailAvailable: true,
  sourceRecords: 100,
  mappedRecords: 100,
  visibleRecords: 100,
  cells: [],
  ranking: [],
  monthly: [],
  gridMetres: 10000,
  minimumCellRecords: 5,
  countingUnit: "source-classification-rows",
  comparisonNote: "Test",
};
const nation = { west: -82, south: -19, east: -68, north: 1, zoom: 5 };
const lima = { west: -77.3, south: -12.3, east: -76.8, north: -11.7, zoom: 11 };
const reply = (
  gridMetres: number,
  coverage = peruBounds(lima, 0.25)!,
): MapCellsData => ({
  selection,
  gridMetres,
  coverage,
  minimumCellRecords: 5,
  cells: [{ id: "test", longitude: -77, latitude: -12, records: 7 }],
  visibleRecords: 7,
  suppressedCells: 2,
});
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});
it("selects detail from zoom without requiring a department and clips requests to Peru", () => {
  expect(mapGridSize(5, "auto")).toBe(10000);
  expect(mapGridSize(8, "auto")).toBe(1000);
  expect(mapGridSize(11, "auto")).toBe(500);
  expect(mapGridSize(5, "500")).toBe(500);
  expect(peruBounds({ west: 0, east: 5, south: 10, north: 20 })).toBeNull();
});
it("cancels coarse requests, debounces movement, reuses loaded coverage and preserves totals", async () => {
  vi.useFakeTimers();
  let finish!: (v: MapCellsData) => void;
  vi.mocked(concentrationApi.cells)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockImplementation(async (_s, grid, bounds) => reply(grid, bounds));
  const hook = renderHook(
    ({ view, enabled }) =>
      useConcentrationMap(enabled, snapshot, view, "", "", ""),
    { initialProps: { view: nation, enabled: false } },
  );
  await act(async () => vi.advanceTimersByTimeAsync(400));
  expect(concentrationApi.cells).not.toHaveBeenCalled();
  hook.rerender({ view: nation, enabled: true });
  await act(async () => vi.advanceTimersByTimeAsync(301));
  const signal = vi.mocked(concentrationApi.cells).mock.calls[0][6]!;
  hook.rerender({ view: lima, enabled: true });
  expect(signal.aborted).toBe(true);
  expect(hook.result.current.data).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(301));
  expect(hook.result.current.data?.gridMetres).toBe(500);
  expect(concentrationApi.cells).toHaveBeenLastCalledWith(
    selection,
    500,
    expect.any(Object),
    "",
    "",
    "",
    expect.any(AbortSignal),
  );
  await act(async () => finish(reply(10000, nation)));
  expect(hook.result.current.data?.gridMetres).toBe(500);
  hook.rerender({
    view: { ...lima, west: -77.29, east: -76.79 },
    enabled: true,
  });
  await act(async () => vi.advanceTimersByTimeAsync(400));
  expect(concentrationApi.cells).toHaveBeenCalledTimes(2);
  expect(snapshot.mappedRecords).toBe(100);
  act(() => hook.result.current.setSetting("1000"));
  expect(hook.result.current.data).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(301));
  expect(hook.result.current.data?.gridMetres).toBe(1000);
});
it("surfaces failure and retry without stale cells, and resets on source import changes", async () => {
  vi.useFakeTimers();
  vi.mocked(concentrationApi.cells)
    .mockRejectedValueOnce(new Error("HTTP 503"))
    .mockImplementation(async (_s, grid, bounds) => reply(grid, bounds));
  const hook = renderHook(
    ({ data }) => useConcentrationMap(true, data, lima, "", "", ""),
    { initialProps: { data: snapshot } },
  );
  await act(async () => vi.advanceTimersByTimeAsync(301));
  expect(hook.result.current.error).toBe("HTTP 503");
  expect(hook.result.current.data).toBeNull();
  await act(async () => hook.result.current.retry());
  expect(hook.result.current.error).toBeNull();
  expect(hook.result.current.data?.gridMetres).toBe(500);
  hook.rerender({
    data: {
      ...snapshot,
      selection: { ...selection, importedAt: "2026-11-13T00:00:00Z" },
    },
  });
  expect(hook.result.current.data).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(301));
  expect(hook.result.current.data?.gridMetres).toBe(500);
});
