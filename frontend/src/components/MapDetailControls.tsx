import type { useConcentrationMap } from "../hooks/useConcentrationMap";
import { formatMapDistance, type MapGridSetting } from "../lib/mapViewport";
import { Button } from "./ui/button";
export function MapDetailControls({
  detail,
}: {
  detail: ReturnType<typeof useConcentrationMap>;
}) {
  return (
    <section
      className="map-detail-controls"
      aria-label="Detalle de concentración"
    >
      <label>
        Agrupación del mapa
        <select
          aria-label="Agrupación del mapa"
          value={detail.setting}
          disabled={!detail.available}
          onChange={(e) => detail.setSetting(e.target.value as MapGridSetting)}
        >
          <option value="auto">
            Automática
            {detail.setting === "auto"
              ? ` (${formatMapDistance(detail.gridMetres)})`
              : " según zoom"}
          </option>
          <option value="500">500 m por lado</option>
          <option value="1000">1 km por lado</option>
          <option value="10000">10 km por lado</option>
        </select>
      </label>
      <p>
        {detail.awaitingSnapshot
          ? "Cargando la disponibilidad del detalle…"
          : detail.outsideCoverage
            ? "La vista está fuera de la cobertura de Perú."
            : detail.available
              ? "El detalle automático cambia con el zoom. El radio se consulta por separado al elegir un punto."
              : "Este período necesita ubicaciones importadas para cambiar el detalle."}
      </p>
      {detail.error && (
        <div role="alert">
          {detail.error}{" "}
          <Button variant="ghost" onClick={detail.retry}>
            Reintentar detalle
          </Button>
        </div>
      )}
    </section>
  );
}
