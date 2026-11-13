import { useEffect, useState } from "react";
import { api, type Period, type PopulationInsightsData } from "../lib/api";
import { ApiRequestError } from "../lib/apiError";

export function usePopulationInsights(
  enabled: boolean,
  from: Period | undefined,
  to: Period | undefined,
  category: string,
  department: string,
  province: string,
  district: string,
) {
  const fy = from?.year,
    fm = from?.month,
    ty = to?.year,
    tm = to?.month;
  const key = `${fy}/${fm}/${ty}/${tm}/${category}/${department}/${province}/${district}`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    data: PopulationInsightsData | null;
    error: string | null;
    loading: boolean;
  }>({ key: "", data: null, error: null, loading: false });
  useEffect(() => {
    if (!enabled || !fy || !fm || !ty || !tm) return;
    const controller = new AbortController();
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 20000);
    setState({ key, data: null, error: null, loading: true });
    Promise.resolve()
      .then(() =>
        api.populationInsights(
          { year: fy, month: fm },
          { year: ty, month: tm },
          category,
          department,
          province,
          district,
          controller.signal,
        ),
      )
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ key, data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted && !timedOut) return;
        const empty =
          error instanceof ApiRequestError &&
          error.status === 404 &&
          error.code === "population.unavailable";
        setState({
          key,
          data: null,
          loading: false,
          error: empty
            ? null
            : timedOut
              ? "La consulta tardó demasiado. Vuelve a intentarlo."
              : error instanceof Error
                ? error.message
                : "No se pudo cargar el análisis histórico.",
        });
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    enabled,
    fy,
    fm,
    ty,
    tm,
    category,
    department,
    province,
    district,
    key,
    attempt,
  ]);
  const current = state.key === key;
  return {
    data: enabled && current ? state.data : null,
    error: enabled && current ? state.error : null,
    loading: enabled && Boolean(from && to) && (!current || state.loading),
    retry: () => setAttempt((n) => n + 1),
  };
}
export type PopulationInsightsState = ReturnType<typeof usePopulationInsights>;
