import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useRadiusAnalysis } from "./useRadiusAnalysis";
import { concentrationApi, type RadiusAnalysisData } from "../lib/api";
vi.mock("../lib/api", () => ({ concentrationApi: { radius: vi.fn() } }));
// Synthetic contract/transport fixtures; no real incident positions.
const selection = {
  year: 2026,
  month: 10,
  category: "all",
  label: "Test",
  source: "https://example.test",
  importedAt: "2026-11-12T00:00:00Z",
};
const response: RadiusAnalysisData = {
  selection,
  longitude: -77,
  latitude: -12,
  radiusMetres: 1000,
  records: 6,
  suppressed: false,
  minimumRecords: 5,
  area: { type: "Polygon", coordinates: [] },
  countingUnit: "source-classification-rows",
  accuracyNote: "Test accuracy",
};
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});
it("queries only an explicitly selected point and invalidates stale scope/response data", async () => {
  let finish!: (value: RadiusAnalysisData) => void;
  vi.mocked(concentrationApi.radius)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(response);
  const { result, rerender } = renderHook(
    ({ department }) =>
      useRadiusAnalysis(true, true, selection, department, "", ""),
    { initialProps: { department: "" } },
  );
  expect(concentrationApi.radius).not.toHaveBeenCalled();
  act(() => {
    result.current.setActive(true);
    result.current.pick({ longitude: -77, latitude: -12 });
  });
  expect(result.current.loading).toBe(true);
  const signal = vi.mocked(concentrationApi.radius).mock.calls[0][7]!;
  rerender({ department: "15" });
  expect(signal.aborted).toBe(true);
  expect(result.current.data).toBeNull();
  expect(concentrationApi.radius).toHaveBeenCalledTimes(1);
  await act(async () => finish(response));
  expect(result.current.data).toBeNull();
  act(() => result.current.pick({ longitude: -77, latitude: -12 }));
  await waitFor(() => expect(result.current.data?.records).toBe(6));
  expect(concentrationApi.radius).toHaveBeenLastCalledWith(
    selection,
    -77,
    -12,
    1000,
    "15",
    "",
    "",
    expect.any(AbortSignal),
  );
  act(() => result.current.clear());
  expect(result.current.data).toBeNull();
});
it("handles errors and retry while preserving an explicit zero result", async () => {
  vi.mocked(concentrationApi.radius)
    .mockRejectedValueOnce(new Error("Demasiadas solicitudes"))
    .mockResolvedValue({ ...response, records: 0 });
  const { result } = renderHook(() =>
    useRadiusAnalysis(true, true, selection, "", "", ""),
  );
  act(() => {
    result.current.setActive(true);
    result.current.pick({ longitude: -77, latitude: -12 });
  });
  await waitFor(() => expect(result.current.error).toContain("Demasiadas"));
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.data?.records).toBe(0));
  act(() => result.current.setActive(false));
  expect(result.current.data).toBeNull();
});
it("bounds requests by a timeout and rejects invalid map coordinates locally", async () => {
  vi.useFakeTimers();
  vi.mocked(concentrationApi.radius).mockImplementation(
    () => new Promise(() => {}),
  );
  const { result } = renderHook(() =>
    useRadiusAnalysis(true, true, selection, "", "", ""),
  );
  act(() => {
    result.current.setActive(true);
    result.current.pick({ longitude: 0, latitude: 0 });
  });
  expect(concentrationApi.radius).not.toHaveBeenCalled();
  expect(result.current.error).toContain("Perú");
  act(() => result.current.pick({ longitude: -77, latitude: -12 }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(25000);
  });
  expect(result.current.error).toContain("demoró demasiado");
  expect(result.current.loading).toBe(false);
});
