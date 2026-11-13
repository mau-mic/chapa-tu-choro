import { Button } from "../../components/ui/button";
import { useExplorer } from "./ExplorerContext";

export function FilterSummary() {
  const {
    department,
    province,
    district,
    departmentName,
    provinceName,
    districtName,
    category,
    setCategory,
    setDepartment,
    setProvince,
    setDistrict,
    setSelection,
    geographicTrends,
    geographic,
    view,
    mapMode,
  } = useExplorer();
  const statisticalCategory =
    !geographicTrends && (view !== "map" || mapMode === "statistics")
      ? category
      : "";
  const chips = [
    department && {
      kind: "departamento",
      label: departmentName ?? department,
      clear: () => setDepartment(""),
    },
    province && {
      kind: "provincia",
      label: provinceName ?? province,
      clear: () => setProvince(""),
    },
    district && {
      kind: "distrito",
      label: districtName ?? district,
      clear: () => setDistrict(""),
    },
    statisticalCategory && {
      kind: "modalidad",
      label: statisticalCategory,
      clear: () => setCategory(""),
    },
  ].filter((chip): chip is { kind: string; label: string; clear: () => void } =>
    Boolean(chip),
  );
  const reset = () => {
    setSelection(null);
    setDepartment("");
    setCategory("");
    if (
      geographicTrends &&
      geographic.categoryOptions.some((option) => option[0] === "all")
    )
      geographic.setCategory("all");
  };
  return (
    <section className="filter-summary" aria-label="Filtros activos">
      <div className="filter-summary-heading">
        <span>Tu selección</span>
        {!!chips.length && (
          <Button variant="ghost" onClick={reset}>
            Restablecer filtros
          </Button>
        )}
      </div>
      {chips.length ? (
        <ul>
          {chips.map((chip) => (
            <li key={chip.kind}>
              <button
                onClick={() => {
                  setSelection(null);
                  chip.clear();
                }}
                aria-label={`Quitar filtro de ${chip.kind}: ${chip.label}`}
              >
                <span>{chip.label}</span>
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>
          Todo el Perú <span>· Sin filtro territorial</span>
        </p>
      )}
      <small>El período y la fuente se conservan.</small>
    </section>
  );
}
