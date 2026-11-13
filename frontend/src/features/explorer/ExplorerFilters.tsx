import { TerritoryField } from "./TerritoryField";
import { useExplorer } from "./ExplorerContext";
import { months } from "../../lib/calendar";
import { GeographicTrendFilters } from "../../components/GeographicTrendFilters";
import { YearRangeSlider } from "../../components/YearRangeSlider";
export function ExplorerFilters() {
  const {
    loading,
    view,
    mapMode,
    geographicTrends,
    state,
    metadata,
    categories,
    period,
    setPeriod,
    category,
    setCategory,
    department,
    setDepartment,
    province,
    setProvince,
    district,
    setDistrict,
    geographic,
    density,
    filterDepartments,
    filterProvinces,
    filterDistricts,
    setSelection,
    years,
  } = useExplorer();
  const filtersDisabled = geographicTrends
    ? !geographic.year
    : view === "map" && mapMode === "concentration"
      ? !density.selection
      : !period || (loading && !metadata);
  return (
    <fieldset className="filter-grid" disabled={filtersDisabled}>
      <legend className="sr-only">Filtrar estadísticas</legend>
      {view === "map" && mapMode === "statistics" && (
        <>
          <label>
            Año
            <select
              value={period?.year ?? ""}
              onChange={(e) => {
                const year = Number(e.target.value);
                const available =
                  metadata?.availablePeriods.filter((p) => p.year === year) ??
                  [];
                setPeriod(
                  available.find((p) => p.month === period?.month) ??
                    available[0] ??
                    null,
                );
              }}
            >
              {!period && <option value="">—</option>}
              {years.map((year) => (
                <option key={year}>{year}</option>
              ))}
            </select>
          </label>
          <label>
            Mes
            <select
              value={period?.month ?? ""}
              onChange={(e) =>
                period &&
                setPeriod({ ...period, month: Number(e.target.value) })
              }
            >
              {!period && <option value="">—</option>}
              {metadata?.availablePeriods
                .filter((p) => p.year === period?.year)
                .map((p) => (
                  <option key={p.month} value={p.month}>
                    {months[p.month - 1]}
                  </option>
                ))}
            </select>
          </label>
        </>
      )}
      {geographicTrends && <GeographicTrendFilters state={geographic} />}
      {view === "trends" &&
        !geographicTrends &&
        state.yearRange &&
        state.yearBounds && (
          <fieldset className="full-row trend-time-filter">
            <legend>Período compartido</legend>
            <YearRangeSlider
              key={state.yearBounds.join("/")}
              value={state.yearRange}
              bounds={state.yearBounds}
              onCommit={state.setYearRange}
            />
            <label>
              Mes final
              <select
                name="trend-end-month"
                value={state.trendPeriod?.month ?? ""}
                onChange={(event) =>
                  state.setTrendMonth(Number(event.target.value))
                }
                disabled={!state.trendPeriod || !state.trendMonths.length}
                aria-describedby="shared-period-help"
              >
                {!state.trendPeriod && (
                  <option value="">Sin meses disponibles</option>
                )}
                {state.trendPeriod && !state.trendMonths.length && (
                  <option value={state.trendPeriod.month}>
                    Sin meses importados en {state.trendPeriod.year}
                  </option>
                )}
                {state.trendMonths.map((p) => (
                  <option key={p.month} value={p.month}>
                    {months[p.month - 1]}
                  </option>
                ))}
              </select>
            </label>
            <p id="shared-period-help">
              El período se aplica a denuncias y población. Si falta
              información, se muestra «No hay datos disponibles».
            </p>
          </fieldset>
        )}
      <label className="full-row">
        Departamento
        <select
          value={department}
          onChange={(e) => {
            setSelection(null);
            setDepartment(e.target.value);
          }}
        >
          <option value="">Todo el Perú</option>
          {filterDepartments.map((item) => (
            <option key={item.code} value={item.code}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <TerritoryField
        key={`province/${department}`}
        label="Provincia"
        value={province}
        options={filterProvinces}
        disabled={filtersDisabled || !department}
        emptyLabel={
          department ? "Todas las provincias" : "Selecciona un departamento"
        }
        onChange={(code) => {
          setSelection(null);
          setProvince(code);
        }}
      />
      <TerritoryField
        key={`district/${department}/${province}`}
        label="Distrito"
        optionText={(option) => `${option.name} · ${option.code}`}
        value={district}
        options={filterDistricts}
        disabled={filtersDisabled || !department}
        emptyLabel={
          department ? "Todos los distritos" : "Selecciona un departamento"
        }
        onChange={(code) => {
          setSelection(null);
          setDistrict(code);
        }}
      />
      {!geographicTrends && (view !== "map" || mapMode === "statistics") && (
        <label className="full-row">
          Modalidad de delito
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Todas las modalidades</option>
            {categories.map((cat) => (
              <option key={cat}>{cat}</option>
            ))}
          </select>
        </label>
      )}
    </fieldset>
  );
}
