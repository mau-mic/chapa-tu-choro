import { useEffect, useMemo, useState } from "react";
import {
  loadPoliceStations,
  scopeStations,
  type StationSnapshot,
} from "../lib/policeStations";
export function usePoliceStations(
  enabled: boolean,
  department: string,
  province: string,
  district: string,
) {
  const [snapshot, setSnapshot] = useState<StationSnapshot | null>(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let timedOut = false,
      active = true;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 20_000);
    setSnapshot(null);
    setError(null);
    setLoading(true);
    loadPoliceStations(controller.signal)
      .then((result) => {
        if (active && !controller.signal.aborted) setSnapshot(result);
      })
      .catch(() => {
        if (active && (!controller.signal.aborted || timedOut))
          setError(
            timedOut
              ? "El servicio de comisarías tardó demasiado. Puedes reintentar."
              : "No se pudo cargar la capa oficial de comisarías. SIDPOL sigue disponible.",
          );
      })
      .finally(() => {
        clearTimeout(timer);
        if (active && (!controller.signal.aborted || timedOut))
          setLoading(false);
      });
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, attempt]);
  const data = useMemo(
    () =>
      enabled && snapshot
        ? scopeStations(snapshot.data, department, province, district)
        : null,
    [enabled, snapshot, department, province, district],
  );
  return {
    data,
    loading: enabled && loading,
    error: enabled ? error : null,
    fetchedAt: enabled ? snapshot?.fetchedAt : null,
    retry: () => setAttempt((value) => value + 1),
  };
}
