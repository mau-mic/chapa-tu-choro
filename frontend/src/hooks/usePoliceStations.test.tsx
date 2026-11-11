import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadPoliceStations,
  type StationSnapshot,
} from "../lib/policeStations";
import { usePoliceStations } from "./usePoliceStations";
vi.mock("../lib/policeStations", async () => ({
  ...(await vi.importActual("../lib/policeStations")),
  loadPoliceStations: vi.fn(),
}));
const result: StationSnapshot = {
  data: { type: "FeatureCollection", features: [] },
  fetchedAt: "2026-11-11T00:00:00Z",
};
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});
describe("optional station loading", () => {
  it("does not call government services while disabled, cancels on disable, and ignores late failures", async () => {
    let reject!: (reason: Error) => void;
    vi.mocked(loadPoliceStations)
      .mockImplementationOnce(
        () =>
          new Promise((_, fail) => {
            reject = fail;
          }),
      )
      .mockResolvedValue(result);
    const { result: hook, rerender } = renderHook(
      ({ enabled }) => usePoliceStations(enabled, "", "", ""),
      { initialProps: { enabled: false } },
    );
    expect(loadPoliceStations).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(loadPoliceStations).toHaveBeenCalled());
    const oldSignal = vi.mocked(loadPoliceStations).mock.calls[0][0];
    rerender({ enabled: false });
    expect(oldSignal.aborted).toBe(true);
    rerender({ enabled: true });
    await waitFor(() => expect(hook.current.data).not.toBeNull());
    await act(async () => reject(new Error("old failure")));
    expect(hook.current.error).toBeNull();
  });
  it("makes failures and empty layers understandable and supports retry", async () => {
    vi.mocked(loadPoliceStations)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(result);
    const { result: hook } = renderHook(() =>
      usePoliceStations(true, "", "", ""),
    );
    await waitFor(() =>
      expect(hook.current.error).toContain("SIDPOL sigue disponible"),
    );
    act(() => hook.current.retry());
    await waitFor(() => expect(hook.current.data?.features).toHaveLength(0));
    expect(hook.current.error).toBeNull();
  });
  it("aborts a slow service with a retryable timeout", async () => {
    vi.useFakeTimers();
    vi.mocked(loadPoliceStations).mockImplementationOnce(
      (signal) =>
        new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
    );
    const { result: hook } = renderHook(() =>
      usePoliceStations(true, "", "", ""),
    );
    await act(async () => vi.advanceTimersByTimeAsync(20_001));
    expect(hook.current.error).toContain("tardó demasiado");
    expect(hook.current.loading).toBe(false);
  });
});
