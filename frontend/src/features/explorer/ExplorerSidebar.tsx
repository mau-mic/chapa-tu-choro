import { X } from "lucide-react";
import { useEffect } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Button } from "../../components/ui/button";
import { useCompactLayout } from "../../hooks/useCompactLayout";
import { FilterSummary } from "./FilterSummary";
import { useExplorer } from "./ExplorerContext";
import { ConcentrationPanel } from "../../components/ConcentrationPanel";
import { ExplorerFilters } from "./ExplorerFilters";
import { StatisticsRanking } from "./StatisticsRanking";
function SidebarContent() {
  const { view, mapMode, geographicTrends, density, detail } = useExplorer();
  return (
    <>
      <div className="eyebrow">Explorar los datos</div>
      <h2 className="sidebar-title">
        {view === "trends" ? "Define tu consulta" : "Explora el Perú"}
      </h2>
      <p className="lead">
        {geographicTrends
          ? "Explora los registros de la publicación geográfica por período, categoría y territorio. Cada año corresponde a una publicación separada."
          : "Explora las denuncias por departamento y sus distritos. Cada cifra corresponde a los datos oficiales importados de MININTER / SIDPOL."}
      </p>
      <FilterSummary />
      <ExplorerFilters />
      <StatisticsRanking />
      {view === "map" && mapMode === "concentration" && (
        <ConcentrationPanel
          {...density}
          mapDetail={density.data?.spatialDetailAvailable ? detail : undefined}
        />
      )}
      <nav className="seo-links" aria-label="Fuentes y estadísticas">
        <a href="/estadisticas/peru/">Estadísticas de Perú</a>
        <a href="/metodologia/">Fuentes y metodología</a>
      </nav>
      <p className="method-note">
        {geographicTrends || (view === "map" && mapMode === "concentration")
          ? "Son cantidades absolutas de registros de la fuente geográfica, sin normalizar por población."
          : "Los conteos indican denuncias registradas. Las tasas se identifican por 100.000 habitantes y usan la población proyectada del mismo año."}{" "}
        Más registros o tasas mayores no implican necesariamente un mayor riesgo
        individual.{" "}
        {mapMode === "concentration" && view === "map"
          ? "La ubicación se presenta agrupada, con la precisión y cobertura disponibles en la fuente."
          : "Los gráficos y límites muestran agregados territoriales, sin identificar hechos individuales."}{" "}
        Los límites se simplifican para su visualización.
      </p>
    </>
  );
}

export function ExplorerSidebar() {
  const { view, mobilePanel, setMobilePanel } = useExplorer();
  const compact = useCompactLayout();
  useEffect(() => {
    if ((!compact || view === "action") && mobilePanel) setMobilePanel(false);
  }, [compact, view, mobilePanel, setMobilePanel]);
  if (view === "action") return null;
  if (!compact)
    return (
      <aside id="statistics-panel" className="sidebar">
        <SidebarContent />
      </aside>
    );
  return (
    <Dialog.Root open={mobilePanel} onOpenChange={setMobilePanel}>
      <Dialog.Portal>
        <Dialog.Backdrop className="filter-backdrop" />
        <Dialog.Popup
          id="statistics-panel"
          className="filter-sheet"
          finalFocus={() => document.getElementById("filter-toggle")}
        >
          <div className="filter-sheet-header">
            <div>
              <Dialog.Title>Filtros y ranking</Dialog.Title>
              <Dialog.Description>
                Ajusta tu consulta y vuelve a los resultados.
              </Dialog.Description>
            </div>
            <Dialog.Close
              render={<Button variant="ghost" aria-label="Cerrar filtros" />}
            >
              <X className="interface-icon" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="filter-sheet-content">
            <SidebarContent />
          </div>
          <div className="filter-sheet-footer">
            <Dialog.Close render={<Button />}>Ver resultados</Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
