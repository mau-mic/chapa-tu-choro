import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Map } from "maplibre-gl";
import {
  createStreetBasemap,
  streetLayers,
  streetSource,
} from "./streetBasemap";

// Transport fixtures only; no fabricated geographic features or road names.
const style = () => ({
  version: 8,
  glyphs: streetSource.glyphs,
  sources: { openmaptiles: { type: "vector", url: streetSource.tiles } },
  layers: [
    { id: "background", type: "background" },
    {
      id: "highway_minor",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
    },
    {
      id: "highway-name-minor",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "transportation_name",
      layout: { "text-field": "{name}", "icon-image": "not-imported" },
    },
    {
      id: "boundary_2",
      type: "line",
      source: "openmaptiles",
      "source-layer": "boundary",
    },
  ],
});
const makeMap = () => {
  const layers = new Set<string>(),
    sources = new Set<string>();
  return {
    layers,
    sources,
    getLayer: vi.fn((id: string) => layers.has(id)),
    getSource: vi.fn((id: string) => sources.has(id)),
    addLayer: vi.fn((layer: { id: string }, _before?: string) => {
      layers.add(layer.id);
    }),
    addSource: vi.fn((id: string) => {
      sources.add(id);
    }),
    removeLayer: vi.fn((id: string) => {
      layers.delete(id);
    }),
    removeSource: vi.fn((id: string) => {
      sources.delete(id);
    }),
    setGlyphs: vi.fn(),
  };
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("keeps road names, prefers local/Spanish names and preserves INEI boundaries", () => {
  const layers = streetLayers(style());
  expect(layers.map((layer) => layer.id)).not.toContain("streets-boundary_2");
  const name = layers.find(
    (layer) => layer.id === "streets-highway-name-minor",
  )!;
  expect(name.type === "symbol" && name.layout?.["icon-image"]).toBeUndefined();
  expect(name.type === "symbol" && name.layout?.["text-field"]).toEqual(
    expect.arrayContaining([
      ["get", "name:es"],
      ["get", "name"],
    ]),
  );
  expect(name.minzoom).toBe(14);
  expect(() =>
    streetLayers({ ...style(), glyphs: "https://untrusted.test/font" }),
  ).toThrow();
  expect(() =>
    streetLayers({
      ...style(),
      sources: {
        openmaptiles: { type: "vector", url: "https://untrusted.test/tiles" },
      },
    }),
  ).toThrow();
  expect(() => streetLayers({ ...style(), layers: [] })).toThrow();
});
it("loads on opt-in, orders labels above overlays and removes only its own resources", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, text: async () => JSON.stringify(style()) });
  vi.stubGlobal("fetch", fetch);
  const map = makeMap();
  map.layers.add("department-fill");
  map.sources.add("crime-density");
  const report = vi.fn();
  const controller = createStreetBasemap(map as unknown as Map, report);
  await controller.setEnabled(false);
  expect(fetch).not.toHaveBeenCalled();
  await controller.setEnabled(true);
  expect(report).toHaveBeenLastCalledWith("loading");
  expect(
    map.addLayer.mock.calls.map(([layer, before]) => [layer.id, before]),
  ).toEqual([
    ["streets-background", "department-land"],
    ["streets-highway_minor", "crime-heatmap"],
    ["streets-highway-name-minor", undefined],
  ]);
  controller.sourceLoaded("crime-density", true);
  expect(report).not.toHaveBeenCalledWith("ready");
  controller.sourceLoaded("streets-openmaptiles", true);
  expect(report).toHaveBeenLastCalledWith("ready");
  const count = report.mock.calls.length;
  controller.sourceLoaded("streets-openmaptiles", true);
  expect(report).toHaveBeenCalledTimes(count);
  await controller.setEnabled(false);
  expect([...map.layers]).toEqual(["department-fill"]);
  expect([...map.sources]).toEqual(["crime-density"]);
  await controller.setEnabled(true);
  expect(fetch).toHaveBeenCalledTimes(1);
  controller.dispose();
});
it("aborts stale loads and never installs them after disabling", async () => {
  let finish!: (value: unknown) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const map = makeMap(),
    report = vi.fn();
  const controller = createStreetBasemap(map as unknown as Map, report);
  const pending = controller.setEnabled(true);
  await controller.setEnabled(false);
  finish({ ok: true, text: async () => JSON.stringify(style()) });
  await pending;
  expect(map.addLayer).not.toHaveBeenCalled();
  expect(report).toHaveBeenLastCalledWith("off");
  controller.dispose();
});
it("isolates provider and font failures, times out and supports an explicit retry", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(style()),
    }),
  );
  const map = makeMap(),
    report = vi.fn();
  const controller = createStreetBasemap(map as unknown as Map, report);
  await controller.setEnabled(true);
  expect(controller.handleError({ sourceId: "police-stations" })).toBe(false);
  expect(controller.handleError({ sourceId: "streets-openmaptiles" })).toBe(
    true,
  );
  expect(report).toHaveBeenLastCalledWith("error");
  expect(map.layers.size).toBe(0);
  await controller.setEnabled(true);
  controller.sourceLoaded("streets-openmaptiles", true);
  controller.handleError({
    error: { message: "Failed https://tiles.openfreemap.org/fonts/test" },
  });
  expect(report).toHaveBeenLastCalledWith("error");
  await controller.setEnabled(true);
  await vi.advanceTimersByTimeAsync(20000);
  expect(report).toHaveBeenLastCalledWith("error");
  expect(map.sources.size).toBe(0);
  controller.dispose();
});
it("falls back on HTTP failure without exposing provider internals", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  const map = makeMap(),
    report = vi.fn();
  const controller = createStreetBasemap(map as unknown as Map, report);
  await controller.setEnabled(true);
  expect(report).toHaveBeenLastCalledWith("error");
  expect(map.layers.size).toBe(0);
  controller.dispose();
});
