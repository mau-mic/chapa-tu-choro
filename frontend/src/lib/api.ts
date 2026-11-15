import { ApiRequestError } from "./apiError";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

export interface Period {
  year: number;
  month: number;
}
export interface ImportSource {
  kind: string;
  name: string;
  sha256: string;
  importedAt: string;
}
export interface Metadata {
  latestPeriod: Period | null;
  totalRows: number;
  availablePeriods: Period[];
  imports: ImportSource[];
  statisticsSource: string;
  geometrySource: string;
}
export interface DistrictStatistic {
  ubigeo: string;
  district: string;
  reports: number;
}
export interface Summary {
  period: Period;
  category: string | null;
  reports: number;
  districtsWithData: number;
  districtsWithoutGeometry: number;
}
const base = import.meta.env.VITE_API_BASE_URL ?? "";
async function get<T>(
  path: string,
  signal?: AbortSignal,
  validationDetail = false,
): Promise<T> {
  const response = await fetch(`${base}${path}`, { signal });
  if (response.status === 429) {
    const seconds = Number(response.headers.get("Retry-After"));
    const error = new Error(
      `Demasiadas solicitudes. ${Number.isFinite(seconds) && seconds > 0 ? `Espera ${Math.ceil(seconds)} segundos y vuelve a intentar.` : "Espera un momento y vuelve a intentar."}`,
    );
    error.name = "RateLimitError";
    throw error;
  }
  if (!response.ok) {
    const problem =
      response.status === 400 || response.status === 404
        ? await response.json().catch(() => null)
        : null;
    const detail =
      validationDetail &&
      response.status === 400 &&
      typeof problem?.detail === "string" &&
      problem.detail.length < 500
        ? problem.detail
        : `No se pudo consultar el servidor (HTTP ${response.status}). Intenta nuevamente.`;
    throw new ApiRequestError(
      detail,
      response.status,
      typeof problem?.title === "string" ? problem.title : undefined,
    );
  }
  return (await response.json()) as T;
}
export const api = {
  populationInsights: (
    from: Period,
    to: Period,
    category: string,
    department: string,
    province: string,
    district: string,
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams({
      fromYear: String(from.year),
      fromMonth: String(from.month),
      toYear: String(to.year),
      toMonth: String(to.month),
    });
    if (category) query.set("category", category);
    if (department) query.set("department", department);
    if (province) query.set("province", province);
    if (district) query.set("district", district);
    return get<PopulationInsightsData>(
      `/api/population/insights?${query}`,
      signal,
      true,
    );
  },
  populationHistory: (
    from: Period,
    to: Period,
    category: string,
    department: string,
    province: string,
    district: string,
    compare: string[] | null,
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams({
      fromYear: String(from.year),
      fromMonth: String(from.month),
      toYear: String(to.year),
      toMonth: String(to.month),
    });
    if (category) query.set("category", category);
    if (department) query.set("department", department);
    if (province) query.set("province", province);
    if (district) query.set("district", district);
    if (compare !== null) query.set("compare", compare.join(","));
    return get<PopulationHistoryData>(
      `/api/population/history?${query}`,
      signal,
      true,
    );
  },
  exploreRates: (
    year: number,
    month: number,
    category: string,
    department: string,
    province: string,
    district: string,
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams(params(year, month, category));
    if (department) query.set("department", department);
    if (province) query.set("province", province);
    if (district) query.set("district", district);
    return get<Exploration>(`/api/explorer/rates?${query}`, signal, true);
  },
  populationComparison: (
    year: number,
    month: number,
    category: string,
    department: string,
    province: string,
    district: string,
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams(params(year, month, category));
    if (department) query.set("department", department);
    if (province) query.set("province", province);
    if (district) query.set("district", district);
    return get<PopulationComparisonData>(
      `/api/population/comparison?${query}`,
      signal,
    );
  },
  trends: (
    from: Period,
    to: Period,
    category: string,
    department: string,
    province: string,
    district: string,
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams({
      fromYear: String(from.year),
      fromMonth: String(from.month),
      toYear: String(to.year),
      toMonth: String(to.month),
    });
    if (category) query.set("category", category);
    if (department) query.set("department", department);
    if (province) query.set("province", province);
    if (district) query.set("district", district);
    return get<Trends>(`/api/trends?${query}`, signal);
  },
  explore: (
    year: number,
    month: number,
    category: string,
    department: string,
    province: string,
    district: string,
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams(params(year, month, category));
    if (department) query.set("department", department);
    if (province) query.set("province", province);
    if (district) query.set("district", district);
    return get<Exploration>(`/api/explorer?${query}`, signal);
  },
  metadata: (signal?: AbortSignal) => get<Metadata>("/api/metadata", signal),
  categories: (signal?: AbortSignal) =>
    get<string[]>("/api/categories", signal),
  topDistricts: (
    year: number,
    month: number,
    category: string,
    signal?: AbortSignal,
  ) =>
    get<DistrictStatistic[]>(
      `/api/top-districts?${params(year, month, category)}`,
      signal,
    ),
  summary: (
    year: number,
    month: number,
    category: string,
    signal?: AbortSignal,
  ) =>
    get<Summary>(
      `/api/statistics/summary?${params(year, month, category)}`,
      signal,
    ),
};
function params(year: number, month: number, category: string): string {
  const query = new URLSearchParams({
    year: String(year),
    month: String(month),
  });
  if (category) query.set("category", category);
  return query.toString();
}

