import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { concentrationApi, type ConcentrationData } from "../lib/api";
import { useConcentration } from "./useConcentration";
vi.mock("../lib/api", () => ({
  concentrationApi: { metadata: vi.fn(), query: vi.fn() },
}));
const option = {
  year: 2026,
  month: 10,
  category: "all",
  label: "Todos",
  source: "https://example.test/official",
  importedAt: "2026-11-12T00:00:00Z",
};
const fixture: ConcentrationData = {
  selection: option,
  sourceRecords: 6,
  mappedRecords: 5,
  visibleRecords: 5,
  cells: [],
  ranking: [],
  monthly: [],
  gridMetres: 1000,
  minimumCellRecords: 5,
  countingUnit: "source-classification-rows",
  comparisonNote: "Contexto independiente",
};
afterEach(() => vi.resetAllMocks());
it("makes no concentration requests until enabled and cancels obsolete geographic requests", async () => {
  vi.mocked(concentrationApi.metadata).mockResolvedValue({
    setupRequired: false,
    available: [option],
  });
  let oldResolve!: (v: ConcentrationData) => void;
  vi.mocked(concentrationApi.query)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          oldResolve = resolve;
        }),
    )
    .mockResolvedValue(fixture);
  const hook = renderHook(
    ({ enabled, department }) => useConcentration(enabled, department, "", ""),
    { initialProps: { enabled: false, department: "" } },
  );
  expect(concentrationApi.metadata).not.toHaveBeenCalled();
  hook.rerender({ enabled: true, department: "" });
  await waitFor(() => expect(concentrationApi.query).toHaveBeenCalledTimes(1));
  const signal = vi.mocked(concentrationApi.query).mock.calls[0][6];
  hook.rerender({ enabled: true, department: "15" });
  await waitFor(() => expect(hook.result.current.data).toEqual(fixture));
  expect(signal?.aborted).toBe(true);
  await act(async () => oldResolve({ ...fixture, mappedRecords: 999 }));
  expect(hook.result.current.data?.mappedRecords).toBe(5);
  hook.rerender({ enabled: false, department: "15" });
  expect(hook.result.current.data).toBeNull();
});
it("does not replace an unavailable historical selection with another source or year", async () => {
  vi.mocked(concentrationApi.metadata).mockResolvedValue({
    setupRequired: false,
    available: [{ ...option, year: 2025, category: "robbery" }],
  });
  vi.mocked(concentrationApi.query).mockRejectedValue(
    new Error("No snapshot for this period"),
  );
  const hook = renderHook(() => useConcentration(true, "", "", ""));
  await waitFor(() =>
    expect(hook.result.current.error).toContain("No snapshot"),
  );
  expect(concentrationApi.query).toHaveBeenCalledWith(
    2025,
    10,
    "robbery",
    "",
    "",
    "",
    expect.any(AbortSignal),
  );
  expect(hook.result.current.data).toBeNull();
});
