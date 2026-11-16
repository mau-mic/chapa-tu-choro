import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { HistoricalInsights } from "./HistoricalInsights";
import { populationInsightsFixture as fixture } from "../../test/fixtures/insights";
import { populationHistoryFixture as history } from "../../test/fixtures/population";
const state = { data: fixture, loading: false, error: null, retry: vi.fn() };
it("switches moving windows and baselines locally and exposes national rates and differences", () => {
  const { container } = render(
    <HistoricalInsights state={state} history={history} metric="rate" />,
  );
  expect(
    container.querySelector('[data-series="Media móvil de 3 meses"]'),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "Media móvil" }), {
    target: { value: "12" },
  });
  expect(
    container.querySelector('[data-series="Media móvil de 12 meses"]'),
  ).toBeInTheDocument();
  fireEvent.change(
    screen.getByRole("combobox", { name: "Referencia histórica" }),
    { target: { value: "historical" } },
  );
  expect(
    container.querySelector('[data-series="Media de los 36 meses anteriores"]'),
  ).toBeInTheDocument();
  const national = screen.getByLabelText("Comparación con Perú");
  expect(within(national).getByText("800")).toBeVisible();
  expect(within(national).getByText("+25%")).toBeVisible();
  expect(container.querySelector('[data-series="Perú"]')).toBeInTheDocument();
  expect(screen.getByText(/no promedia tasas distritales/)).toBeVisible();
  expect(state.retry).not.toHaveBeenCalled();
});
it("reports incomplete seasonal samples and keeps count and rate availability distinct", () => {
  const data = structuredClone(fixture);
  const last = data.monthly.at(-1)!;
  last.scope.seasonalBaseline = {
    reports: null,
    ratePer100k: null,
    reportObservations: 2,
    rateObservations: 1,
    requiredObservations: 3,
  };
  last.scope.seasonalChange = { reportsPercent: null, ratePercent: null };
  const { rerender } = render(
    <HistoricalInsights
      state={{ ...state, data }}
      history={history}
      metric="rate"
    />,
  );
  const refs = screen.getByLabelText("Referencias del mes final");
  expect(within(refs).getByText(/1\/3 observaciones/)).toBeVisible();
  expect(within(refs).getByText("No hay datos disponibles")).toBeVisible();
  rerender(
    <HistoricalInsights
      state={{ ...state, data }}
      history={history}
      metric="count"
    />,
  );
  expect(within(refs).getByText(/2\/3 observaciones/)).toBeVisible();
});
it("does not duplicate the national series when Peru is selected", () => {
  render(
    <HistoricalInsights
      state={{ ...state, data: { ...fixture, scopeCode: "000000" } }}
      history={history}
      metric="rate"
    />,
  );
  expect(screen.getByText(/Selecciona un departamento/)).toBeVisible();
  expect(
    screen.queryByLabelText("Comparación con Perú"),
  ).not.toBeInTheDocument();
});
it("keeps original history visible on loading or failure and retries a mismatched release", () => {
  const retry = vi.fn();
  const { rerender } = render(
    <HistoricalInsights
      state={{ ...state, data: null, loading: true, retry }}
      history={history}
      metric="rate"
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Cargando medias");
  expect(screen.getByRole("img")).toBeVisible();
  rerender(
    <HistoricalInsights
      state={{ ...state, error: "HTTP 503", data: null, retry }}
      history={history}
      metric="rate"
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("HTTP 503");
  fireEvent.click(screen.getByRole("button", { name: "Reintentar análisis" }));
  expect(retry).toHaveBeenCalledOnce();
  rerender(
    <HistoricalInsights
      state={{
        ...state,
        data: { ...fixture, source: { ...fixture.source, sha256: "other" } },
        retry,
      }}
      history={history}
      metric="rate"
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Los datos cambiaron entre consultas",
  );
  expect(
    screen.queryByLabelText("Comparación con Perú"),
  ).not.toBeInTheDocument();
});

it("suppresses a national comparison if counts changed between parallel requests", () => {
  const data = structuredClone(fixture);
  data.monthly[0].scope.reports = 999;
  render(
    <HistoricalInsights
      state={{ ...state, data }}
      history={history}
      metric="rate"
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Los datos cambiaron entre consultas",
  );
  expect(
    screen.queryByLabelText("Comparación con Perú"),
  ).not.toBeInTheDocument();
});