export interface DistrictOption {
  code: string;
  name: string;
}

export interface PopulationComparisonData {
  year: number;
  month: number;
  level: "department" | "province" | "district";
  population: number | null;
  source: { sha256: string; sourceUrl: string; importedAt: string };
  monthly: {
    month: number;
    reports: number | null;
    ratePer100k: number | null;
    rowsWithoutPopulation: number;
  }[];
  ranking: {
    ubigeo: string;
    name: string;
    reports: number;
    population: number | null;
    ratePer100k: number | null;
  }[];
}
export interface PopulationHistoryPoint {
  period: Period;
  reports: number | null;
  population: number | null;
  ratePer100k: number | null;
  districtsWithReports: number;
  missingPopulationDistricts: number;
  missingGeometryDistricts: number;
}
export interface PopulationQuality {
  expectedDistricts: number;
  districtsWithReports: number;
  missingPopulationDistricts: number;
  missingGeometryDistricts: number;
  populationDistrictsWithoutGeometry: number;
  monthsWithReports: number;
  requestedMonths: number;
  yearsWithoutPopulation: number[];
}
export interface PopulationHistoryData {
  from: Period;
  to: Period;
  level: "department" | "province" | "district";
  source: PopulationComparisonData["source"];
  monthly: PopulationHistoryPoint[];
  territories: { code: string; name: string }[];
  series: { code: string; name: string; points: PopulationHistoryPoint[] }[];
  ranking: PopulationComparisonData["ranking"];
  quality: PopulationQuality;
}
export interface ProvinceOption {
  code: string;
  name: string;
}
export interface DepartmentOption {
  code: string;
  name: string;
}
export interface AreaStatistic {
  code: string;
  name: string;
  reports: number;
  ratePer100k?: number | null;
  population?: number | null;
}
export interface AreaProperties {
  code: string;
  name: string;
  level: "department" | "district";
  reports: number | null;
  ratePer100k?: number | null;
  population?: number | null;
}
export type AreaFeatureCollection = FeatureCollection<
  Polygon | MultiPolygon,
  AreaProperties
>;
export interface Exploration {
  period: Period;
  category: string | null;
  department: string | null;
  province: string | null;
  district: string | null;
  level: "department" | "district";
  departments: DepartmentOption[];
  provinces: ProvinceOption[];
  districts: DistrictOption[];
  summary: Summary;
  ranking: AreaStatistic[];
  map: AreaFeatureCollection;
  quality?: PopulationQuality | null;
  populationSource?: PopulationComparisonData["source"] | null;
}

export interface MonthlyTrend {
  period: Period;
  reports: number | null;
}
export interface CategoryTrend {
  category: string;
  monthly: MonthlyTrend[];
}
export interface CategoryTotal {
  category: string;
  reports: number;
}
export interface TrendsMetrics {
  totalReports: number | null;
  monthsWithData: number;
  requestedMonths: number;
  currentMonthReports: number | null;
  previousMonthReports: number | null;
  previousYearMonthReports: number | null;
  monthlyChangePercent: number | null;
  yearlyChangePercent: number | null;
}
export interface Trends {
  from: Period;
  to: Period;
  category: string | null;
  department: string | null;
  province: string | null;
  district: string | null;
  comparisonLevel: "department" | "province" | "district";
  departments: DepartmentOption[];
  provinces: ProvinceOption[];
  districts: DistrictOption[];
  metrics: TrendsMetrics;
  monthly: MonthlyTrend[];
  categories: CategoryTotal[];
  territories: AreaStatistic[];
  categorySeries: CategoryTrend[];
}

