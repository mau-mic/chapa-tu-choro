import { ApiRequestError } from "../lib/apiError";
import { useEffect, useState } from "react";
import { api, type Period, type PopulationHistoryData } from "../lib/api";

export function usePopulationHistory(
  enabled: boolean,
  from: Period | undefined,
  to: Period | undefined,
  category: string,
  department: string,
  province: string,
  district: string,
  compare: string[] | null,
) {
  const base = `${from?.year}/${from?.month}/${to?.year}/${to?.month}/${category}/${department}/${province}/${district}`;
  const selection = compare === null ? "auto" : compare.join(",");
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    base: string;
    selection: string;
    data: PopulationHistoryData | null;
    error: string | null;
    loading: boolean;
    empty: boolean;
  }>({
    base: "",
    selection: "",
    data: null,
    error: null,
    loading: false,
    empty: false,
  });
  const fy = from?.year,
    fm = from?.month,
    ty = to?.year,
    tm = to?.month;
  useEffect(() => {
    if (!enabled || !fy || !fm || !ty || !tm) return;
    const controller = new AbortController();
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 20000);
    setState((previous) => ({
      base,
      selection,
      data: previous.base === base ? previous.data : null,
      error: null,
      loading: true,
      empty: false,
    }));
    Promise.resolve()
      .then(() =>
        api.populationHistory(
          { year: fy, month: fm },
          { year: ty, month: tm },
          category,
          department,
          province,
          district,
          selection === "auto" ? null : selection ? selection.split(",") : [],
          controller.signal,
        ),
      )
      .then((data) => {
        if (!controller.signal.aborted)
          setState({
            base,
            selection,
            data,
            error: null,
            loading: false,
            empty: false,
          });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted || timedOut) {
          const empty =
            error instanceof ApiRequestError &&
            error.status === 404 &&
            error.code === "population.unavailable";
          setState((previous) => ({
            ...previous,
            base,
            selection,
            loading: false,
            empty,
            data: empty ? null : previous.data,
            error: empty
              ? null
              : timedOut
                ? "La consulta tardó demasiado. Vuelve a intentarlo."
                : error instanceof Error
                  ? error.message
                  : "No se pudo cargar el histórico de tasas.",
          }));
        }
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    enabled,
    base,
    selection,
    fy,
    fm,
    ty,
    tm,
    category,
    department,
    province,
    district,
    attempt,
  ]);
  const current = state.base === base;
  return {
    data: enabled && current ? state.data : null,
    empty: enabled && current && state.empty,
    error: enabled && current ? state.error : null,
    loading:
      enabled &&
      Boolean(from && to) &&
      (!current || state.selection !== selection || state.loading),
    retry: () => setAttempt((value) => value + 1),
  };
}
