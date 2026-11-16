import type { LayerSpecification, Map, StyleSpecification } from "maplibre-gl";

export const streetSource = {
  style: "https://tiles.openfreemap.org/styles/positron",
  tiles: "https://tiles.openfreemap.org/planet",
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  attribution:
    '<a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · © <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
};
const sourceId = "streets-openmaptiles";
const prefix = "streets-";
export type StreetStatus = "off" | "loading" | "ready" | "error";

// Import only the reviewed vector source and label/road layers. Never replace
// the application style: statistical sources, camera and event handlers survive.
export function streetLayers(value: unknown): LayerSpecification[] {
  const style = value as StyleSpecification | null;
  const source = style?.sources?.openmaptiles;
  if (
    style?.version !== 8 ||
    source?.type !== "vector" ||
    source.url !== streetSource.tiles ||
    style.glyphs !== streetSource.glyphs ||
    !Array.isArray(style.layers) ||
    style.layers.length > 200
  ) {
    throw new Error("Unsupported street style");
  }
  const layers: LayerSpecification[] = [];
  for (const original of style.layers) {
    if (!original || !/^[\w-]+$/.test(original.id))
      throw new Error("Invalid street layer");
    if (
      original.type !== "background" &&
      (!("source" in original) || original.source !== "openmaptiles")
    )
      continue;
    if ("source-layer" in original && original["source-layer"] === "boundary")
      continue; // INEI remains authoritative.
    if (!["background", "fill", "line", "symbol"].includes(original.type))
      continue;
    if (original.type === "symbol" && !original.layout?.["text-field"])
      continue;
    const layer = structuredClone(original);
    layer.id = prefix + original.id;
    if ("source" in layer) layer.source = sourceId;
    if (layer.type === "symbol") {
      layer.layout = Object.fromEntries(
        Object.entries(layer.layout ?? {}).filter(
          ([key]) => !key.startsWith("icon-"),
        ),
      );
      layer.layout["text-field"] = [
        "coalesce",
        ["get", "name:es"],
        ["get", "name_es"],
        ["get", "name"],
        ["get", "name:latin"],
        ["get", "name_en"],
        "",
      ];
      layer.paint = Object.fromEntries(
        Object.entries(layer.paint ?? {}).filter(
          ([key]) => !key.startsWith("icon-"),
        ),
      );
      layer.paint["text-color"] = "#405660";
      layer.paint["text-halo-color"] = "#ffffff";
      layer.paint["text-halo-width"] = 1.6;
      if (original.id === "highway-name-minor") layer.minzoom = 14;
    }
    layers.push(layer);
  }
  if (
    !layers.some(
      (layer) =>
        layer.type === "line" && layer["source-layer"] === "transportation",
    ) ||
    !layers.some(
      (layer) =>
        layer.type === "symbol" &&
        layer["source-layer"] === "transportation_name",
    )
  ) {
    throw new Error("Street style has no roads or road names");
  }
  return layers;
}

export function createStreetBasemap(
  map: Map,
  report: (status: StreetStatus) => void,
) {
  let enabled = false,
    disposed = false,
    generation = 0;
  let status: StreetStatus = "off";
  const publish = (next: StreetStatus) => {
    if (status !== next) {
      status = next;
      report(next);
    }
  };
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let installed: string[] = [];
  let cached: LayerSpecification[] | null = null;
  const remove = () => {
    for (const id of installed.reverse())
      if (map.getLayer(id)) map.removeLayer(id);
    installed = [];
    if (map.getSource(sourceId)) map.removeSource(sourceId);
    map.setGlyphs(null);
  };
  const stop = () => {
    generation++;
    controller?.abort();
    clearTimeout(timer);
  };
  const fail = () => {
    if (disposed || !enabled) return;
    stop();
    remove();
    publish("error");
  };
  const setEnabled = async (value: boolean) => {
    enabled = value;
    stop();
    remove();
    if (!enabled || disposed) {
      if (!disposed) publish("off");
      return;
    }
    const current = generation;
    controller = new AbortController();
    timer = setTimeout(fail, 20_000);
    publish("loading");
    try {
      if (!cached) {
        const response = await fetch(streetSource.style, {
          signal: controller.signal,
          credentials: "omit",
          redirect: "error",
          referrerPolicy: "no-referrer",
        });
        if (!response.ok) throw new Error("Street provider unavailable");
        const text = await response.text();
        if (text.length > 1_000_000) throw new Error("Street style too large");
        const parsed = streetLayers(JSON.parse(text));
        if (disposed || !enabled || generation !== current) return;
        cached = parsed;
      }
      if (disposed || !enabled || generation !== current) return;
      map.setGlyphs(streetSource.glyphs);
      map.addSource(sourceId, {
        type: "vector",
        url: streetSource.tiles,
        attribution: streetSource.attribution,
      });
      for (const layer of cached) {
        const before =
          layer.type === "symbol"
            ? undefined
            : layer.type === "line"
              ? "crime-heatmap"
              : "department-land";
        map.addLayer(structuredClone(layer), before);
        installed.push(layer.id);
      }
      // Readiness is signalled by loaded vector tiles, not just the style fetch.
    } catch {
      if (!disposed && enabled && generation === current) fail();
    }
  };
  return {
    setEnabled,
    sourceLoaded(source: string | undefined, loaded: boolean) {
      if (enabled && installed.length && source === sourceId && loaded) {
        clearTimeout(timer);
        publish("ready");
      }
    },
    handleError(event: { sourceId?: string; error?: { message?: string } }) {
      const ours =
        event.sourceId === sourceId ||
        event.error?.message?.includes("tiles.openfreemap.org") === true;
      if (ours) fail();
      return ours;
    },
    dispose() {
      disposed = true;
      enabled = false;
      stop();
      remove();
    },
  };
}
