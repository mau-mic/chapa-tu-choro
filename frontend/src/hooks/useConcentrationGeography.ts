import { useEffect, useState } from "react";
import { api, type Exploration } from "../lib/api";

// The explorer can return INEI boundaries/options even when monthly_reports is empty.
// Only its geography is consumed here; its CSV counts never enter concentration.
export function useConcentrationGeography(
  enabled: boolean,
  selection: string,
  department: string,
  province: string,
  district: string,
) {
  const [data, setData] = useState<{ key: string; value: Exploration } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [year, month] = selection.split("/").map(Number);
  const key = `${year}/${month}/${department}/${province}/${district}/${attempt}`;
  useEffect(() => {
    if (!enabled || !year || !month) return;
    const controller = new AbortController();
    setError(null);
    api
      .explore(
        year,
        month,
        "",
        department,
        province,
        district,
        controller.signal,
      )
      .then((value) => {
        if (!controller.signal.aborted) setData({ key, value });
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "No se pudieron cargar los límites geográficos.",
          );
      });
    return () => controller.abort();
  }, [enabled, year, month, department, province, district, key]);
  return {
    data: enabled && data?.key === key ? data.value : null,
    loading: enabled && Boolean(year && month && data?.key !== key && !error),
    error: enabled ? error : null,
    retry: () => setAttempt((value) => value + 1),
  };
}
