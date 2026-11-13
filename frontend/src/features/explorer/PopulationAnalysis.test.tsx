import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { populationHistoryFixture as fixture } from "../../test/fixtures/population";
import { PopulationAnalysis } from "./PopulationAnalysis";

it("shows historical rates and observed quality without claiming completeness", () => {
  render(
    <PopulationAnalysis
      state={{ data: fixture, loading: false, error: null, retry: vi.fn() }}
      compared={null}
      setCompared={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("img", {
      name: "Gráfico de líneas de denuncias por 100.000 habitantes por mes",
    }),
  ).toBeInTheDocument();
  expect(screen.getByText(/no certifica completitud/)).toBeInTheDocument();
  expect(
    screen.getByText(/Cada mes usa la población proyectada de su propio año/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Calidad y cobertura observada" }),
  ).toBeInTheDocument();
});
it("limits peers to four and preserves count/rate presentation choices", () => {
  const select = vi.fn();
  render(
    <PopulationAnalysis
      state={{ data: fixture, loading: false, error: null, retry: vi.fn() }}
      compared={["150000", "070000", "010000", "020000"]}
      setCompared={select}
    />,
  );
  expect(
    screen.getByRole("checkbox", { name: "TEST APURIMAC" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: "TEST CALLAO" }));
  expect(select).toHaveBeenLastCalledWith(["150000", "010000", "020000"]);
  fireEvent.click(
    screen.getByRole("button", { name: "Cantidad de denuncias" }),
  );
  expect(
    screen.getByRole("img", { name: "Gráfico de líneas de denuncias por mes" }),
  ).toBeInTheDocument();
});
it("keeps errors recoverable and reports unavailable denominators", () => {
  const retry = vi.fn();
  const { rerender } = render(
    <PopulationAnalysis
      state={{ data: null, loading: false, error: "No disponible", retry }}
      compared={null}
      setCompared={vi.fn()}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Reintentar comparación" }),
  );
  expect(retry).toHaveBeenCalledOnce();
  rerender(
    <PopulationAnalysis
      state={{
        data: {
          ...fixture,
          quality: {
            ...fixture.quality,
            missingPopulationDistricts: 1,
            yearsWithoutPopulation: [2024],
          },
        },
        loading: false,
        error: null,
        retry,
      }}
      compared={null}
      setCompared={vi.fn()}
    />,
  );
  expect(
    screen.getByText(/Sin población compatible para estos años: 2024/),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/La tasa del mes final se omite/),
  ).toBeInTheDocument();
});

it("hides previous peer series when the new selection fails", () => {
  render(
    <PopulationAnalysis
      state={{
        data: {
          ...fixture,
          series: [
            { code: "150000", name: "STALE PEER", points: fixture.monthly },
          ],
        },
        loading: false,
        error: "Selection failed",
        retry: vi.fn(),
      }}
      compared={["070000"]}
      setCompared={vi.fn()}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Selection failed");
  expect(screen.queryByText("STALE PEER")).not.toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Calidad y cobertura observada" }),
  ).toBeVisible();
});

it("shows all selected years in the monthly table with explicit unavailable values", () => {
  render(
    <PopulationAnalysis
      state={{ data: fixture, loading: false, error: null, retry: vi.fn() }}
      compared={null}
      setCompared={vi.fn()}
    />,
  );
  expect(screen.getByRole("row", { name: /Diciembre 2024/ })).toHaveTextContent(
    "10",
  );
  expect(screen.getByRole("row", { name: /Enero 2025/ })).toHaveTextContent(
    "No hay datos disponibles",
  );
  expect(screen.getByRole("row", { name: /Febrero 2025/ })).toHaveTextContent(
    "20",
  );
});
