import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CrimeMap } from "./CrimeMap";
import type { StationCollection } from "../lib/policeStations";
import type { AreaFeatureCollection } from "../lib/api";

const mocks = vi.hoisted(() => ({
  maps: [] as FakeMap[],
  popups: [] as FakePopup[],
  resize: null as ResizeObserverCallback | null,
}));
type Event = {
  features?: { properties: { code?: string; id?: string; records?: number } }[];
  lngLat?: { lng: number; lat: number };
  sourceId?: string;
};
type FakeSource = {
  data: AreaFeatureCollection | StationCollection;
  setData: (data: AreaFeatureCollection | StationCollection) => void;
};
type FakeMap = {
  emit: (name: string, event?: Event, layer?: string) => void;
  fitBounds: ReturnType<typeof vi.fn>;
  setMaxBounds: ReturnType<typeof vi.fn>;
  setMinZoom: ReturnType<typeof vi.fn>;
  zoom: number;
  queryRenderedFeatures: ReturnType<typeof vi.fn>;
  paint: Map<string, unknown>;
  getSource: (name: string) => FakeSource | undefined;
};
type FakePopup = {
  content?: HTMLElement;
  remove: ReturnType<typeof vi.fn>;
  addTo: ReturnType<typeof vi.fn>;
};
vi.mock("maplibre-gl", () => ({
  Map: class {
    callbacks = new Map<string, (event?: Event) => void>();
    sources = new Map<string, FakeSource>();
    layers = new Set<string>();
    paint = new Map<string, unknown>();
    queryRenderedFeatures = vi.fn((): unknown[] => []);
    zoom = 4.5;
    getZoom() {
      return this.zoom;
    }
    getBounds() {
      return {
        getWest: () => -78,
        getSouth: () => -13,
        getEast: () => -76,
        getNorth: () => -11,
      };
    }
    fitBounds = vi.fn();
    canvas = { style: { cursor: "" }, clientWidth: 800, clientHeight: 500 };
    setMaxBounds = vi.fn();
    setMinZoom = vi.fn();
    cameraForBounds() {
      return { center: [-77, -12], zoom: 5 };
    }
    touchZoomRotate = { disableRotation: vi.fn() };
    constructor() {
      mocks.maps.push(this);
    }
    on(
      name: string,
      layerOrHandler: string | (() => void),
      handler?: (event?: Event) => void,
    ) {
      this.callbacks.set(
        typeof layerOrHandler === "string" ? `${name}:${layerOrHandler}` : name,
        handler ?? (layerOrHandler as () => void),
      );
    }
    emit(name: string, event?: Event, layer = "department-fill") {
      (this.callbacks.get(`${name}:${layer}`) ?? this.callbacks.get(name))?.(
        event,
      );
    }
    addControl() {}
    resize() {}
    remove() {}
    setFilter() {}
    setGlyphs() {}
    removeLayer(id: string) {
      this.layers.delete(id);
    }
    removeSource(id: string) {
      this.sources.delete(id);
    }
    addLayer(layer: { id: string }) {
      this.layers.add(layer.id);
    }
    addSource(
      name: string,
      value: { data: AreaFeatureCollection | StationCollection },
    ) {
      const source = {
        data: value.data,
        setData: (data: AreaFeatureCollection | StationCollection) => {
          source.data = data;
        },
      };
      this.sources.set(name, source);
    }
    setPaintProperty(layer: string, property: string, value: unknown) {
      this.paint.set(`${layer}/${property}`, value);
    }
    getLayer(name: string) {
      return this.layers.has(name);
    }
    getSource(name: string) {
      return this.sources.get(name);
    }
    getCanvas() {
      return this.canvas;
    }
  },
  setWorkerUrl: vi.fn(),
  NavigationControl: class {},
  LngLat: {
    convert: (center: [number, number]) => ({ lng: center[0], lat: center[1] }),
  },
  AttributionControl: class {},
  Popup: class {
    content?: HTMLElement;
    remove = vi.fn();
    addTo = vi.fn(() => this);
    constructor() {
      mocks.popups.push(this);
    }
    setLngLat() {
      return this;
    }
    setDOMContent(content: HTMLElement) {
      this.content = content;
      return this;
    }
  },
}));
const data: AreaFeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        code: "04",
        name: "TEST DEPARTMENT",
        level: "department",
        reports: 12,
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-77, -12],
            [-76, -12],
            [-76, -11],
            [-77, -12],
          ],
        ],
      },
    },
  ],
};
const focus = (): AreaFeatureCollection => {
  const result = structuredClone(data);
  result.features[0].properties.level = "district";
  result.features[0].properties.code = "040101";
  return result;
};
const event: Event = {
  features: [{ properties: { code: "04" } }],
  lngLat: { lng: -77, lat: -12 },
};
const frame = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const outsideOpacity = () => {
  const value = mocks.maps[0].paint.get("department-outline/line-opacity");
  return typeof value === "number"
    ? value
    : ((value as unknown[])[3] as number);
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, "now").mockImplementation(() => Date.now());
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  mocks.maps.length = 0;
  mocks.popups.length = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        mocks.resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("continuous geographic map navigation", () => {
  it("keeps national navigation limits while focusing a department", () => {
    const props = {
      data,
      periodLabel: "2026",
      onSelect: vi.fn(),
      selectedUbigeo: null,
      department: "",
    };
    const { rerender } = render(<CrimeMap {...props} />);
    act(() => mocks.maps[0].emit("load"));
    frame(1000);
    const map = mocks.maps[0],
      bounds = map.setMaxBounds.mock.lastCall![0];
    expect(bounds[0][0]).toBeLessThan(-77);
    expect(bounds[1][0]).toBeGreaterThan(-76);
    expect(map.setMinZoom).toHaveBeenLastCalledWith(5);
    rerender(<CrimeMap {...props} data={focus()} department="04" />);
    frame(1000);
    expect(map.setMaxBounds.mock.lastCall![0]).toEqual(bounds);
    expect(map.fitBounds).toHaveBeenCalledTimes(2);
  });
  it("publishes the existing camera on mode entry and movement, and preserves it on height-only resizing", () => {
    const changed = vi.fn();
    const props = {
      data,
      periodLabel: "2026",
      onSelect: vi.fn(),
      selectedUbigeo: null,
      department: "",
    };
    const { rerender } = render(<CrimeMap {...props} />);
    act(() => mocks.maps[0].emit("load"));
    frame(1000);
    mocks.maps[0].zoom = 10;
    rerender(<CrimeMap {...props} concentration onViewportChange={changed} />);
    expect(changed).toHaveBeenLastCalledWith({
      west: -78,
      south: -13,
      east: -76,
      north: -11,
      zoom: 10,
    });
    act(() => mocks.maps[0].emit("moveend"));
    expect(changed).toHaveBeenCalledTimes(2);
    const resize = (height: number) =>
      act(() =>
        mocks.resize?.(
          [{ contentRect: { width: 800, height } }] as ResizeObserverEntry[],
          {} as ResizeObserver,
        ),
      );
    resize(500);
    const fits = mocks.maps[0].fitBounds.mock.calls.length;
    resize(480);
    expect(mocks.maps[0].fitBounds).toHaveBeenCalledTimes(fits);
  });
  it("replaces the legend distance while loading finer cells and labels a radius independently", () => {
    const props = {
      data,
      periodLabel: "2026",
      onSelect: vi.fn(),
      selectedUbigeo: null,
      department: "",
      concentration: true,
    };
    const { rerender } = render(
      <CrimeMap {...props} densityGridMetres={10000} />,
    );
    act(() => mocks.maps[0].emit("load"));
    frame(1000);
    expect(screen.getByLabelText("Leyenda de concentración")).toHaveTextContent(
      "10 km por lado",
    );
    rerender(
      <CrimeMap
        {...props}
        densityGridMetres={500}
        mapDetailLoading
        analysisRadiusMetres={1000}
      />,
    );
    const legend = screen.getByLabelText("Leyenda de concentración");
    expect(legend).toHaveTextContent("500 m por lado");
    expect(legend).not.toHaveTextContent("10 km");
    expect(legend).toHaveTextContent("Cargando el detalle");
    expect(legend).toHaveTextContent("1 km");
  });
  it("uses the radius tool without selecting underlying areas and clears its geometry independently", () => {
    const pick = vi.fn(),
      select = vi.fn();
    const geometry = data.features[0].geometry;
    const props = {
      data,
      periodLabel: "2026",
      onSelect: select,
      selectedUbigeo: null,
      department: "",
      concentration: true,
    };
    const { rerender } = render(
      <CrimeMap
        {...props}
        onRadiusPick={pick}
        radiusGeometry={geometry as import("geojson").Polygon}
      />,
    );
    act(() => mocks.maps[0].emit("load"));
    frame(1000);
    act(() => mocks.maps[0].emit("click", event));
    expect(select).not.toHaveBeenCalled();
    act(() => mocks.maps[0].emit("click", event, "radius-global"));
    expect(pick).toHaveBeenCalledWith({ longitude: -77, latitude: -12 });
    const fitCalls = mocks.maps[0].fitBounds.mock.calls.length;
    act(() =>
      mocks.resize?.(
        [{ contentRect: { width: 800, height: 450 } }] as ResizeObserverEntry[],
        {} as ResizeObserver,
      ),
    );
    expect(mocks.maps[0].fitBounds).toHaveBeenCalledTimes(fitCalls);
    expect(
      mocks.maps[0].getSource("radius-selection")?.data.features,
    ).toHaveLength(1);
    rerender(<CrimeMap {...props} />);
    expect(
      mocks.maps[0].getSource("radius-selection")?.data.features,
    ).toHaveLength(0);
    expect(mocks.maps[0].getSource("departments")?.data).toEqual(data);
    expect(mocks.maps).toHaveLength(1);
  });
  it("refits after a layer panel resizes the canvas and ignores hidden views", () => {
    render(
      <CrimeMap
        data={data}
        periodLabel="2024"
        onSelect={vi.fn()}
        selectedUbigeo={null}
        department=""
      />,
    );
    act(() => mocks.maps[0].emit("load"));
    frame(1000);
    const resize = (height: number) =>
      act(() =>
        mocks.resize?.(
          [{ contentRect: { width: 800, height } }] as ResizeObserverEntry[],
          {} as ResizeObserver,
        ),
      );
    resize(500);
    expect(mocks.maps[0].fitBounds).toHaveBeenCalledTimes(2);
    expect(mocks.maps[0].fitBounds.mock.calls[1][1].duration).toBe(0);
    resize(0);
    expect(mocks.maps[0].fitBounds).toHaveBeenCalledTimes(2);
    expect(mocks.maps).toHaveLength(1);
  });
  it("shows the department count and period on hover and selects it on click", () => {
    const onSelect = vi.fn();
    render(
      <CrimeMap
        data={data}
        periodLabel="Febrero 2024"
        onSelect={onSelect}
        selectedUbigeo={null}
        department=""
      />,
    );
    act(() => mocks.maps[0].emit("load"));
    frame(1000);
    act(() => mocks.maps[0].emit("mousemove", event));
    expect(mocks.popups[0].content).toHaveTextContent("TEST DEPARTMENT");
    expect(mocks.popups[0].content).toHaveTextContent(
      "12 denuncias registradas",
    );
    expect(mocks.popups[0].content).toHaveTextContent("Febrero 2024");
    act(() => mocks.maps[0].emit("click", event));
    expect(onSelect).toHaveBeenCalledWith(data.features[0].properties);
  });
  it("distinguishes missing reports from zero", () => {
    const empty = structuredClone(data);
    empty.features[0].properties.reports = null;
    const { rerender } = render(
      <CrimeMap
        data={empty}
        periodLabel="2024"
        onSelect={vi.fn()}
        selectedUbigeo={null}
        department=""
      />,
    );
    act(() => mocks.maps[0].emit("load"));
    frame(1000);
    act(() => mocks.maps[0].emit("mousemove", event));
    expect(mocks.popups[0].content).toHaveTextContent(
      "Sin datos para este filtro",
    );
    const zero = structuredClone(data);
    zero.features[0].properties.reports = 0;
    rerender(
      <CrimeMap
        data={zero}
        periodLabel="2024"
        onSelect={vi.fn()}
        selectedUbigeo={null}
        department=""
      />,
    );
    act(() => mocks.maps[0].emit("mousemove", event));
    expect(mocks.popups[0].content).toHaveTextContent(
      "0 denuncias registradas",
    );
  });
  it("keeps the country geometry while loading, zooms immediately and fades other departments to zero", () => {
    const { rerender } = render(
      <CrimeMap
        data={data}
        periodLabel="Enero"
        onSelect={vi.fn()}
        selectedUbigeo={null}
        department=""
      />,
    );
    act(() => mocks.maps[0].emit("load"));
    frame(1000);
    const map = mocks.maps[0];
    rerender(
      <CrimeMap
        data={null}
        periodLabel="Enero"
        onSelect={vi.fn()}
        selectedUbigeo={null}
        department="04"
      />,
    );
    expect(map.getSource("departments")?.data).toEqual(data);
    expect(map.fitBounds).toHaveBeenCalledTimes(2);
    frame(500);
    expect(outsideOpacity()).toBeGreaterThan(0);
    expect(outsideOpacity()).toBeLessThan(1);
    frame(500);
    expect(outsideOpacity()).toBe(0);
    expect(map.paint.get("department-fill/fill-color")).toBe("#c7d4d2");
    rerender(
      <CrimeMap
        data={focus()}
        periodLabel="Enero"
        onSelect={vi.fn()}
        selectedUbigeo={null}
        department="04"
      />,
    );
    frame(600);
    expect(map.paint.get("area-fill/fill-opacity")).toBe(0.9);
    expect(mocks.maps).toHaveLength(1); // No page/map remount during navigation.
  });
  it("reverses the fade on return to Peru and cancels an interrupted selection", () => {
    const { rerender } = render(
      <CrimeMap
        data={data}
        periodLabel="Enero"
        onSelect={vi.fn()}
        selectedUbigeo={null}
        department=""
      />,
    );
    act(() => mocks.maps[0].emit("load"));
    frame(1000);
    rerender(
      <CrimeMap
        data={focus()}
        periodLabel="Enero"
        onSelect={vi.fn()}
        selectedUbigeo={null}
        department="04"
      />,
    );
    frame(1000);
    expect(outsideOpacity()).toBe(0);
    rerender(
      <CrimeMap
        data={null}
        periodLabel="Enero"
        onSelect={vi.fn()}
        selectedUbigeo={null}
        department=""
      />,
    );
    frame(400);
    expect(outsideOpacity()).toBeGreaterThan(0);
    expect(outsideOpacity()).toBeLessThan(1);
    rerender(
      <CrimeMap
        data={null}
        periodLabel="Enero"
        onSelect={vi.fn()}
        selectedUbigeo={null}
        department="05"
      />,
    );
    frame(1000);
    expect(outsideOpacity()).toBe(0);
    rerender(
      <CrimeMap
        data={data}
        periodLabel="Enero"
        onSelect={vi.fn()}
        selectedUbigeo={null}
        department=""
      />,
    );
    frame(1000);
    expect(outsideOpacity()).toBe(1);
    expect(mocks.maps).toHaveLength(1);
  });
  it("focuses a province using cached district geometry and preserves zoom for time filters", () => {
    const districts = focus();
    const { rerender } = render(
      <CrimeMap
        data={data}
        periodLabel="Enero"
        onSelect={vi.fn()}
        selectedUbigeo={null}
        department=""
      />,
    );
    act(() => mocks.maps[0].emit("load"));
    frame(1000);
    rerender(
      <CrimeMap
        data={districts}
        periodLabel="Enero"
        onSelect={vi.fn()}
        selectedUbigeo={null}
        department="04"
      />,
    );
    frame(1000);
    const calls = mocks.maps[0].fitBounds.mock.calls.length;
    rerender(
      <CrimeMap
        data={null}
        periodLabel="Enero"
        onSelect={vi.fn()}
        selectedUbigeo={null}
        department="04"
        province="0401"
      />,
    );
    expect(mocks.maps[0].fitBounds).toHaveBeenCalledTimes(calls + 1);
    rerender(
      <CrimeMap
        data={districts}
        periodLabel="Febrero"
        onSelect={vi.fn()}
        selectedUbigeo={null}
        department="04"
        province="0401"
      />,
    );
    expect(mocks.maps[0].fitBounds).toHaveBeenCalledTimes(calls + 1);
  });
  it("zooms to a district from cache while the response is pending", () => {
    const districts = focus();
    const { rerender } = render(
      <CrimeMap
        data={districts}
        periodLabel="Enero"
        onSelect={vi.fn()}
        selectedUbigeo={null}
        department="04"
      />,
    );
    act(() => mocks.maps[0].emit("load"));
    frame(1000);
    rerender(
      <CrimeMap
        data={null}
        periodLabel="Enero"
        onSelect={vi.fn()}
        selectedUbigeo={null}
        department="04"
        district="040101"
        loading
      />,
    );
    expect(mocks.maps[0].fitBounds).toHaveBeenCalledTimes(2);
    expect(mocks.maps[0].fitBounds.mock.calls[1][1].maxZoom).toBe(14);
    expect(mocks.maps).toHaveLength(1);
  });
  it("shows an animated skeleton after camera motion until data arrives and removes it on failure", () => {
    const props = {
      periodLabel: "Enero",
      onSelect: vi.fn(),
      selectedUbigeo: null,
      department: "04",
    };
    const { rerender } = render(<CrimeMap {...props} data={null} loading />);
    act(() => mocks.maps[0].emit("load"));
    act(() => mocks.maps[0].emit("movestart"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => mocks.maps[0].emit("moveend"));
    expect(
      screen
        .getByRole("status", { name: "Cargando estadísticas del mapa" })
        .querySelector(".skeleton"),
    ).toBeInTheDocument();
    rerender(<CrimeMap {...props} data={focus()} loading={false} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    rerender(<CrimeMap {...props} data={null} loading />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    rerender(<CrimeMap {...props} data={null} loading={false} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("keeps station points independent when hiding choropleth and never selects the district underneath a station", () => {
    const stations: StationCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-77, -12] },
          properties: {
            id: "1",
            name: "TEST STATION",
            department: "04",
            province: "0401",
            district: "040101",
          },
        },
      ],
    };
    const select = vi.fn();
    const { rerender } = render(
      <CrimeMap
        data={data}
        stations={stations}
        periodLabel="2024"
        onSelect={select}
        selectedUbigeo={null}
        department=""
      />,
    );
    act(() => mocks.maps[0].emit("load"));
    frame(1000);
    expect(mocks.maps[0].getSource("police-stations")?.data).toEqual(stations);
    mocks.maps[0].queryRenderedFeatures.mockReturnValue([{}]);
    act(() => mocks.maps[0].emit("click", event));
    expect(select).not.toHaveBeenCalled();
    act(() =>
      mocks.maps[0].emit(
        "click",
        {
          features: [{ properties: { id: "1" } }],
          lngLat: { lng: -77, lat: -12 },
        },
        "police-stations",
      ),
    );
    expect(mocks.popups.at(-1)?.content).toHaveTextContent("TEST STATION");
    expect(mocks.popups.at(-1)?.content).toHaveTextContent(
      "No representa el período SIDPOL",
    );
    rerender(
      <CrimeMap
        data={data}
        stations={stations}
        showStatistics={false}
        periodLabel="2024"
        onSelect={select}
        selectedUbigeo={null}
        department=""
      />,
    );
    frame(1000);
    expect(outsideOpacity()).toBe(0.75);
    expect(mocks.maps[0].paint.get("department-fill/fill-opacity")).toBe(0);
    expect(mocks.maps[0].paint.get("department-land/fill-opacity")).toBe(1);
    expect(mocks.maps[0].getSource("police-stations")?.data).toEqual(stations);
    expect(mocks.maps).toHaveLength(1);
    rerender(
      <CrimeMap
        data={data}
        stations={null}
        showStatistics={false}
        periodLabel="2024"
        onSelect={select}
        selectedUbigeo={null}
        department=""
      />,
    );
    expect(
      mocks.maps[0].getSource("police-stations")?.data.features,
    ).toHaveLength(0);
    expect(mocks.maps[0].paint.get("department-land/fill-opacity")).toBe(1);
    act(() => mocks.maps[0].emit("mousemove", event));
    act(() => mocks.maps[0].emit("click", event));
    expect(select).not.toHaveBeenCalled();
    expect(mocks.popups.at(-1)?.remove).toHaveBeenCalled();
    rerender(
      <CrimeMap
        data={data}
        stations={null}
        periodLabel="2024"
        onSelect={select}
        selectedUbigeo={null}
        department=""
      />,
    );
    expect(
      mocks.maps[0].getSource("police-stations")?.data.features,
    ).toHaveLength(0);
    expect(outsideOpacity()).toBe(1);
  });
  it("isolates a station source error from the working choropleth", () => {
    render(
      <CrimeMap
        data={data}
        periodLabel="2024"
        onSelect={vi.fn()}
        selectedUbigeo={null}
        department=""
      />,
    );
    act(() => mocks.maps[0].emit("load"));
    frame(1000);
    act(() => mocks.maps[0].emit("error", { sourceId: "police-stations" }));
    expect(screen.getByRole("alert")).toHaveTextContent("capa de comisarías");
    expect(screen.queryByText(/Comprueba que WebGL/)).not.toBeInTheDocument();
    expect(outsideOpacity()).toBe(1);
  });
  it("replaces the choropleth with aggregate density on the same canvas and clears it on return", () => {
    const props = {
      data,
      periodLabel: "2026",
      onSelect: vi.fn(),
      selectedUbigeo: null,
      department: "",
    };
    const { rerender } = render(<CrimeMap {...props} />);
    act(() => mocks.maps[0].emit("load"));
    frame(1000);
    rerender(
      <CrimeMap
        {...props}
        concentration
        showStatistics={false}
        densityCells={[
          { id: "cell", longitude: -77, latitude: -12, records: 5 },
        ]}
      />,
    );
    frame(1000);
    expect(mocks.maps).toHaveLength(1);
    expect(mocks.maps[0].paint.get("department-fill/fill-opacity")).toBe(0);
    expect(
      mocks.maps[0].getSource("crime-density")?.data.features,
    ).toHaveLength(1);
    mocks.maps[0].zoom = 9;
    act(() =>
      mocks.maps[0].emit(
        "click",
        {
          features: [{ properties: { records: 5 } }],
          lngLat: { lng: -77, lat: -12 },
        },
        "crime-cells",
      ),
    );
    expect(mocks.popups.at(-1)?.content).toHaveTextContent(
      "5 registros en celda agregada",
    );
    expect(props.onSelect).not.toHaveBeenCalled();
    rerender(<CrimeMap {...props} />);
    expect(
      mocks.maps[0].getSource("crime-density")?.data.features,
    ).toHaveLength(0);
    expect(mocks.maps[0].paint.get("department-land/fill-opacity")).toBe(0);
  });
  it("respects reduced-motion preference", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    render(
      <CrimeMap
        data={data}
        periodLabel="2024"
        onSelect={vi.fn()}
        selectedUbigeo={null}
        department=""
      />,
    );
    act(() => mocks.maps[0].emit("load"));
    expect(outsideOpacity()).toBe(1);
    expect(mocks.maps[0].fitBounds.mock.calls[0][1].duration).toBe(0);
  });
  it("adapts the concentration legend to zoom and shows themed hover counts with the selected period", () => {
    render(
      <CrimeMap
        data={data}
        concentration
        showStatistics={false}
        densityGridMetres={10000}
        densityCells={[
          { id: "aggregate", longitude: -77, latitude: -12, records: 120 },
        ]}
        periodLabel="Enero 2025"
        onSelect={vi.fn()}
        selectedUbigeo={null}
        department=""
      />,
    );
    act(() => mocks.maps[0].emit("load"));
    frame(1000);
    expect(screen.getByLabelText("Leyenda de concentración")).toHaveTextContent(
      "Concentración relativa",
    );
    expect(mocks.maps[0].paint.get("department-land/fill-opacity")).toBe(1);
    expect(mocks.maps[0].paint.get("department-fill/fill-opacity")).toBe(0);
    const map = mocks.maps[0];
    map.zoom = 9;
    act(() => map.emit("zoom"));
    expect(screen.getByLabelText("Leyenda de concentración")).toHaveTextContent(
      "Registros por agrupación",
    );
    act(() =>
      map.emit(
        "mousemove",
        {
          features: [{ properties: { records: 120 } }],
          lngLat: { lng: -77, lat: -12 },
        },
        "crime-cells",
      ),
    );
    expect(mocks.popups.at(-1)?.content).toHaveTextContent(
      "120 registros en celda agregada",
    );
    expect(mocks.popups.at(-1)?.content).toHaveTextContent("Enero 2025");
    expect(mocks.popups.at(-1)?.content).toHaveClass("density-popup");
    act(() => map.emit("mouseleave", undefined, "crime-cells"));
    expect(mocks.popups.at(-1)?.remove).toHaveBeenCalled();
    expect(map.getSource("crime-density")?.data.features).toHaveLength(1);
  });
});
