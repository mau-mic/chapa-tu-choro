import type { useRadiusAnalysis } from "../hooks/useRadiusAnalysis";
import { Button } from "./ui/button";
type Props = {
  available: boolean;
  loading?: boolean;
  analysis: ReturnType<typeof useRadiusAnalysis>;
};
export function RadiusControls({
  available,
  loading = false,
  analysis,
}: Props) {
  return (
    <section className="radius-controls" aria-label="Consulta por radio">
      <div className="radius-tools">
        <Button
          variant="ghost"
          disabled={!available || loading}
          aria-pressed={analysis.active}
          onClick={() => analysis.setActive(!analysis.active)}
        >
          Consultar por radio
        </Button>
        {analysis.active && (
          <label>
            Radio de consulta
            <select
              aria-label="Radio de consulta"
              value={analysis.radiusMetres}
              disabled={!available || loading}
              onChange={(event) =>
                analysis.setRadiusMetres(Number(event.target.value))
              }
            >
              <option value={500}>500 m</option>
              <option value={1000}>1 km</option>
              <option value={2000}>2 km</option>
            </select>
          </label>
        )}
        {analysis.data && (
          <Button variant="ghost" onClick={analysis.clear}>
            Limpiar área
          </Button>
        )}
      </div>
      {loading ? (
        <p>Cargando disponibilidad de las ubicaciones…</p>
      ) : !available ? (
        <p>
          Este período requiere reimportar las ubicaciones para habilitar el
          radio real.
        </p>
      ) : analysis.active ? (
        <p>
          Selecciona un punto en el mapa. El conteo respeta el período,
          categoría y territorio elegidos.
        </p>
      ) : (
        <p>
          Activa la consulta para contar registros dentro de una distancia real
          en metros.
        </p>
      )}
      {analysis.loading && (
        <p role="status" className="radius-result">
          Contando registros dentro del radio…
        </p>
      )}
      {analysis.error && (
        <div role="alert" className="radius-result">
          {analysis.error}{" "}
          {analysis.canRetry && (
            <Button variant="ghost" onClick={analysis.retry}>
              Reintentar radio
            </Button>
          )}
        </div>
      )}
      {analysis.data && (
        <div className="radius-result" aria-live="polite">
          <strong>
            {analysis.data.suppressed
              ? `Menos de ${analysis.data.minimumRecords}`
              : analysis.data.records?.toLocaleString("es-PE")}{" "}
            registros
          </strong>
          <span>
            Dentro de {analysis.data.radiusMetres.toLocaleString("es-PE")} m ·{" "}
            {new Intl.DateTimeFormat("es-PE", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            }).format(
              new Date(
                Date.UTC(
                  analysis.data.selection.year,
                  analysis.data.selection.month - 1,
                  1,
                ),
              ),
            )}
          </span>
          <small>{analysis.data.accuracyNote}</small>
        </div>
      )}
    </section>
  );
}
