import { useCallback, useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map,
  Popup,
} from "maplibre-gl";
import { formatMapDistance, type MapViewport } from "../lib/mapViewport";
import type { Polygon } from "geojson";
import type { RadiusPoint } from "../hooks/useRadiusAnalysis";
import type { AreaFeatureCollection, AreaProperties } from "../lib/api";
import { areaBounds, cameraBounds } from "../lib/geography";
import {
  animateFrames,
  lerp,
  reducedMotion,
  smooth,
} from "../lib/mapAnimation";
import { type StationCollection } from "../lib/policeStations";
import {
  densityColor,
  densityCountColor,
  densityFade,
  densityRadius,
  densityRadiusExpression,
} from "../lib/densityStyle";
import { createStreetBasemap, type StreetStatus } from "../lib/streetBasemap";
import "maplibre-gl/dist/maplibre-gl.css";

type Props = {
  metric?: "count" | "rate";
  onReady?: (ready: boolean) => void;
  onViewportChange?: (view: MapViewport) => void;
  mapDetailLoading?: boolean;
  mapDetailError?: string | null;
  mapSuppressedCells?: number;
  analysisRadiusMetres?: number;
  locationBased?: boolean;
  radiusGeometry?: Polygon | null;
  onRadiusPick?: (point: RadiusPoint) => void;
  showStreets?: boolean;
  concentration?: boolean;
  densityCells?: import("../lib/api").DensityCell[];
  densityGridMetres?: number;
  stations?: StationCollection | null;
  showStatistics?: boolean;
  data: AreaFeatureCollection | null;
  periodLabel: string;
  onSelect: (area: AreaProperties) => void;
  selectedUbigeo: string | null;
  department: string;
  province?: string;
  district?: string;
  loading?: boolean;
};
// Keep the version-matched worker in the Vite build; do not resolve it beside
// the combined application bundle or fetch a worker from an external CDN.
maplibregl.setWorkerUrl(mapWorkerUrl);
const empty: AreaFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};
const countColor: ExpressionSpecification = [
  "case",
  ["==", ["get", "reports"], null],
  "#d8dfe3",
  ["==", ["get", "level"], "department"],
  [
    "step",
    ["coalesce", ["get", "reports"], 0],
    "#f2f6f5",
    1,
    "#c2ddd7",
    1000,
    "#86c9b9",
    5000,
    "#4ca694",
    10000,
    "#257b71",
  ],
  [
    "step",
    ["coalesce", ["get", "reports"], 0],
    "#f2f6f5",
    1,
    "#c2ddd7",
    100,
    "#86c9b9",
    500,
    "#4ca694",
    1000,
    "#257b71",
  ],
];
const neutral = "#c7d4d2";
const rateColor: ExpressionSpecification = [
  "case",
  ["==", ["get", "ratePer100k"], null],
  "#d8dfe3",
  [
    "step",
    ["coalesce", ["get", "ratePer100k"], 0],
    "#f2f6f5",
    0.000001,
    "#c2ddd7",
    100,
    "#86c9b9",
    250,
    "#4ca694",
    500,
    "#257b71",
  ],
];
const noDensity: import("../lib/api").DensityCell[] = [];

