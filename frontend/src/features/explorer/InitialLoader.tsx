import { Skeleton } from "../../components/ui/skeleton";

export function InitialLoader() {
  return (
    <section
      className="initial-loader"
      role="status"
      aria-label="Cargando datos oficiales"
    >
      <div>
        <span className="eyebrow">Chapa Tu Choro</span>
        <h2>Preparando los datos oficiales…</h2>
        <p>Estamos cargando la vista y comprobando los períodos disponibles.</p>
        <div className="initial-loader-shapes" aria-hidden="true">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      </div>
    </section>
  );
}
