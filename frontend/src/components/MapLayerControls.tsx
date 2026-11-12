import { policeStationSource } from "../lib/policeStations";
import { Button } from "./ui/button";
type Props = {
  streets?: boolean;
  setStreets?: (value: boolean) => void;
  statistics: boolean;
  showStatisticsControl?: boolean;
  setStatistics: (value: boolean) => void;
  stations: boolean;
  setStations: (value: boolean) => void;
  loading: boolean;
  error: string | null;
  count: number | null;
  fetchedAt?: string | null;
  retry: () => void;
};
export function MapLayerControls(props: Props) {
  return (
    <section className="map-layer-controls" aria-label="Capas del mapa">
      <div className="map-layer-switches">
        <strong>Capas</strong>
        {props.setStreets && (
          <label>
            <input
              type="checkbox"
              checked={props.streets ?? false}
              onChange={(e) => props.setStreets?.(e.target.checked)}
            />
            Calles y referencias
          </label>
        )}
        {props.showStatisticsControl !== false && (
          <label>
            <input
              type="checkbox"
              checked={props.statistics}
              onChange={(e) => props.setStatistics(e.target.checked)}
            />
            Denuncias SIDPOL
          </label>
        )}
        <label>
          <input
            type="checkbox"
            checked={props.stations}
            onChange={(e) => props.setStations(e.target.checked)}
          />
          <i aria-hidden="true" />
          Comisarías básicas
        </label>
      </div>
      {props.stations && (
        <div className="map-layer-info">
          <p>
            ● Ubicaciones de comisarías básicas. Filtradas por territorio; no
            por año, mes ni modalidad de delito.
          </p>
          <p>
            Fuente:{" "}
            <a
              href={policeStationSource.service}
              target="_blank"
              rel="noopener noreferrer"
            >
              {policeStationSource.attribution} ↗
            </a>
            . Cobertura nacional; fecha de actualización no declarada.
          </p>
          <p role="status">
            {props.loading
              ? "Cargando comisarías oficiales…"
              : props.count !== null
                ? `${props.count} ubicaciones en la selección${props.count === 0 ? " · No implica que no existan comisarías." : ""}`
                : ""}
          </p>
          {props.error && (
            <div role="alert">
              {props.error}{" "}
              <Button variant="ghost" onClick={props.retry}>
                Reintentar comisarías
              </Button>
            </div>
          )}
          {props.fetchedAt && (
            <p>
              Consulta: {new Date(props.fetchedAt).toLocaleString("es-PE")}. Se
              reutiliza durante 15 minutos; sin actualización automática.
            </p>
          )}
          <details>
            <summary>Condiciones y cobertura</summary>
            <p>
              Consulta pública de instalaciones policiales, no de hechos
              delictivos. Se muestra la ubicación proporcionada por la fuente
              sin certificar su precisión ni vigencia. No se combina con el
              total de denuncias.
            </p>
            <p>
              No se publica una licencia específica en los metadatos del
              servicio. Revisar las condiciones del proveedor antes de
              producción.{" "}
              <a
                href={policeStationSource.terms}
                target="_blank"
                rel="noopener noreferrer"
              >
                Términos GEOIDEP–GEOPERÚ ↗
              </a>
            </p>
            <p>
              Catálogos oficiales:{" "}
              <a
                href={policeStationSource.catalogue}
                target="_blank"
                rel="noopener noreferrer"
              >
                MININTER ↗
              </a>{" "}
              ·{" "}
              <a
                href={policeStationSource.discovery}
                target="_blank"
                rel="noopener noreferrer"
              >
                GEOIDEP ↗
              </a>
            </p>
          </details>
        </div>
      )}
    </section>
  );
}