export interface GeographicTrendsData {
  data: Trends;
  countingUnit: string;
  countScope: string;
  latestPeriod: Period | null;
  imports: ConcentrationOption[];
}
export interface ConcentrationOption {
  year: number;
  month: number;
  category: string;
  label: string;
  source: string;
  importedAt: string;
}
export interface ConcentrationMetadata {
  setupRequired: boolean;
  available: ConcentrationOption[];
}
export interface DensityCell {
  id: string;
  longitude: number;
  latitude: number;
  records: number;
}
export interface ConcentrationData {
  spatialDetailAvailable?: boolean;
  selection: ConcentrationOption;
  sourceRecords: number;
  mappedRecords: number;
  visibleRecords: number;
  cells: DensityCell[];
  ranking: {
    code: string;
    name: string;
    sourceRecords: number;
    mappedRecords: number;
    sidpolReports: number | null;
  }[];
  quality?: {
    sourceRows: number;
    distinctSourceIdentifiers: number | null;
    ingestionChecks: Record<string, unknown>;
  };
  monthly: MonthlyTrend[];
  gridMetres: number;
  minimumCellRecords: number;
  countingUnit: string;
  comparisonNote: string;
}
export interface RadiusAnalysisData {
  selection: ConcentrationOption;
  longitude: number;
  latitude: number;
  radiusMetres: number;
  records: number | null;
  suppressed: boolean;
  minimumRecords: number;
  area: Polygon;
  countingUnit: string;
  accuracyNote: string;
}
export interface MapCellsData {
  selection: ConcentrationOption;
  gridMetres: number;
  minimumCellRecords: number;
  cells: DensityCell[];
  visibleRecords: number;
  suppressedCells: number;
  coverage: import("./mapViewport").MapBounds;
}
export const concentrationApi = {
  trends: (
    year: number,
    fromMonth: number,
    toMonth: number,
    category: string,
    department: string,
    province: string,
    district: string,
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams({
      year: String(year),
      fromMonth: String(fromMonth),
      toMonth: String(toMonth),
      category,
    });
    if (department) query.set("department", department);
    if (province) query.set("province", province);
    if (district) query.set("district", district);
    return get<GeographicTrendsData>(
      `/api/concentration/trends?${query}`,
      signal,
      true,
    );
  },
  cells: (
    selection: ConcentrationOption,
    gridMetres: number,
    bounds: import("./mapViewport").MapBounds,
    department: string,
    province: string,
    district: string,
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams({
      year: String(selection.year),
      month: String(selection.month),
      category: selection.category,
      gridMetres: String(gridMetres),
      west: String(bounds.west),
      south: String(bounds.south),
      east: String(bounds.east),
      north: String(bounds.north),
    });
    if (department) query.set("department", department);
    if (province) query.set("province", province);
    if (district) query.set("district", district);
    return get<MapCellsData>(`/api/concentration/cells?${query}`, signal, true);
  },
  radius: (
    selection: ConcentrationOption,
    longitude: number,
    latitude: number,
    radiusMetres: number,
    department: string,
    province: string,
    district: string,
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams({
      year: String(selection.year),
      month: String(selection.month),
      category: selection.category,
      longitude: String(longitude),
      latitude: String(latitude),
      radiusMetres: String(radiusMetres),
    });
    if (department) query.set("department", department);
    if (province) query.set("province", province);
    if (district) query.set("district", district);
    return get<RadiusAnalysisData>(
      `/api/concentration/radius?${query}`,
      signal,
    );
  },
  metadata: (signal?: AbortSignal) =>
    get<ConcentrationMetadata>("/api/concentration/metadata", signal),
  query: (
    year: number,
    month: number,
    category: string,
    department: string,
    province: string,
    district: string,
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams({
      year: String(year),
      month: String(month),
      category,
    });
    if (department) query.set("department", department);
    if (province) query.set("province", province);
    if (district) query.set("district", district);
    return get<ConcentrationData>(`/api/concentration?${query}`, signal);
  },
};

export interface PopulationAverage {
  reports: number | null;
  ratePer100k: number | null;
  reportObservations: number;
  rateObservations: number;
  requiredObservations: number;
}
export interface PopulationInsightValues {
  reports: number | null;
  population: number | null;
  ratePer100k: number | null;
  rolling3: PopulationAverage;
  rolling12: PopulationAverage;
  historicalBaseline: PopulationAverage;
  seasonalBaseline: PopulationAverage;
  historicalChange: {
    reportsPercent: number | null;
    ratePercent: number | null;
  };
  seasonalChange: { reportsPercent: number | null; ratePercent: number | null };
}
export interface PopulationInsightsData {
  from: Period;
  to: Period;
  scopeCode: string;
  source: PopulationComparisonData["source"];
  lookbackMonths: number;
  monthly: {
    period: Period;
    scope: PopulationInsightValues;
    national: PopulationInsightValues;
    nationalDifferencePer100k: number | null;
    nationalDifferencePercent: number | null;
  }[];
}
