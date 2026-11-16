import { useEffect, useState, type MouseEvent } from "react";
import { applyPageMetadata, pages } from "./pageMetadata";
export type View = "map" | "trends" | "action";
export const viewPaths: Record<View, string> = {
  map: "/",
  trends: "/tendencias",
  action: "/denunciar",
};
export function viewFromPath(path: string): View {
  const canonical = path.replace(/\/$/, "") || "/";
  return canonical === "/denunciar"
    ? "action"
    : canonical === "/tendencias"
      ? "trends"
      : "map";
}
export function useNavigation() {
  const [view, setView] = useState<View>(() =>
    viewFromPath(window.location.pathname),
  );
  useEffect(() => {
    applyPageMetadata(pages[view]);
  }, [view]);
  useEffect(() => {
    const back = () => setView(viewFromPath(window.location.pathname));
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  const navigate = (event: MouseEvent<HTMLAnchorElement>, next: View) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    if (window.location.pathname !== viewPaths[next])
      window.history.pushState(null, "", viewPaths[next]);
    setView(next);
  };
  return { view, navigate };
}
