import { useExplorer } from "./ExplorerContext";
import { lazy, Suspense } from "react";
import { FeatureBoundary, ViewLoading } from "./ViewLoading";
import { ModeSwitch } from "../../components/ui/mode-switch";
const LazyPopulationComparison = lazy(() =>
  import("./PopulationAnalysis").then((module) => ({
    default: module.PopulationAnalysis,
  })),
);
const LazyTrends = lazy(() =>
  import("../../components/Trends").then((module) => ({
    default: module.Trends,
  })),
);

export function TrendsView() {
  const {
    setTrendSource,
    view,
    trendSource,
    geographicTrends,
    state,
    metadata,
    categories,
    loading,
    error,
    geographic,
    departmentName,
    districtName,
    provinceName,
    populationHistory,
    populationInsights,
    compared,
    setCompared,
    setTrendsModuleReady,
    setPopulationModuleReady,
  } = useExplorer();
  const sourceControls = (
    <ModeSwitch
      label="Fuente de tendencias"
      value={trendSource}
      onValueChange={setTrendSource}
      options={[
        { value: "reports", label: "Denuncias" },
        { value: "geographic", label: "Delitos" },
      ]}
    />
  );
  return (
    view === "trends" && (
      <FeatureBoundary
        onError={() => {
          setTrendsModuleReady(true);
          setPopulationModuleReady(true);
        }}
      >
        <Suspense fallback={<ViewLoading label="Preparando tendencias…" />}>
          <LazyTrends
            onReady={setTrendsModuleReady}
            key={trendSource}
            controls={sourceControls}
            categoryOrder={
              geographicTrends
                ? [
                    "Homicidio",
                    "Extorsión",
                    "Hurto",
                    "Robo",
                    "Estafa",
                    "Violencia contra la mujer",
                    "Pandillaje",
                    "Microcomercialización de drogas",
                    "Otras modalidades de la fuente",
                  ]
                : categories
            }
            geographic={
              geographicTrends
                ? {
                    latestPeriod: geographic.latestPeriod,
                    imports: geographic.data?.imports ?? [],
                  }
                : undefined
            }
            data={
              geographicTrends ? (geographic.data?.data ?? null) : state.trends
            }
            metadata={geographicTrends ? null : metadata}
            loading={geographicTrends ? geographic.loading : loading}
            error={geographicTrends ? geographic.error : error}
            retry={geographicTrends ? geographic.retry : state.retry}
            geography={
              [departmentName, provinceName, districtName]
                .filter(Boolean)
                .join(" / ") || "Perú"
            }
          >
            {!geographicTrends && metadata && (
              <FeatureBoundary onError={() => setPopulationModuleReady(true)}>
                <Suspense
                  fallback={
                    <ViewLoading label="Preparando comparación de población…" />
                  }
                >
                  <LazyPopulationComparison
                    state={populationHistory}
                    insights={{
                      ...populationInsights,
                      retry: () => {
                        populationHistory.retry();
                        populationInsights.retry();
                      },
                    }}
                    compared={compared}
                    setCompared={setCompared}
                    onReady={setPopulationModuleReady}
                  />
                </Suspense>
              </FeatureBoundary>
            )}
          </LazyTrends>
        </Suspense>
      </FeatureBoundary>
    )
  );
}
