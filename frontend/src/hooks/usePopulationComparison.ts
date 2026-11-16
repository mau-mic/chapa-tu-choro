import { useEffect, useState } from "react";
import { api, type PopulationComparisonData } from "../lib/api";

export function usePopulationComparison(
  year: number | undefined,
  month: number | undefined,
  department: string,
  province: string,
  district: string,
  category: string,
) {
  const key = `${year}/${month}/${department}/${province}/${district}/${category}`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    data: PopulationComparisonData | null;
    error: string | null;
    loading: boolean;
  }>({ key: "", data: null, error: null, loading: false });
  useEffect(() => {
    if (!year || !month) return;
    const controller = new AbortController();
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 20000);
    setState({ key, data: null, error: null, loading: true });
    api
      .populationComparison(
        year,
        month,
        category,
        department,
        province,
        district,
        controller.signal,
      )
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ key, data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted || timedOut)
          setState({
            key,
            data: null,
            loading: false,
            error: timedOut
              ? "La consulta tardó demasiado. Vuelve a intentarlo."
              : error instanceof Error
                ? error.message
                : "No se pudo cargar la comparación.",
          });
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key, year, month, category, department, province, district, attempt]);
  return {
    data: state.key === key ? state.data : null,
    error: state.key === key ? state.error : null,
    loading: Boolean(year && month && (state.key !== key || state.loading)),
    retry: () => setAttempt((value) => value + 1),
  };
}
