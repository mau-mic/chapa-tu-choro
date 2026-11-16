import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { ApiRequestError } from "../lib/apiError";
import { usePopulationInsights } from "./usePopulationInsights";
import { populationInsightsFixture as fixture } from "../test/fixtures/insights";
vi.mock("../lib/api", () => ({ api: { populationInsights: vi.fn() } }));
afterEach(() => vi.resetAllMocks());
it("requests only the active source, forwards all filters and discards stale territories", async () => {
  let finish!: (value: typeof fixture) => void;
  vi.mocked(api.populationInsights)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(fixture);
  const h = renderHook(
    ({ enabled, department }) =>
      usePopulationInsights(
        enabled,
        fixture.from,
        fixture.to,
        "A & B",
        department,
        "",
        "",
      ),
    { initialProps: { enabled: false, department: "15" } },
  );
  expect(api.populationInsights).not.toHaveBeenCalled();
  h.rerender({ enabled: true, department: "15" });
  await waitFor(() => expect(api.populationInsights).toHaveBeenCalledOnce());
  const signal = vi.mocked(api.populationInsights).mock.calls[0][6]!;
  h.rerender({ enabled: true, department: "07" });
  await waitFor(() => expect(h.result.current.data).toEqual(fixture));
  expect(signal.aborted).toBe(true);
  await act(async () => finish({ ...fixture, scopeCode: "stale" }));
  expect(h.result.current.data?.scopeCode).toBe("150000");
  expect(api.populationInsights).toHaveBeenLastCalledWith(
    fixture.from,
    fixture.to,
    "A & B",
    "07",
    "",
    "",
    expect.any(AbortSignal),
  );
  h.rerender({ enabled: false, department: "07" });
  expect(h.result.current.data).toBeNull();
});
it("distinguishes unavailable population from a retryable failure", async () => {
  vi.mocked(api.populationInsights)
    .mockRejectedValueOnce(
      new ApiRequestError("No data", 404, "population.unavailable"),
    )
    .mockRejectedValueOnce(new Error("HTTP 503"))
    .mockResolvedValue(fixture);
  const h = renderHook(() =>
    usePopulationInsights(true, fixture.from, fixture.to, "", "15", "", ""),
  );
  await waitFor(() => expect(h.result.current.loading).toBe(false));
  expect(h.result.current.error).toBeNull();
  expect(h.result.current.data).toBeNull();
  act(() => h.result.current.retry());
  await waitFor(() => expect(h.result.current.error).toBe("HTTP 503"));
  act(() => h.result.current.retry());
  await waitFor(() => expect(h.result.current.data).toEqual(fixture));
});

it("times out an aborted fetch and allows an explicit retry", async () => {
  vi.useFakeTimers();
  let unmount: (() => void) | undefined;
  try {
    vi.mocked(api.populationInsights).mockImplementation(
      (_from, _to, _category, _department, _province, _district, signal) =>
        new Promise((_resolve, reject) =>
          signal!.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          ),
        ),
    );
    const h = renderHook(() =>
      usePopulationInsights(true, fixture.from, fixture.to, "", "15", "", ""),
    );
    unmount = h.unmount;
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(h.result.current.loading).toBe(false);
    expect(h.result.current.error).toContain("tardó demasiado");
    expect(vi.mocked(api.populationInsights).mock.calls[0][6]!.aborted).toBe(
      true,
    );
  } finally {
    unmount?.();
    vi.useRealTimers();
  }
});
