import { useEffect, useMemo, useState } from "react";
import {
  concentrationApi,
  type ConcentrationData,
  type MapCellsData,
} from "../lib/api";
import {
  containsViewport,
  mapGridSize,
  peruBounds,
  type MapBounds,
  type MapGridSetting,
  type MapViewport,
} from "../lib/mapViewport";
type Request = {
  context: string;
  key: string;
  grid: number;
  bounds: MapBounds;
};
export function useConcentrationMap(
  enabled: boolean,
  snapshot: ConcentrationData | null,
  viewport: MapViewport | null,
  department: string,
  province: string,
  district: string,
) {
  const [setting, setSetting] = useState<MapGridSetting>("auto"),
    [attempt, setAttempt] = useState(0);
  const providedSelection = snapshot?.selection;
  const available = Boolean(snapshot?.spatialDetailAvailable);
  const { year, month, category, label, source, importedAt } =
    providedSelection ?? {};
  const selection = useMemo(
    () =>
      year !== undefined &&
      month !== undefined &&
      category !== undefined &&
      label !== undefined &&
      source !== undefined &&
      importedAt !== undefined
        ? { year, month, category, label, source, importedAt }
        : null,
    [year, month, category, label, source, importedAt],
  );
  const context = selection
    ? `${selection.year}/${selection.month}/${selection.category}/${selection.importedAt}/${department}/${province}/${district}`
    : "";
  const gridMetres = mapGridSize(viewport?.zoom ?? 4.5, setting);
  const { west, south, east, north } = viewport ?? {};
  const bounds = useMemo(
    () =>
      west !== undefined &&
      south !== undefined &&
      east !== undefined &&
      north !== undefined
        ? peruBounds({ west, south, east, north })
        : null,
    [west, south, east, north],
  );
  const [request, setRequest] = useState<Request | null>(null);
  const [result, setResult] = useState<{
    key: string;
    data: MapCellsData;
  } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const coverage =
    result?.key === request?.key ? result?.data.coverage : request?.bounds;
  const current = Boolean(
    enabled &&
    available &&
    bounds &&
    request?.context === context &&
    request.grid === gridMetres &&
    coverage &&
    containsViewport(coverage, bounds),
  );
  useEffect(() => {
    if (
      !enabled ||
      !available ||
      !bounds ||
      current ||
      west === undefined ||
      south === undefined ||
      east === undefined ||
      north === undefined
    )
      return;
    const padded = peruBounds({ west, south, east, north }, 0.25);
    if (!padded) return;
    const timer = setTimeout(
      () =>
        setRequest({
          context,
          grid: gridMetres,
          bounds: padded,
          key: `${context}/${gridMetres}/${padded.west}/${padded.south}/${padded.east}/${padded.north}`,
        }),
      300,
    );
    return () => clearTimeout(timer);
  }, [
    enabled,
    available,
    context,
    gridMetres,
    west,
    south,
    east,
    north,
    current,
    bounds,
  ]);
  const key = current && request ? `${request.key}/${attempt}` : "";
  useEffect(() => {
    if (!key || !request || !selection) return;
    setFailure(null);
    const c = new AbortController();
    const timer = setTimeout(() => {
      setFailure({
        key,
        message: "El detalle del mapa demoró demasiado. Intenta nuevamente.",
      });
      c.abort();
    }, 25000);
    concentrationApi
      .cells(
        selection,
        request.grid,
        request.bounds,
        department,
        province,
        district,
        c.signal,
      )
      .then((data) => {
        if (!c.signal.aborted) setResult({ key: request.key, data });
      })
      .catch((error) => {
        if (!c.signal.aborted) setFailure({ key, message: error.message });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [key, request, selection, department, province, district]);
  const error = key && failure?.key === key ? failure.message : null;
  const data =
    current && request && result?.key === request.key ? result.data : null;
  return {
    awaitingSnapshot: enabled && !snapshot,
    setting,
    setSetting,
    gridMetres,
    data,
    error,
    available,
    outsideCoverage: Boolean(viewport && !bounds),
    loading: Boolean(enabled && available && bounds && !data && !error),
    retry: () => {
      setResult(null);
      setAttempt((value) => value + 1);
    },
  };
}
