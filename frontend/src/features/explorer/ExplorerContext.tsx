import { usePopulationInsights } from "../../hooks/usePopulationInsights";
import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { useStatistics } from "../../hooks/useStatistics";
import { useGeographicTrends } from "../../hooks/useGeographicTrends";
import { useConcentration } from "../../hooks/useConcentration";
import { useConcentrationGeography } from "../../hooks/useConcentrationGeography";
import { useConcentrationMap } from "../../hooks/useConcentrationMap";
import { useRadiusAnalysis } from "../../hooks/useRadiusAnalysis";
import { usePoliceStations } from "../../hooks/usePoliceStations";
import { usePopulationHistory } from "../../hooks/usePopulationHistory";
import type { AreaProperties } from "../../lib/api";
import type { MapViewport } from "../../lib/mapViewport";
import type { View } from "../../lib/navigation";
import { months } from "../../lib/calendar";

function useExplorerController(view: View) {
  const [showStatistics, setShowStatistics] = useState(true);
  const [mapMode, setMapMode] = useState<"statistics" | "concentration">(
    "statistics",
  );
  const [showStations, setShowStations] = useState(false);
  const [showStreets, setShowStreets] = useState(true);
  const [trendSource, setTrendSource] = useState<"reports" | "geographic">(
    "reports",
  );
  const geographicTrends = view === "trends" && trendSource === "geographic";
  const state = useStatistics(view, !geographicTrends);
  const [mapModuleReady, setMapModuleReady] = useState(false);
  const [trendsModuleReady, setTrendsModuleReady] = useState(false);
  const [populationModuleReady, setPopulationModuleReady] = useState(false);
  const [revealed, setRevealed] = useState({
    map: false,
    trends: false,
    action: true,
  });
  const {
    metadata,
    categories,
    period,
    setPeriod,
    category,
    setCategory,
    department,
    setDepartment,
    departments,
    province,
    setProvince,
    provinces,
    district,
    setDistrict,
    districts,
    ranking,
    mapData: statisticsMapData,
    summary,
    loading,
    error,
  } = state;
  const comparisonScope = `${department}/${province}/${district}`;
  const [comparisonSelection, setComparisonSelection] = useState<{
    scope: string;
    codes: string[] | null;
  }>({ scope: "", codes: null });
  const compared =
    comparisonSelection.scope === comparisonScope
      ? comparisonSelection.codes
      : null;
  const setCompared = (codes: string[] | null) =>
    setComparisonSelection({ scope: comparisonScope, codes });
  const populationHistory = usePopulationHistory(
    view === "trends" && !geographicTrends,
    state.trendRange?.from,
    state.trendRange?.to,
    category,
    department,
    province,
    district,
    compared,
  );
  const populationInsights = usePopulationInsights(
    view === "trends" && !geographicTrends,
    state.trendRange?.from,
    state.trendRange?.to,
    category,
    department,
    province,
    district,
  );
  const geographic = useGeographicTrends(
    geographicTrends,
    department,
    province,
    district,
  );
  const [mapViewport, setMapViewport] = useState<MapViewport | null>(null);
  const density = useConcentration(
    view === "map" && mapMode === "concentration",
    department,
    province,
    district,
  );
  const independentGeography = useConcentrationGeography(
    view === "map" &&
      mapMode === "concentration" &&
      (!period || Boolean(error)),
    density.selection,
    department,
    province,
    district,
  );
  const mapData = independentGeography.data?.map ?? statisticsMapData;
  const filterDepartments = geographicTrends
    ? geographic.departments
    : (independentGeography.data?.departments ?? departments);
  const filterProvinces = geographicTrends
    ? geographic.provinces
    : (independentGeography.data?.provinces ?? provinces);
  const filterDistricts = geographicTrends
    ? geographic.districts
    : (independentGeography.data?.districts ?? districts);
  const detail = useConcentrationMap(
    view === "map" && mapMode === "concentration",
    density.data,
    mapViewport,
    department,
    province,
    district,
  );
  const mapCells = density.data?.spatialDetailAvailable
    ? (detail.data?.cells ?? [])
    : (density.data?.cells ?? []);
  const mapGridMetres = density.data?.spatialDetailAvailable
    ? (detail.data?.gridMetres ?? detail.gridMetres)
    : (density.data?.gridMetres ?? 10000);
  const radius = useRadiusAnalysis(
    view === "map" && mapMode === "concentration",
    Boolean(density.data?.spatialDetailAvailable),
    density.data?.selection ?? null,
    department,
    province,
    district,
  );
  const stations = usePoliceStations(
    showStations && view === "map",
    department,
    province,
    district,
  );
  const [mapVisited, setMapVisited] = useState(view === "map");
  useEffect(() => {
    if (view === "map") setMapVisited(true);
  }, [view]);
  const [selection, setSelection] = useState<AreaProperties | null>(null);
  const [mobilePanel, setMobilePanel] = useState(false);
  const years = [
    ...new Set(metadata?.availablePeriods.map((p) => p.year) ?? []),
  ];
  const periodLabel = period
    ? `${months[period.month - 1]} ${period.year}`
    : "Sin período disponible";
  const max = Math.max(1, ...ranking.map((item) => item.reports));
  const dataSettled =
    view === "map"
      ? !loading || Boolean(error)
      : geographicTrends
        ? !geographic.loading || Boolean(geographic.error)
        : Boolean(error) ||
          (!loading &&
            (!populationInsights.loading ||
              Boolean(populationInsights.error) ||
              !state.trendRange) &&
            (!populationHistory.loading ||
              Boolean(populationHistory.error) ||
              !state.trendRange));
  const modulesReady =
    view === "map"
      ? mapModuleReady || Boolean(error)
      : trendsModuleReady &&
        (geographicTrends ||
          populationModuleReady ||
          Boolean(error) ||
          !metadata);
  const settled = view === "action" || (dataSettled && modulesReady);
  useEffect(() => {
    if (settled)
      setRevealed((previous) =>
        previous[view] ? previous : { ...previous, [view]: true },
      );
  }, [settled, view]);
  const initialLoading = !revealed[view] && !settled;
  // Store only identity; displayed count always comes from the currently loaded response.
  const departmentName = filterDepartments.find(
    (item) => item.code === department,
  )?.name;
  const districtName = filterDistricts.find(
    (item) => item.code === district,
  )?.name;
  const provinceName = filterProvinces.find(
    (item) => item.code === province,
  )?.name;
  const chooseArea = (area: AreaProperties) => {
    if (area.level === "department") {
      setSelection(null);
      setDepartment(area.code);
    } else {
      setSelection(area);
      setDistrict(area.code);
    }
  };
  const selectedCode = district || selection?.code;
  const selected =
    selectedCode && !loading && !error
      ? (mapData?.features.find((f) => f.properties.code === selectedCode)
          ?.properties ?? ranking.find((item) => item.code === selectedCode))
      : null;

  return {
    initialLoading,
    setMapModuleReady,
    setTrendsModuleReady,
    setPopulationModuleReady,
    populationHistory,
    populationInsights,
    compared,
    setCompared,
    view,
    showStatistics,
    setShowStatistics,
    mapMode,
    setMapMode,
    showStations,
    setShowStations,
    showStreets,
    setShowStreets,
    trendSource,
    setTrendSource,
    geographicTrends,
    state,
    metadata,
    categories,
    period,
    setPeriod,
    category,
    setCategory,
    department,
    setDepartment,
    departments,
    province,
    setProvince,
    provinces,
    district,
    setDistrict,
    districts,
    ranking,
    mapData,
    summary,
    loading,
    error,
    geographic,
    independentGeography,
    filterDepartments,
    filterProvinces,
    filterDistricts,
    mapViewport,
    setMapViewport,
    density,
    detail,
    mapCells,
    mapGridMetres,
    radius,
    stations,
    selection,
    setSelection,
    mobilePanel,
    setMobilePanel,
    years,
    periodLabel,
    max,
    departmentName,
    districtName,
    provinceName,
    chooseArea,
    selectedCode,
    selected,
    mapVisited,
  };
}

export type ExplorerModel = ReturnType<typeof useExplorerController>;
const ExplorerContext = createContext<ExplorerModel | null>(null);
export function ExplorerProvider({
  view,
  children,
}: {
  view: View;
  children: ReactNode;
}) {
  const model = useExplorerController(view);
  return <ExplorerContext value={model}>{children}</ExplorerContext>;
}
export function useExplorer() {
  const model = use(ExplorerContext);
  if (!model) throw new Error("Explorer components require ExplorerProvider");
  return model;
}