export function CrimeMap({
  metric = "count",
  onReady,
  data,
  periodLabel,
  onSelect,
  selectedUbigeo,
  department,
  province = "",
  district = "",
  loading = false,
  stations = null,
  showStatistics = true,
  showStreets = false,
  onViewportChange,
  mapDetailLoading = false,
  mapDetailError = null,
  mapSuppressedCells,
  analysisRadiusMetres,
  locationBased = false,
  radiusGeometry = null,
  onRadiusPick,
  concentration = false,
  densityCells = noDensity,
  densityGridMetres = 1000,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const popup = useRef<Popup | null>(null),
    hover = useRef<Popup | null>(null);
  const popupCode = useRef<string | null>(null);
  const streets = useRef<ReturnType<typeof createStreetBasemap> | null>(null);
  const streetsVisible = useRef(false);
  const streetEnabled = useRef(showStreets);
  streetEnabled.current = showStreets;
  const [streetStatus, setStreetStatus] = useState<StreetStatus>("off");
  const latest = useRef({
    metric,
    onReady,
    data,
    periodLabel,
    onSelect,
    selectedUbigeo,
    department,
    province,
    district,
    stations,
    showStatistics,
    concentration,
    densityCells,
    densityGridMetres,
    onRadiusPick,
    radiusGeometry,
    onViewportChange,
  });
  latest.current = {
    metric,
    onReady,
    data,
    periodLabel,
    onSelect,
    selectedUbigeo,
    department,
    province,
    district,
    stations,
    showStatistics,
    concentration,
    densityCells,
    densityGridMetres,
    onRadiusPick,
    radiusGeometry,
    onViewportChange,
  };
  const national = useRef<AreaFeatureCollection>(empty);
  const departmentGeometry = useRef<Record<string, AreaFeatureCollection>>({});
  const shown = useRef<AreaFeatureCollection | null>(null);
  const scope = useRef<string | null>(null),
    fittedScope = useRef<string | null>(null);
  const opacity = useRef({ outside: 0, inside: 0, detail: 0, outgoing: 0 });
  const animations = useRef({
    context: () => {},
    detail: () => {},
    outgoing: () => {},
  });
  const [error, setError] = useState(false);
  const [stationError, setStationError] = useState(false);
  const [densityError, setDensityError] = useState(false);
  const [densityReady, setDensityReady] = useState(false);
  const [moving, setMoving] = useState(false);
  const [mapZoom, setMapZoom] = useState(4.5);
  const detailView = mapZoom >= 7.5;
  const maximum = densityCells.reduce(
    (max, cell) => Math.max(max, cell.records),
    5,
  );
  const scaleCounts = [
    ...new Set([5, Math.max(5, Math.round(maximum / 4)), maximum]),
  ];

  const publishViewport = useCallback(() => {
    const instance = map.current,
      callback = latest.current.onViewportChange;
    if (!instance || !callback) return;
    const bounds = instance.getBounds();
    callback({
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth(),
      zoom: instance.getZoom(),
    });
  }, []);
  const source = useCallback(
    (name: string) => map.current?.getSource(name) as GeoJSONSource | undefined,
    [],
  );
  const paint = useCallback(() => {
    const instance = map.current;
    if (!instance?.getLayer("department-fill")) return;
    instance.setPaintProperty(
      "area-fill",
      "fill-color",
      latest.current.metric === "rate" ? rateColor : countColor,
    );
    const { outside, inside, detail, outgoing } = latest.current.showStatistics
      ? opacity.current
      : { outside: 0, inside: 0, detail: 0, outgoing: 0 };
    const contextOpacity: number | ExpressionSpecification = latest.current
      .department
      ? [
          "case",
          ["==", ["get", "code"], latest.current.department],
          inside,
          outside,
        ]
      : outside;
    instance.setPaintProperty(
      "department-fill",
      "fill-opacity",
      typeof contextOpacity === "number"
        ? contextOpacity * (streetsVisible.current ? 0.45 : 0.9)
        : ["*", contextOpacity, streetsVisible.current ? 0.45 : 0.9],
    );
    instance.setPaintProperty(
      "department-outline",
      "line-opacity",
      contextOpacity,
    );
    instance.setPaintProperty(
      "area-fill",
      "fill-opacity",
      detail * (streetsVisible.current ? 0.45 : 0.9),
    );
    instance.setPaintProperty("area-outline", "line-opacity", detail);
    instance.setPaintProperty("area-selected", "line-opacity", detail);
    instance.setPaintProperty(
      "outgoing-fill",
      "fill-opacity",
      outgoing * (streetsVisible.current ? 0.45 : 0.9),
    );
    instance.setPaintProperty("outgoing-outline", "line-opacity", outgoing);
    // Geographic context is independent of the optional statistical overlay.
    // Reuse the same neutral surfaces while streets are off/loading/unavailable.
    const neutralBase =
      latest.current.concentration || !latest.current.showStatistics;
    for (const id of ["department", "area", "outgoing"]) {
      const backgroundOpacity: number | ExpressionSpecification =
        id === "department"
          ? latest.current.department
            ? [
                "case",
                ["==", ["get", "code"], latest.current.department],
                Math.min(1, opacity.current.inside / 0.18),
                opacity.current.outside,
              ]
            : opacity.current.outside
          : id === "area"
            ? opacity.current.detail
            : opacity.current.outgoing;
      instance.setPaintProperty(
        `${id}-land`,
        "fill-opacity",
        neutralBase && !streetsVisible.current ? backgroundOpacity : 0,
      );
      if (neutralBase)
        instance.setPaintProperty(
          `${id}-outline`,
          "line-opacity",
          typeof backgroundOpacity === "number"
            ? backgroundOpacity * 0.75
            : ["*", backgroundOpacity, 0.75],
        );
      instance.setPaintProperty(
        `${id}-outline`,
        "line-color",
        neutralBase ? "#91a6a3" : "#607e83",
      );
    }
  }, []);
  const retireDetails = useCallback(() => {
    if (!shown.current) return;
    source("outgoing")?.setData(shown.current);
    opacity.current.outgoing = opacity.current.detail;
    animations.current.outgoing();
    animations.current.detail();
    opacity.current.detail = 0;
    shown.current = null;
    source("areas")?.setData(empty);
    const initial = opacity.current.outgoing;
    animations.current.outgoing = animateFrames(
      reducedMotion() ? 0 : 850,
      (t) => {
        opacity.current.outgoing = lerp(initial, 0, smooth(t));
        paint();
      },
    );
  }, [source, paint]);
  const constrainNationalView = useCallback(() => {
    const instance = map.current;
    if (!instance) return;
    const { clientWidth: width, clientHeight: height } = instance.getCanvas();
    if (width <= 96 || height <= 96) return;
    const bounds = areaBounds(national.current) ?? [
      [-82, -19],
      [-68, 1],
    ];
    const camera = instance.cameraForBounds(bounds, {
      padding: 48,
      maxZoom: 5.5,
      bearing: 0,
    });
    if (!camera?.center || camera.zoom === undefined) return;
    instance.setMaxBounds(
      cameraBounds(
        maplibregl.LngLat.convert(camera.center),
        camera.zoom,
        width,
        height,
      ),
    );
    instance.setMinZoom(camera.zoom);
  }, []);
  const fit = useCallback((resizing = false) => {
    const current = latest.current;
    const key = `${current.department}/${current.province}/${current.district}`;
    if (!resizing && fittedScope.current === key) return;
    let geometry: AreaFeatureCollection;
    if (!current.department) geometry = national.current;
    else if (current.province || current.district) {
      const districts =
        departmentGeometry.current[current.department] ?? current.data ?? empty;
      geometry = {
        type: "FeatureCollection",
        features: districts.features.filter((f) =>
          current.district
            ? f.properties.code === current.district
            : f.properties.code.startsWith(current.province),
        ),
      };
    } else {
      geometry = {
        type: "FeatureCollection",
        features: national.current.features.filter(
          (f) => f.properties.code === current.department,
        ),
      };
      if (!geometry.features.length) geometry = current.data ?? empty;
    }
    const bounds = areaBounds(geometry);
    if (!bounds) return;
    fittedScope.current = key;
    map.current?.fitBounds(bounds, {
      padding: 48,
      duration: resizing || reducedMotion() ? 0 : 900,
      maxZoom: current.district
        ? 14
        : current.province
          ? 12
          : current.department
            ? 10
            : 5.5,
    });
  }, []);
  const update = useCallback(() => {
    const instance = map.current;
    if (!instance?.getSource("areas")) return;
    const current = latest.current,
      key = `${current.department}/${current.province}/${current.district}`;
    const relevant = current.data?.features.every((feature) =>
      current.department
        ? feature.properties.level === "district" &&
          (current.district
            ? feature.properties.code === current.district
            : feature.properties.code.startsWith(
                current.province || current.department,
              ))
        : feature.properties.level === "department",
    )
      ? current.data
      : null;
    if (relevant && !current.department) {
      if (national.current !== relevant) {
        national.current = relevant;
        constrainNationalView();
      }
      source("departments")?.setData(relevant);
    } else if (relevant && !current.province && !current.district)
      departmentGeometry.current[current.department] = relevant;
    // The background is structural while loading/focused: stale counts are never interactive.
    instance.setPaintProperty(
      "department-fill",
      "fill-color",
      relevant && !current.department
        ? current.metric === "rate"
          ? rateColor
          : countColor
        : neutral,
    );
    if (scope.current !== key) {
      const previousDepartment = scope.current?.split("/")[0];
      scope.current = key;
      retireDetails();
      animations.current.context();
      const start = { ...opacity.current };
      const reveal = previousDepartment !== current.department;
      animations.current.context = animateFrames(
        reducedMotion() ? 0 : 900,
        (t) => {
          opacity.current.outside = !current.department
            ? lerp(start.outside, 1, smooth(t))
            : reveal
              ? t < 0.25
                ? lerp(start.outside, 1, smooth(t / 0.25))
                : 1 - smooth((t - 0.25) / 0.75)
              : lerp(start.outside, 0, smooth(t));
          opacity.current.inside = lerp(
            start.inside,
            current.department && !current.province && !current.district
              ? 0.18
              : current.department
                ? 0
                : 1,
            smooth(t),
          );
          paint();
        },
      );
    }
    if (!relevant) retireDetails();
    else if (current.department && shown.current !== relevant) {
      retireDetails();
      shown.current = relevant;
      source("areas")?.setData(relevant);
      const initial = opacity.current.detail;
      animations.current.detail();
      animations.current.detail = animateFrames(
        reducedMotion() ? 0 : 450,
        (t) => {
          opacity.current.detail = lerp(initial, 1, smooth(t));
          paint();
        },
      );
    }
    fit();
    paint();
  }, [source, paint, constrainNationalView, retireDetails, fit]);

  const updateDensity = useCallback(() => {
    const current = latest.current;
    setDensityReady(false);
    const max = current.densityCells.reduce(
      (value, cell) => Math.max(value, cell.records),
      5,
    );
    if (map.current?.getLayer("crime-heatmap")) {
      map.current.setPaintProperty("crime-heatmap", "heatmap-weight", [
        "sqrt",
        ["/", ["get", "records"], max],
      ]);
      map.current.setPaintProperty(
        "crime-cells",
        "circle-radius",
        densityRadiusExpression(max),
      );
    }
    source("crime-density")?.setData({
      type: "FeatureCollection",
      features: current.concentration
        ? current.densityCells.map((cell) => ({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [cell.longitude, cell.latitude],
            },
            properties: { records: cell.records, id: cell.id },
          }))
        : [],
    });
  }, [source]);
  const updateRadius = useCallback(() => {
    const geometry = latest.current.radiusGeometry;
    source("radius-selection")?.setData({
      type: "FeatureCollection",
      features: geometry ? [{ type: "Feature", geometry, properties: {} }] : [],
    });
  }, [source]);
  useEffect(() => {
    if (!container.current) return;
    const mountedAnimations = animations.current;
    let instance: Map;
    try {
      instance = new maplibregl.Map({
        container: container.current,
        style: {
          version: 8,
          sources: {},
          layers: [
            {
              id: "background",
              type: "background",
              paint: { "background-color": "#e9eff1" },
            },
          ],
        },
        center: [-75, -9],
        zoom: 4.5,
        attributionControl: false,
        renderWorldCopies: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 0,
      });
    } catch {
      setError(true);
      return;
    }
    map.current = instance;
    instance.touchZoomRotate.disableRotation();
    instance.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    instance.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );
    instance.on("click", (event) => {
      if (latest.current.onRadiusPick)
        latest.current.onRadiusPick({
          longitude: event.lngLat.lng,
          latitude: event.lngLat.lat,
        });
    });
    instance.on("movestart", () => setMoving(true));
    instance.on("moveend", () => {
      setMoving(false);
      publishViewport();
    });
    instance.on("zoom", () => setMapZoom(instance.getZoom()));
    instance.on("sourcedata", (event) => {
      if (event.sourceId === "crime-density" && event.isSourceLoaded)
        setDensityReady(true);
      streets.current?.sourceLoaded(
        event.sourceId,
        event.isSourceLoaded === true,
      );
    });
    instance.on("error", (event) => {
      if (streets.current?.handleError(event)) return;
      if ((event as { sourceId?: string }).sourceId === "police-stations")
        setStationError(true);
      else if ((event as { sourceId?: string }).sourceId === "crime-density")
        setDensityError(true);
      else {
        setError(true);
        latest.current.onReady?.(true);
      }
    });
    instance.on("load", () => {
      for (const name of ["departments", "outgoing", "areas"])
        instance.addSource(name, { type: "geojson", data: empty });
      for (const [id, name] of [
        ["department", "departments"],
        ["outgoing", "outgoing"],
        ["area", "areas"],
      ]) {
        instance.addLayer({
          id: `${id}-land`,
          type: "fill",
          source: name,
          paint: {
            "fill-color": "#faf8f2",
            "fill-opacity": 0,
            "fill-opacity-transition": { duration: 0 },
          },
        });
        instance.addLayer({
          id: `${id}-fill`,
          type: "fill",
          source: name,
          paint: {
            "fill-color":
              id === "outgoing"
                ? neutral
                : latest.current.metric === "rate"
                  ? rateColor
                  : countColor,
            "fill-opacity": 0,
            "fill-opacity-transition": { duration: 0 },
          },
        });
        instance.addLayer({
          id: `${id}-outline`,
          type: "line",
          source: name,
          paint: {
            "line-color": "#607e83",
            "line-width": 0.8,
            "line-opacity": 0,
            "line-opacity-transition": { duration: 0 },
          },
        });
      }
      instance.addLayer({
        id: "area-selected",
        type: "line",
        source: "areas",
        filter: ["==", "code", latest.current.selectedUbigeo ?? ""],
        paint: {
          "line-color": "#0c3034",
          "line-width": 3,
          "line-opacity": 0,
          "line-opacity-transition": { duration: 0 },
        },
      });
      instance.addSource("radius-selection", { type: "geojson", data: empty });
      instance.addLayer({
        id: "radius-fill",
        type: "fill",
        source: "radius-selection",
        paint: { "fill-color": "#167e91", "fill-opacity": 0.1 },
      });
      instance.addSource("crime-density", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      instance.addLayer({
        id: "crime-heatmap",
        type: "heatmap",
        source: "crime-density",
        paint: {
          "heatmap-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            19,
            6,
            28,
            9,
            38,
          ],
          "heatmap-intensity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            1.4,
            8.5,
            2,
          ],
          "heatmap-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            6.5,
            0.95,
            8.5,
            0,
          ],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(232,189,121,0)",
            0.12,
            "rgba(232,189,121,0.5)",
            0.3,
            "#e8bd79",
            0.5,
            "#d9903d",
            0.7,
            "#c56330",
            0.85,
            "#a83d35",
            1,
            "#692c42",
          ],
        },
      });
      instance.addLayer({
        id: "crime-cells",
        type: "circle",
        source: "crime-density",
        minzoom: 6.5,
        paint: {
          "circle-color": densityCountColor,
          "circle-opacity": densityFade,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
          "circle-stroke-opacity": densityFade,
        },
      });
      const cellContent = (records: number) => {
        const wrapper = document.createElement("div");
        wrapper.className = "density-popup";
        const label = document.createElement("span");
        label.className = "density-popup-label";
        label.textContent = `CELDA AGREGADA · ${formatMapDistance(latest.current.densityGridMetres)} por lado`;
        const count = document.createElement("strong");
        count.textContent = records.toLocaleString("es-PE");
        const unit = document.createElement("span");
        unit.textContent = " registros en celda agregada";
        const period = document.createElement("p");
        period.textContent = latest.current.periodLabel;
        const note = document.createElement("small");
        note.textContent =
          "No es una ubicación individual ni un límite de riesgo.";
        wrapper.append(label, count, unit, period, note);
        return wrapper;
      };
      instance.on("mousemove", "crime-cells", (event) => {
        if (
          latest.current.onRadiusPick ||
          !latest.current.concentration ||
          instance.getZoom() < 7.5
        )
          return;
        instance.getCanvas().style.cursor = "pointer";
        hover.current ??= new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          className: "density-map-popup",
        });
        hover.current
          .setLngLat(event.lngLat)
          .setDOMContent(
            cellContent(Number(event.features?.[0]?.properties?.records ?? 0)),
          )
          .addTo(instance);
      });
      instance.on("mouseleave", "crime-cells", () => {
        instance.getCanvas().style.cursor = "";
        hover.current?.remove();
      });
      instance.on("click", "crime-cells", (event) => {
        if (
          latest.current.onRadiusPick ||
          !latest.current.concentration ||
          instance.getZoom() < 7.5
        )
          return;
        hover.current?.remove();
        popup.current?.remove();
        popup.current = new maplibregl.Popup({ className: "density-map-popup" })
          .setLngLat(event.lngLat)
          .setDOMContent(
            cellContent(Number(event.features?.[0]?.properties?.records ?? 0)),
          )
          .addTo(instance);
      });
      instance.addSource("police-stations", {
        type: "geojson",
        data: latest.current.stations ?? {
          type: "FeatureCollection",
          features: [],
        },
      });
      instance.addLayer({
        id: "police-stations",
        type: "circle",
        source: "police-stations",
        paint: {
          "circle-color": "#805129",
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 3, 10, 6],
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 1.5,
        },
      });
      instance.addLayer({
        id: "radius-outline",
        type: "line",
        source: "radius-selection",
        paint: {
          "line-color": "#126f82",
          "line-width": 2,
          "line-dasharray": [3, 2],
        },
      });
      instance.on("click", "police-stations", (event) => {
        if (latest.current.onRadiusPick) return;
        const id = event.features?.[0]?.properties?.id;
        const station = latest.current.stations?.features.find(
          (feature) => feature.properties.id === id,
        );
        if (!station) return;
        hover.current?.remove();
        popup.current?.remove();
        const wrapper = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = station.properties.name;
        const info = document.createElement("p");
        info.textContent = `Comisaría básica · UBIGEO ${station.properties.district}`;
        const source = document.createElement("p");
        source.textContent =
          "MININTER / PNP · Fecha de actualización no declarada. No representa el período SIDPOL.";
        wrapper.append(name, info, source);
        popup.current = new maplibregl.Popup()
          .setLngLat(event.lngLat)
          .setDOMContent(wrapper)
          .addTo(instance);
      });
      const content = (properties: AreaProperties) => {
        const wrapper = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = properties.name;
        const count = document.createElement("p");
        count.textContent =
          properties.reports === null
            ? "Sin datos para este filtro"
            : `${properties.reports.toLocaleString("es-PE")} denuncias registradas`;
        const period = document.createElement("p");
        period.textContent = latest.current.periodLabel;
        wrapper.append(name, count, period);
        if (latest.current.metric === "rate") {
          const rate = document.createElement("p");
          rate.textContent =
            properties.ratePer100k == null
              ? "Tasa no disponible: falta población compatible o registros."
              : `${properties.ratePer100k.toLocaleString("es-PE", { maximumFractionDigits: 2 })} denuncias por 100.000 habitantes · tasa mensual`;
          const population = document.createElement("p");
          population.textContent =
            properties.population == null
              ? "Población no disponible"
              : `${properties.population.toLocaleString("es-PE")} habitantes proyectados · INEI`;
          wrapper.append(rate, population);
        }
        return wrapper;
      };
      for (const layer of ["department-fill", "area-fill"]) {
        instance.on("mousemove", layer, (event) => {
          if (latest.current.onRadiusPick || !latest.current.showStatistics)
            return;
          if (
            latest.current.stations?.features.length &&
            instance.queryRenderedFeatures(event.point, {
              layers: ["police-stations"],
            }).length
          )
            return;
          const code = event.features?.[0]?.properties?.code;
          const properties = latest.current.data?.features.find(
            (f) => f.properties.code === code,
          )?.properties;
          if (!properties) return;
          instance.getCanvas().style.cursor = "pointer";
          hover.current ??= new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
          });
          hover.current
            .setLngLat(event.lngLat)
            .setDOMContent(content(properties))
            .addTo(instance);
        });
        instance.on("mouseleave", layer, () => {
          instance.getCanvas().style.cursor = "";
          hover.current?.remove();
        });
        instance.on("click", layer, (event) => {
          if (
            latest.current.onRadiusPick ||
            (!latest.current.showStatistics && !latest.current.concentration)
          )
            return;
          if (
            latest.current.concentration &&
            instance.getZoom() >= 7.5 &&
            instance.queryRenderedFeatures(event.point, {
              layers: ["crime-cells"],
            }).length
          )
            return;
          if (
            latest.current.stations?.features.length &&
            instance.queryRenderedFeatures(event.point, {
              layers: ["police-stations"],
            }).length
          )
            return;
          const code = event.features?.[0]?.properties?.code;
          const properties = latest.current.data?.features.find(
            (f) => f.properties.code === code,
          )?.properties;
          if (!properties) return;
          hover.current?.remove();
          popup.current?.remove();
          latest.current.onSelect(properties);
          if (
            properties.level === "district" &&
            latest.current.showStatistics
          ) {
            popupCode.current = properties.code;
            popup.current = new maplibregl.Popup()
              .setLngLat(event.lngLat)
              .setDOMContent(content(properties))
              .addTo(instance);
          }
        });
      }
      streets.current = createStreetBasemap(instance, (status) => {
        streetsVisible.current = status === "ready";
        setStreetStatus(status);
        paint();
      });
      void streets.current.setEnabled(streetEnabled.current);
      constrainNationalView();
      update();
      updateDensity();
      updateRadius();
      publishViewport();
      latest.current.onReady?.(true);
    });
    let observedWidth = 0;
    const observer = new ResizeObserver((entries) => {
      if (
        !entries.some(
          (entry) =>
            entry.contentRect.width > 0 && entry.contentRect.height > 0,
        )
      )
        return;
      const width = entries.find(
        (entry) => entry.contentRect.width > 0 && entry.contentRect.height > 0,
      )!.contentRect.width;
      const widthChanged =
        observedWidth > 0 && Math.abs(width - observedWidth) > 1;
      observedWidth = width;
      instance.resize();
      constrainNationalView();
      if (
        !latest.current.onRadiusPick &&
        !latest.current.radiusGeometry &&
        (!latest.current.concentration || widthChanged)
      )
        fit(true);
    });
    observer.observe(container.current);
    return () => {
      Object.values(mountedAnimations).forEach((cancel) => cancel());
      observer.disconnect();
      streets.current?.dispose();
      streets.current = null;
      popup.current?.remove();
      hover.current?.remove();
      instance.remove();
      map.current = null;
      scope.current = null;
      fittedScope.current = null;
      shown.current = null;
      opacity.current = { outside: 0, inside: 0, detail: 0, outgoing: 0 };
    };
  }, [
    constrainNationalView,
    fit,
    paint,
    publishViewport,
    update,
    updateDensity,
    updateRadius,
  ]);

  useEffect(() => {
    updateRadius();
    if (onRadiusPick) {
      popup.current?.remove();
      hover.current?.remove();
    }
  }, [radiusGeometry, onRadiusPick, updateRadius]);
  useEffect(() => {
    publishViewport();
  }, [onViewportChange, publishViewport]);
  useEffect(() => {
    void streets.current?.setEnabled(showStreets);
  }, [showStreets]);
  useEffect(() => setDensityError(false), [concentration, densityCells]);
  useEffect(() => {
    hover.current?.remove();
    hover.current = null;
  }, [concentration]);
  useEffect(() => {
    popup.current?.remove();
    hover.current?.remove();
    update();
    updateDensity();
  }, [
    data,
    periodLabel,
    metric,
    department,
    province,
    district,
    showStatistics,
    concentration,
    densityCells,
    update,
    updateDensity,
  ]);
  useEffect(() => {
    popup.current?.remove();
    setStationError(false);
    source("police-stations")?.setData(
      stations ?? { type: "FeatureCollection", features: [] },
    );
  }, [stations, source]);
  useEffect(() => {
    if (map.current?.getLayer("area-selected"))
      map.current.setFilter("area-selected", [
        "==",
        "code",
        selectedUbigeo ?? "",
      ]);
    if (selectedUbigeo !== popupCode.current) popup.current?.remove();
  }, [selectedUbigeo]);
  return (
    <>
      <div
        className="map-container"
        data-radius={Boolean(onRadiusPick)}
        data-streets={showStreets && streetStatus === "ready"}
        ref={container}
        role="region"
        aria-label="Mapa interactivo del Perú por departamentos, provincias y distritos"
      />
      {showStreets && streetStatus === "loading" && (
        <div className="street-map-status" role="status">
          Cargando calles y referencias…
        </div>
      )}
      {showStreets && streetStatus === "error" && (
        <div className="street-map-status street-map-error" role="alert">
          No se pudieron cargar las calles. El fondo sencillo y los datos siguen
          disponibles.{" "}
          <button
            type="button"
            onClick={() => {
              void streets.current?.setEnabled(true);
            }}
          >
            Reintentar calles
          </button>
        </div>
      )}
      {concentration && (
        <aside
          className="map-legend concentration-legend"
          aria-label="Leyenda de concentración"
        >
          <div className="density-legend-heading">
            <strong>
              {loading || mapDetailLoading
                ? "Actualizando agrupación…"
                : detailView
                  ? "Registros por agrupación"
                  : "Concentración relativa"}
            </strong>
            <span>{formatMapDistance(densityGridMetres)} por lado</span>
          </div>
          {!loading &&
          !mapDetailLoading &&
          detailView &&
          densityCells.length > 0 ? (
            <div className="density-count-scale">
              {scaleCounts.map((count) => (
                <span key={count}>
                  <i
                    aria-hidden="true"
                    style={{
                      width: densityRadius(count, maximum, mapZoom) * 2,
                      height: densityRadius(count, maximum, mapZoom) * 2,
                      background: densityColor(count),
                    }}
                  />
                  <b>{count.toLocaleString("es-PE")}</b>
                </span>
              ))}
            </div>
          ) : !loading && !mapDetailLoading && !detailView ? (
            <div className="density-intensity-scale">
              <i className="density-scale" aria-hidden="true" />
              <div>
                <span>Menor</span>
                <span>Mayor</span>
              </div>
            </div>
          ) : null}
          <p>
            {loading || mapDetailLoading
              ? "Cargando el detalle de esta vista…"
              : mapDetailError
                ? "No se pudo cargar el detalle. Reintenta desde el control del mapa."
                : densityCells.length === 0
                  ? "Sin agrupaciones visibles con el umbral de esta vista."
                  : detailView
                    ? "Color por cantidad; tamaño según conteo y zoom, sin representar un radio geográfico. Toca o señala una celda."
                    : "Intensidad relativa al zoom y filtro. Acerca para consultar conteos."}
          </p>
          {mapSuppressedCells !== undefined &&
            !loading &&
            !mapDetailLoading && (
              <small>
                {mapSuppressedCells.toLocaleString("es-PE")} agrupaciones
                ocultas por tener menos de 5 registros.
              </small>
            )}
          {analysisRadiusMetres !== undefined && (
            <small className="radius-legend-note">
              Consulta puntual: radio {formatMapDistance(analysisRadiusMetres)}{" "}
              · contorno turquesa
            </small>
          )}
          <small>
            {locationBased
              ? "Centroides aproximados de ubicaciones agrupadas · no hechos individuales"
              : "Celdas agregadas · no ubicaciones individuales ni riesgo"}
          </small>
        </aside>
      )}
      {(loading ||
        (concentration &&
          densityCells.length > 0 &&
          !densityReady &&
          !densityError)) &&
        !moving &&
        !error && (
          <div
            className="map-loading-skeleton"
            role="status"
            aria-label="Cargando estadísticas del mapa"
          >
            <div aria-hidden="true">
              <span className="skeleton skeleton-heading" />
              <span className="skeleton skeleton-row" />
              <span className="skeleton skeleton-row" />
              <span className="skeleton skeleton-caption" />
            </div>
            <p>
              {concentration
                ? "Preparando concentración oficial…"
                : "Cargando estadísticas oficiales…"}
            </p>
          </div>
        )}
      {concentration && densityError && (
        <div role="alert" className="map-empty">
          No se pudo dibujar la concentración. Puedes consultar la tabla o
          volver a Estadísticas.
        </div>
      )}
      {stationError && (
        <div role="alert" className="map-empty">
          No se pudo dibujar la capa de comisarías. Desactívala y vuelve a
          activarla; las estadísticas siguen disponibles.
        </div>
      )}
      {error && (
        <div role="alert" className="map-empty">
          No se pudo dibujar el mapa. Comprueba que WebGL esté habilitado.
          Puedes consultar las cifras en el ranking.
        </div>
      )}
    </>
  );
}
