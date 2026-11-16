import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
afterEach(() => vi.unstubAllGlobals());
describe("trends HTTP contract", () => {
  it("encodes all geographic/category/range filters and passes cancellation", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    await api.trends(
      { year: 2023, month: 10 },
      { year: 2024, month: 9 },
      "A & B",
      "04",
      "0401",
      "040101",
      controller.signal,
    );
    const [url, options] = fetch.mock.calls[0];
    const query = new URL(url, "https://example.test").searchParams;
    expect(Object.fromEntries(query)).toEqual({
      fromYear: "2023",
      fromMonth: "10",
      toYear: "2024",
      toMonth: "9",
      category: "A & B",
      department: "04",
      province: "0401",
      district: "040101",
    });
    expect(options.signal).toBe(controller.signal);
  });
  it("makes rate limiting actionable without automatic retry storms", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("{}", { status: 429, headers: { "Retry-After": "17" } }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(api.categories()).rejects.toMatchObject({
      name: "RateLimitError",
      message: expect.stringContaining("17 segundos"),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
