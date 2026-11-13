import {
  Map,
  ChartNoAxesCombined,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import type { useNavigation } from "../../lib/navigation";
import { viewPaths } from "../../lib/navigation";
import { Button } from "../../components/ui/button";
import { useExplorer } from "./ExplorerContext";
export function SiteHeader({
  navigate,
}: Pick<ReturnType<typeof useNavigation>, "navigate">) {
  const { view, mobilePanel, setMobilePanel } = useExplorer();
  return (
    <header className="site-header">
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      <div className="brand">
        <span className="brand-icon" aria-hidden="true">
          ◈
        </span>
        <div>
          <strong>Chapa Tu Choro</strong>
          <span>Perú · Observatorio de denuncias</span>
        </div>
      </div>
      <nav className="view-nav" aria-label="Vista principal">
        {(
          [
            ["map", "Mapa", Map],
            ["trends", "Tendencias", ChartNoAxesCombined],
            ["action", "Denunciar", ShieldCheck],
          ] as const
        ).map(([destination, label, Icon]) => (
          <a
            key={destination}
            href={viewPaths[destination]}
            aria-current={view === destination ? "page" : undefined}
            onClick={(event) => navigate(event, destination)}
          >
            <Icon className="interface-icon" aria-hidden="true" />
            {label}
          </a>
        ))}
      </nav>
      {view !== "action" && (
        <Button
          id="filter-toggle"
          className="mobile-toggle"
          variant="ghost"
          onClick={() => setMobilePanel(!mobilePanel)}
          aria-expanded={mobilePanel}
          aria-controls="statistics-panel"
        >
          <SlidersHorizontal className="interface-icon" aria-hidden="true" />
          Filtros y ranking
        </Button>
      )}
    </header>
  );
}
