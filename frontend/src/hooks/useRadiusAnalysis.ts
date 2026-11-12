import { useCallback, useEffect, useMemo, useState } from "react";
import {
  concentrationApi,
  type ConcentrationOption,
  type RadiusAnalysisData,
} from "../lib/api";
export type RadiusPoint = { longitude: number; latitude: number };

export function useRadiusAnalysis(
  enabled: boolean,
  available: boolean,
  providedSelection: ConcentrationOption | null,
  department: string,
  province: string,
  district: string,
) {
  const [active, setActiveState] = useState(false),
    [radiusMetres, setRadiusMetres] = useState(1000),
    [attempt, setAttempt] = useState(0);
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
  const context = `${selection?.year}/${selection?.month}/${selection?.category}/${selection?.importedAt}/${department}/${province}/${district}`;
  const [point, setPoint] = useState<{
    context: string;
    value: RadiusPoint;
  } | null>(null);
  const [result, setResult] = useState<{
    key: string;
    value: RadiusAnalysisData;
  } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [pickFailure, setPickFailure] = useState<{
    context: string;
    message: string;
  } | null>(null);
  const center =
    enabled && available && point?.context === context ? point.value : null;
  const key =
    enabled && available && active && center && selection
      ? `${context}/${center.longitude}/${center.latitude}/${radiusMetres}/${attempt}`
      : "";
  const pick = useCallback(
    (value: RadiusPoint) => {
      if (
        !Number.isFinite(value.longitude) ||
        !Number.isFinite(value.latitude) ||
        value.longitude < -82 ||
        value.longitude > -68 ||
        value.latitude < -19 ||
        value.latitude > 1
      ) {
        setPoint(null);
        setPickFailure({
          context,
          message: "Selecciona un punto dentro del Perú.",
        });
        return;
      }
      setPickFailure(null);
      setPoint({ context, value });
    },
    [context],
  );
  const setActive = useCallback((value: boolean) => {
    setActiveState(value);
    if (!value) {
      setPoint(null);
      setPickFailure(null);
    }
  }, []);
  useEffect(() => {
    if (!key || !center || !selection) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setFailure({
        key,
        message: "La consulta demoró demasiado. Intenta nuevamente.",
      });
      controller.abort();
    }, 25000);
    concentrationApi
      .radius(
        selection,
        center.longitude,
        center.latitude,
        radiusMetres,
        department,
        province,
        district,
        controller.signal,
      )
      .then((value) => {
        if (!controller.signal.aborted) setResult({ key, value });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setFailure({ key, message: error.message });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, center, selection, radiusMetres, department, province, district]);
  const error =
    pickFailure?.context === context
      ? pickFailure.message
      : failure?.key === key
        ? failure.message
        : null;
  const data = key && result?.key === key ? result.value : null;
  return {
    active: enabled && available && active,
    setActive,
    radiusMetres,
    setRadiusMetres,
    pick,
    data,
    error,
    loading: Boolean(key && !data && !error),
    canRetry: Boolean(key),
    retry: () => setAttempt((value) => value + 1),
    clear: () => {
      setPoint(null);
      setPickFailure(null);
    },
  };
}
