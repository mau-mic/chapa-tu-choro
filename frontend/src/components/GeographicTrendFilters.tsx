import type { useGeographicTrends } from "../hooks/useGeographicTrends";
const monthName = (month: number) =>
  new Intl.DateTimeFormat("es-PE", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2026, month - 1, 1)),
  );
export function GeographicTrendFilters({
  state,
}: {
  state: ReturnType<typeof useGeographicTrends>;
}) {
  return (
    <>
      <label className="full-row">
        Publicación anual
        <select
          value={state.year ?? ""}
          disabled={!state.years.length}
          onChange={(e) => state.setYear(Number(e.target.value))}
        >
          {!state.years.length && <option value="">Sin datos</option>}
          {state.years.map((year) => (
            <option key={year}>{year}</option>
          ))}
        </select>
      </label>
      <label className="full-row">
        Categoría de la fuente geográfica
        <select
          value={state.category}
          disabled={!state.categoryOptions.length}
          onChange={(e) => state.setCategory(e.target.value)}
        >
          {state.categoryOptions.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Mes inicial
        <select
          value={state.fromMonth}
          onChange={(e) => state.setFromMonth(Number(e.target.value))}
        >
          {state.months.map((month) => (
            <option key={month} value={month}>
              {monthName(month)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Mes final
        <select
          value={state.toMonth}
          onChange={(e) => state.setToMonth(Number(e.target.value))}
        >
          {state.months.map((month) => (
            <option key={month} value={month}>
              {monthName(month)}
            </option>
          ))}
        </select>
      </label>
      <p className="method-note full-row">
        Cada año se analiza como una publicación separada.{" "}
        {state.year === 2025
          ? "En 2025 se consulta un archivo por categoría; no se suman los archivos."
          : "El total de 2026 procede de una sola fuente; sus modalidades se desglosan sin sumar el total nuevamente."}
      </p>
    </>
  );
}
