import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RadiusControls } from "./RadiusControls";
import type { RadiusAnalysisData } from "../lib/api";
const data: RadiusAnalysisData = {
  selection: {
    year: 2026,
    month: 10,
    category: "all",
    label: "Test",
    source: "https://example.test",
    importedAt: "2026-11-12",
  },
  longitude: -77,
  latitude: -12,
  radiusMetres: 1000,
  records: null,
  suppressed: true,
  minimumRecords: 5,
  area: { type: "Polygon", coordinates: [] },
  countingUnit: "source-classification-rows",
  accuracyNote: "Precisión no declarada",
};
it("explains setup and distinguishes suppression from zero without disclosing locations", () => {
  const analysis = {
    active: false,
    setActive: vi.fn(),
    radiusMetres: 1000,
    setRadiusMetres: vi.fn(),
    pick: vi.fn(),
    data: null as RadiusAnalysisData | null,
    error: null,
    loading: false,
    canRetry: true,
    retry: vi.fn(),
    clear: vi.fn(),
  };
  const { rerender } = render(
    <RadiusControls available={false} analysis={analysis} />,
  );
  expect(
    screen.getByRole("button", { name: "Consultar por radio" }),
  ).toBeDisabled();
  expect(screen.getByText(/reimportar/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Radio de consulta")).not.toBeInTheDocument();
  rerender(<RadiusControls available={false} loading analysis={analysis} />);
  expect(screen.getByText(/Cargando disponibilidad/)).toBeInTheDocument();
  expect(screen.queryByText(/reimportar/)).not.toBeInTheDocument();
  rerender(
    <RadiusControls available analysis={{ ...analysis, active: true, data }} />,
  );
  expect(screen.getByText("Menos de 5 registros")).toBeInTheDocument();
  expect(screen.getByText("Precisión no declarada")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Radio de consulta"), {
    target: { value: "500" },
  });
  expect(analysis.setRadiusMetres).toHaveBeenCalledWith(500);
  rerender(
    <RadiusControls
      available
      analysis={{
        ...analysis,
        active: true,
        data: { ...data, records: 0, suppressed: false },
      }}
    />,
  );
  expect(screen.getByText("0 registros")).toBeInTheDocument();
});
