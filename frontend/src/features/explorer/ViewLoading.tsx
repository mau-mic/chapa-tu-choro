import { Component, type ReactNode } from "react";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";

export function ViewLoading({ label }: { label: string }) {
  return (
    <div className="view-loading" role="status">
      <span>{label}</span>
      <div aria-hidden="true">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-4 h-40 w-full" />
        <Skeleton className="mt-4 h-4 w-2/3" />
      </div>
    </div>
  );
}

export class FeatureBoundary extends Component<
  { children: ReactNode; onError?: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError?.();
  }
  render() {
    return this.state.failed ? (
      <section className="view-loading" role="alert">
        <h2>No se pudo abrir esta vista</h2>
        <p>Comprueba tu conexión y vuelve a cargar la página.</p>
        <Button onClick={() => window.location.reload()}>
          Volver a cargar
        </Button>
      </section>
    ) : (
      this.props.children
    );
  }
}
