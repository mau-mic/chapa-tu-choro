import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ConcentrationPanel } from "./ConcentrationPanel";
import type { ConcentrationData } from "../lib/api";
const options = [
  {
    year: 2026,
    month: 10,
    category: "all",
    label: "Todos",
    source: "https://example.test/source",
    importedAt: "2026-11-12T00:00:00Z",
  },
  {
    year: 2025,
    month: 9,
    category: "robbery",
    label: "Robo",
    source: "https://example.test/archive",
    importedAt: "2026-11-12T00:00:00Z",
  },
];
it("uses source-specific periods and categories without creating a 2025 combined total", () => {
  const setSelection = vi.fn();
  const { rerender } = render(
    <ConcentrationPanel
      metadata={{ setupRequired: false, available: options }}
      selection="2026/10/all"
      setSelection={setSelection}
      data={null}
      loading={false}
      error={null}
      retry={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Año de concentración"), {
    target: { value: "2025" },
  });
  expect(setSelection).toHaveBeenCalledWith("2025/9/robbery");
  rerender(
    <ConcentrationPanel
      metadata={{ setupRequired: false, available: options }}
      selection="2025/9/robbery"
      setSelection={setSelection}
      data={null}
      loading={false}
      error={null}
      retry={vi.fn()}
    />,
  );
  expect(
    screen.getByText(/No se calcula un total conjunto/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("option", { name: "Todos" }),
  ).not.toBeInTheDocument();
});
it("shows migration/import guidance and preserves meaningful failure states", () => {
  const props = {
    metadata: { setupRequired: true, available: [] },
    selection: "",
    setSelection: vi.fn(),
    data: null,
    loading: false,
    error: null,
    retry: vi.fn(),
  };
  const { rerender } = render(<ConcentrationPanel {...props} />);
  expect(
    screen.getByText(/base necesita la actualización/),
  ).toBeInTheDocument();
  rerender(<ConcentrationPanel {...props} error="HTTP 429" />);
  expect(screen.getByRole("alert")).toHaveTextContent("HTTP 429");
  fireEvent.click(
    screen.getByRole("button", { name: "Reintentar concentración" }),
  );
  expect(props.retry).toHaveBeenCalledOnce();
});

it("labels a missing business identifier count as unavailable, retaining numeric counts", () => {
  const data: ConcentrationData = {
    selection: options[1],
    sourceRecords: 6,
    mappedRecords: 6,
    visibleRecords: 6,
    cells: [],
    ranking: [],
    monthly: [],
    gridMetres: 1000,
    minimumCellRecords: 5,
    countingUnit: "source-classification-rows",
    comparisonNote: "Independent sources",
    quality: {
      sourceRows: 6,
      distinctSourceIdentifiers: null,
      ingestionChecks: {},
    },
  };
  const props = {
    metadata: { setupRequired: false, available: options },
    selection: "2025/9/robbery",
    setSelection: vi.fn(),
    data,
    loading: false,
    error: null,
    retry: vi.fn(),
  };
  const { rerender } = render(<ConcentrationPanel {...props} />);
  expect(
    screen.getByText(
      /identificadores de negocio distintos: no disponibles en la fuente/,
    ),
  ).toBeInTheDocument();
  rerender(
    <ConcentrationPanel
      {...props}
      data={{
        ...data,
        quality: { ...data.quality!, distinctSourceIdentifiers: 4 },
      }}
    />,
  );
  expect(
    screen.getByText(/4 identificadores de negocio distintos/),
  ).toBeInTheDocument();
  expect(
    screen.queryByText(/no disponibles en la fuente/),
  ).not.toBeInTheDocument();
  const mapDetail = {
    data: null,
    loading: true,
    error: null,
    outsideCoverage: false,
  };
  rerender(<ConcentrationPanel {...props} mapDetail={mapDetail} />);
  expect(screen.getByText(/Actualizando las agrupaciones/)).toBeInTheDocument();
  expect(screen.queryByText(/Celdas agregadas de/)).not.toBeInTheDocument();
  rerender(
    <ConcentrationPanel
      {...props}
      mapDetail={{
        ...mapDetail,
        loading: false,
        data: {
          selection: data.selection,
          gridMetres: 500,
          minimumCellRecords: 5,
          cells: [],
          visibleRecords: 0,
          suppressedCells: 3,
          coverage: { west: -78, east: -76, south: -13, north: -11 },
        },
      }}
    />,
  );
  expect(
    screen.getByText(/Agrupación del mapa: 500 m por lado/),
  ).toHaveTextContent("3 no se dibujan");
  expect(screen.queryByText(/Celdas agregadas de/)).not.toBeInTheDocument();
});
