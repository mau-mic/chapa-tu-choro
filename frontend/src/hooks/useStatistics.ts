import { useEffect, useState } from "react";
import {
  clampYears,
  yearBounds,
  yearPeriods,
  sharedTrendPeriod,
  type YearRange,
} from "../lib/trendYears";
import { initialStatisticsSelection } from "../lib/statisticsSelection";
import {
  api,
  type AreaFeatureCollection,
  type AreaStatistic,
  type DepartmentOption,
  type ProvinceOption,
  type DistrictOption,
  type Metadata,
  type Period,
  type Summary,
  type Trends,
  type PopulationQuality,
} from "../lib/api";

export function useStatistics(
  view: "map" | "trends" | "action" = "map",
  trendsEnabled = true,
) {
  const statisticsEnabled =
    view === "map" || (view === "trends" && trendsEnabled);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [mapMetric, setMapMetric] = useState<"count" | "rate">("count");
  const [quality, setQuality] = useState<PopulationQuality | null>(null);
  const [populationAvailable, setPopulationAvailable] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [period, setPeriod] = useState<Period | null>(
    () => initialStatisticsSelection(window.location.search).period,
  );
  const [requestedYears, setYearRange] = useState<YearRange | null>(null);
  const [requestedTrendMonth, setTrendMonth] = useState<number | null>(null);
  const bounds = yearBounds(metadata?.availablePeriods ?? []);
  const years = bounds
    ? clampYears(
        requestedYears ?? [Math.max(bounds[0], bounds[1] - 9), bounds[1]],
        bounds,
      )
    : null;
  const trendPeriod = years
    ? sharedTrendPeriod(years, metadata!.availablePeriods, requestedTrendMonth)
    : null;
  const range =
    years && trendPeriod
      ? {
          from: yearPeriods(years, metadata!.availablePeriods).from,
          to: trendPeriod,
        }
      : null;
  const trendMonths = trendPeriod
    ? Array.from({ length: 12 }, (_, i) => ({
        year: trendPeriod.year,
        month: i + 1,
      }))
    : [];
  const fromYear = range?.from.year,
    fromMonth = range?.from.month,
    toYear = range?.to.year,
    toMonth = range?.to.month;
  const [category, setCategory] = useState("");
  const [department, updateDepartment] = useState(
    () => initialStatisticsSelection(window.location.search).department,
  );
  const [province, updateProvince] = useState("");
  const [district, setDistrict] = useState("");
  const [districtOptions, setDistrictOptions] = useState<{
    scope: string;
    options: DistrictOption[];
  }>({ scope: "", options: [] });
  const setProvince = (value: string) => {
    if (value !== province) setDistrict("");
    updateProvince(value);
  };
  const [provinceOptions, setProvinceOptions] = useState<{
    department: string;
    options: ProvinceOption[];
  }>({ department: "", options: [] });
  const setDepartment = (value: string) => {
    if (value !== department) {
      updateProvince("");
      setDistrict("");
    }
    updateDepartment(value);
  };
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [ranking, setRanking] = useState<AreaStatistic[]>([]);
  const [mapData, setMapData] = useState<AreaFeatureCollection | null>(null);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");
  const filterKey = `${view}/${view === "map" ? mapMetric : "count"}/${range?.from.year}/${range?.from.month}/${range?.to.year}/${range?.to.month}/${period?.year}/${period?.month}/${category}/${department}/${province}/${district}`;
  useEffect(() => {
    if (!statisticsEnabled) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setReady(false);
    setMapData(null);
    setRanking([]);
    setSummary(null);
    setTrends(null);
    Promise.all([
      api.metadata(controller.signal),
      api.categories(controller.signal),
    ])
      .then(([meta, cats]) => {
        if (controller.signal.aborted) return;
        setMetadata(meta);
        setCategories(cats);
        setPeriod((previous) =>
          previous &&
          meta.availablePeriods.some(
            (p) => p.year === previous.year && p.month === previous.month,
          )
            ? previous
            : meta.latestPeriod,
        );
        setReady(true);
        if (!meta.latestPeriod) setLoading(false);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setError(
            error instanceof Error && error.name === "RateLimitError"
              ? error.message
              : "No se pudo cargar el catálogo de datos. Comprueba que la API esté disponible.",
          );
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [attempt, statisticsEnabled]);
  useEffect(() => {
    if (
      view === "action" ||
      (view === "trends" && !trendsEnabled) ||
      !ready ||
      !period
    )
      return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setMapData(null);
    setRanking([]);
    setSummary(null);
    setTrends(null);
    const request =
      view === "map"
        ? (mapMetric === "rate" ? api.exploreRates : api.explore)(
            period.year,
            period.month,
            category,
            department,
            province,
            district,
            controller.signal,
          )
        : api.trends(
            { year: fromYear!, month: fromMonth! },
            { year: toYear!, month: toMonth! },
            category,
            department,
            province,
            district,
            controller.signal,
          );
    request
      .then((result) => {
        if (!controller.signal.aborted) {
          if ("map" in result) {
            setRanking(result.ranking);
            setMapData(result.map);
            setSummary(result.summary);
            setQuality(result.quality ?? null);
            setPopulationAvailable(Boolean(result.populationSource));
          } else setTrends(result);
          setDepartments(result.departments);
          setProvinceOptions({
            department: result.department ?? "",
            options: result.provinces,
          });
          setDistrictOptions({
            scope: `${result.department ?? ""}/${result.province ?? ""}`,
            options: result.districts,
          });
          setLoadedKey(filterKey);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error && error.name === "RateLimitError"
              ? error.message
              : "No se pudieron cargar las estadísticas. Intenta nuevamente.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    ready,
    period,
    category,
    department,
    province,
    district,
    view,
    trendsEnabled,
    fromYear,
    fromMonth,
    toYear,
    toMonth,
    filterKey,
    mapMetric,
  ]);
  const current = ready && loadedKey === filterKey;
  return {
    mapMetric,
    setMapMetric,
    quality: current ? quality : null,
    populationAvailable: current && populationAvailable,
    trendRange: range,
    trendPeriod,
    trendMonths,
    setTrendMonth,
    yearRange: years,
    yearBounds: bounds,
    setYearRange,
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
    provinces:
      provinceOptions.department === department ? provinceOptions.options : [],
    district,
    setDistrict,
    districts:
      districtOptions.scope === `${department}/${province}`
        ? districtOptions.options
        : [],
    trends: current ? trends : null,
    ranking: current ? ranking : [],
    mapData: current ? mapData : null,
    summary: current ? summary : null,
    loading:
      view !== "action" &&
      (loading || Boolean(ready && period && !current && !error)),
    error,
    retry: () => setAttempt((value) => value + 1),
  };
}
