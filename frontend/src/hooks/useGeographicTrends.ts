import { useEffect, useState } from "react";
import {
  concentrationApi,
  type ConcentrationMetadata,
  type GeographicTrendsData,
  type DepartmentOption,
  type ProvinceOption,
  type DistrictOption,
} from "../lib/api";
export function useGeographicTrends(
  enabled: boolean,
  department: string,
  province: string,
  district: string,
) {
  const [metadata, setMetadata] = useState<ConcentrationMetadata | null>(null),
    [requestedYear, setYear] = useState<number | null>(null),
    [requestedCategory, setCategory] = useState("all");
  const [requestedMonths, setMonths] = useState<{
    scope: string;
    from: number;
    to: number;
  } | null>(null);
  const [attempt, setAttempt] = useState(0),
    [catalogAttempt, setCatalogAttempt] = useState(-1),
    [pending, setPending] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    key: string;
    data: GeographicTrendsData;
  } | null>(null);
  const [options, setOptions] = useState<{
    department: string;
    province: string;
    departments: DepartmentOption[];
    provinces: ProvinceOption[];
    districts: DistrictOption[];
  }>({
    department: "",
    province: "",
    departments: [],
    provinces: [],
    districts: [],
  });
  const available = metadata?.available ?? [],
    years = [...new Set(available.map((x) => x.year))];
  const year = years.includes(requestedYear ?? 0)
    ? requestedYear!
    : (years[0] ?? null);
  const categoryOptions = [
    ...new Map(
      available
        .filter((x) => x.year === year)
        .map((x) => [x.category, x.label]),
    ).entries(),
  ];
  const category = categoryOptions.some(([key]) => key === requestedCategory)
    ? requestedCategory
    : categoryOptions.some(([key]) => key === "all")
      ? "all"
      : categoryOptions.some(([key]) => key === "robbery")
        ? "robbery"
        : (categoryOptions[0]?.[0] ?? "");
  const months = [
    ...new Set(
      available
        .filter((x) => x.year === year && x.category === category)
        .map((x) => x.month),
    ),
  ].sort((a, b) => a - b);
  const scope = `${year}/${category}`,
    min = months[0] ?? 1,
    max = months.at(-1) ?? 12;
  const fromMonth =
    requestedMonths?.scope === scope
      ? Math.min(max, Math.max(min, requestedMonths.from))
      : min;
  const toMonth =
    requestedMonths?.scope === scope
      ? Math.max(fromMonth, Math.min(max, requestedMonths.to))
      : max;
  const version = available
    .filter((x) => x.year === year && x.category === category)
    .map((x) => x.importedAt)
    .join("/");
  const key = `${scope}/${fromMonth}/${toMonth}/${department}/${province}/${district}/${version}/${attempt}`;
  useEffect(() => {
    if (!enabled) return;
    const c = new AbortController();
    setPending(true);
    setError(null);
    const timer = setTimeout(() => {
      setError(
        "La consulta del catálogo geográfico demoró demasiado. Intenta nuevamente.",
      );
      setPending(false);
      c.abort();
    }, 25000);
    concentrationApi
      .metadata(c.signal)
      .then((meta) => {
        if (!c.signal.aborted) {
          setMetadata(meta);
          setCatalogAttempt(attempt);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        clearTimeout(timer);
        if (!c.signal.aborted) setPending(false);
      });
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [enabled, attempt]);
  useEffect(() => {
    if (
      !enabled ||
      catalogAttempt !== attempt ||
      !year ||
      !category ||
      !months.length
    )
      return;
    const c = new AbortController();
    setPending(true);
    setError(null);
    const timer = setTimeout(() => {
      setError(
        "Las tendencias geográficas demoraron demasiado. Intenta nuevamente.",
      );
      setPending(false);
      c.abort();
    }, 25000);
    concentrationApi
      .trends(
        year,
        fromMonth,
        toMonth,
        category,
        department,
        province,
        district,
        c.signal,
      )
      .then((data) => {
        if (!c.signal.aborted) {
          setResult({ key, data });
          setOptions({
            department,
            province,
            departments: data.data.departments,
            provinces: data.data.provinces,
            districts: data.data.districts,
          });
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        clearTimeout(timer);
        if (!c.signal.aborted) setPending(false);
      });
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [
    enabled,
    catalogAttempt,
    key,
    attempt,
    year,
    category,
    months.length,
    fromMonth,
    toMonth,
    department,
    province,
    district,
  ]);
  return {
    metadata,
    latestPeriod: year && months.length ? { year, month: max } : null,
    years,
    year,
    setYear,
    category,
    categoryOptions,
    setCategory,
    months,
    fromMonth,
    toMonth,
    setFromMonth: (from: number) =>
      setMonths({ scope, from, to: Math.max(from, toMonth) }),
    setToMonth: (to: number) =>
      setMonths({ scope, from: Math.min(fromMonth, to), to }),
    data: enabled && result?.key === key && !error ? result.data : null,
    loading:
      enabled &&
      (pending ||
        Boolean(
          catalogAttempt === attempt && year && result?.key !== key && !error,
        )),
    error,
    departments: options.departments,
    provinces: options.department === department ? options.provinces : [],
    districts:
      options.department === department && options.province === province
        ? options.districts
        : [],
    retry: () => setAttempt((x) => x + 1),
  };
}
