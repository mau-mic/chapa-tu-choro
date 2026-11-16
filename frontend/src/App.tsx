import { useNavigation } from "./lib/navigation";
import { TakeAction } from "./components/TakeAction";
import {
  ExplorerProvider,
  useExplorer,
} from "./features/explorer/ExplorerContext";
import { InitialLoader } from "./features/explorer/InitialLoader";
import { SiteHeader } from "./features/explorer/SiteHeader";
import { ExplorerSidebar } from "./features/explorer/ExplorerSidebar";
import { MapView } from "./features/explorer/MapView";
import { TrendsView } from "./features/explorer/TrendsView";
import "./styles.css";
import "./styles/interface.css";
export { months } from "./lib/calendar";

function ExplorerContents() {
  const { view, initialLoading } = useExplorer();
  return (
    <div
      className={`workspace ${view === "action" ? "action-workspace" : ""}`}
      aria-busy={initialLoading}
    >
      <div
        className="explorer-content"
        data-loading={initialLoading || undefined}
        inert={initialLoading}
        aria-hidden={initialLoading || undefined}
      >
        <ExplorerSidebar />
        <MapView />
        {view === "action" && <TakeAction />}
        <TrendsView />
      </div>
      {initialLoading && <InitialLoader />}
    </div>
  );
}

export default function App() {
  const { view, navigate } = useNavigation();
  return (
    <ExplorerProvider view={view}>
      <div className={`shell ${view === "action" ? "shell-document" : ""}`}>
        <SiteHeader navigate={navigate} />
        <ExplorerContents />
      </div>
    </ExplorerProvider>
  );
}
