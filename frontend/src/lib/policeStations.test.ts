import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Synthetic transport fixtures only. No fictional stations are bundled in the application.
const feature = (id = 1) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [-77, -12] },
  properties: {
    objectid: id,
    comisaria: "TEST STATION",
    id_dpto: "15",
    id_prov: "1501",
    id_dist: "150101",
  },
});
const response = (features = [feature()], extra = {}) =>
  new Response(
    JSON.stringify({ type: "FeatureCollection", features, ...extra }),
    { status: 200 },
  );
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());
describe("official station read adapter", () => {
  it("uses a fixed public endpoint and fields, validates geography and reuses a bounded cache", async () => {
    const fetch = vi.fn().mockResolvedValue(response());
    vi.stubGlobal("fetch", fetch);
    const { loadPoliceStations, scopeStations } =
      await import("./policeStations");
    const signal = new AbortController().signal;
    const result = await loadPoliceStations(signal);
    expect(result.data.features[0].properties).toEqual({
      id: "1",
      name: "TEST STATION",
      department: "15",
      province: "1501",
      district: "150101",
    });
    expect(scopeStations(result.data, "04", "", "").features).toHaveLength(0);
    expect(
      scopeStations(result.data, "15", "1501", "150101").features,
    ).toHaveLength(1);
    expect(fetch.mock.calls[0][0]).toContain("/MapServer/2/query?");
    const params = new URL(fetch.mock.calls[0][0]).searchParams;
    expect(params.get("outFields")).toBe(
      "objectid,comisaria,id_dpto,id_prov,id_dist",
    );
    expect(params.has("year")).toBe(false);
    expect(fetch.mock.calls[0][1]).toMatchObject({
      signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    await loadPoliceStations(signal);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("reads additional pages and rejects repeated IDs instead of publishing an incomplete set", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response(Array.from({ length: 1000 }, (_, i) => feature(i))),
      )
      .mockResolvedValueOnce(response([feature(1000)]));
    vi.stubGlobal("fetch", fetch);
    const { loadPoliceStations } = await import("./policeStations");
    expect(
      (await loadPoliceStations(new AbortController().signal)).data.features,
    ).toHaveLength(1001);
    expect(
      new URL(fetch.mock.calls[1][0]).searchParams.get("resultOffset"),
    ).toBe("1000");
    vi.resetModules();
    fetch
      .mockReset()
      .mockResolvedValueOnce(
        response([feature()], { exceededTransferLimit: true }),
      )
      .mockResolvedValueOnce(response([feature()]));
    const fresh = await import("./policeStations");
    await expect(
      fresh.loadPoliceStations(new AbortController().signal),
    ).rejects.toThrow(/repitió/);
  });
  it.each([
    { error: { code: 499, message: "token required" } },
    { type: "FeatureCollection", features: [{ ...feature(), geometry: null }] },
    {
      type: "FeatureCollection",
      features: [
        {
          ...feature(),
          properties: { ...feature().properties, id_dist: "040101" },
        },
      ],
    },
    {
      type: "FeatureCollection",
      features: [
        { ...feature(), geometry: { type: "Point", coordinates: [999, -12] } },
      ],
    },
  ])(
    "fails closed on provider errors or incompatible geometry/identifiers",
    async (body) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify(body))),
      );
      const { loadPoliceStations } = await import("./policeStations");
      await expect(
        loadPoliceStations(new AbortController().signal),
      ).rejects.toThrow();
    },
  );
  it("continues short transfer-limited pages without skipping records", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response([feature()], { properties: { exceededTransferLimit: true } }),
      )
      .mockResolvedValueOnce(response([feature(2)]));
    vi.stubGlobal("fetch", fetch);
    const { loadPoliceStations } = await import("./policeStations");
    expect(
      (await loadPoliceStations(new AbortController().signal)).data.features,
    ).toHaveLength(2);
    expect(
      new URL(fetch.mock.calls[1][0]).searchParams.get("resultOffset"),
    ).toBe("1");
  });
  it("rejects persistent transfer limits instead of caching partial data", async () => {
    let id = 0;
    const fetch = vi
      .fn()
      .mockImplementation(async () =>
        response([feature(++id)], { exceededTransferLimit: true }),
      );
    vi.stubGlobal("fetch", fetch);
    const { loadPoliceStations } = await import("./policeStations");
    await expect(
      loadPoliceStations(new AbortController().signal),
    ).rejects.toThrow(/parciales/);
    expect(fetch).toHaveBeenCalledTimes(5);
    fetch.mockResolvedValueOnce(response([]));
    expect(
      (await loadPoliceStations(new AbortController().signal)).data.features,
    ).toHaveLength(0);
  });
});
