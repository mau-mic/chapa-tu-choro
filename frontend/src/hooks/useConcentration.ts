import { useEffect, useState } from "react";
import {
  concentrationApi,
  type ConcentrationMetadata,
  type ConcentrationData,
} from "../lib/api";
export function useConcentration(
  enabled: boolean,
  department: string,
  province: string,
  district: string,
) {
  const [metadata, setMetadata] = useState<ConcentrationMetadata | null>(null),
    [selection, setSelection] = useState("");
  const [data, setData] = useState<ConcentrationData | null>(null),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [attempt, setAttempt] = useState(0);
  const key = `${selection}/${department}/${province}/${district}/${attempt}`;
  const [loaded, setLoaded] = useState("");
  useEffect(() => {
    if (!enabled) return;
    const c = new AbortController();
    setError(null);
    setLoading(true);
    concentrationApi
      .metadata(c.signal)
      .then((meta) => {
        if (!c.signal.aborted) {
          setMetadata(meta);
          setSelection((previous) =>
            meta.available.some(
              (o) => `${o.year}/${o.month}/${o.category}` === previous,
            )
              ? previous
              : meta.available.length
                ? `${meta.available[0].year}/${meta.available[0].month}/${meta.available[0].category}`
                : "",
          );
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => c.abort();
  }, [enabled, attempt]);
  useEffect(() => {
    if (
      !enabled ||
      !selection ||
      !metadata?.available.some(
        (o) => `${o.year}/${o.month}/${o.category}` === selection,
      )
    )
      return;
    const c = new AbortController();
    const [year, month, category] = selection.split("/");
    setData(null);
    setLoading(true);
    setError(null);
    concentrationApi
      .query(
        Number(year),
        Number(month),
        category,
        department,
        province,
        district,
        c.signal,
      )
      .then((result) => {
        if (!c.signal.aborted) {
          setData(result);
          setLoaded(key);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [
    enabled,
    selection,
    department,
    province,
    district,
    attempt,
    metadata,
    key,
  ]);
  return {
    metadata,
    selection,
    setSelection,
    data: enabled && loaded === key ? data : null,
    error,
    loading:
      enabled && (loading || Boolean(selection && loaded !== key && !error)),
    retry: () => setAttempt((x) => x + 1),
  };
}
