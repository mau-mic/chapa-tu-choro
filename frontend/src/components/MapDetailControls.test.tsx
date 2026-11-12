import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MapDetailControls } from "./MapDetailControls";
it("keeps map grouping independent from radius selection and offers a retry", () => {
  const detail = {
    awaitingSnapshot: false,
    setting: "auto" as const,
    setSetting: vi.fn(),
    gridMetres: 500,
    data: null,
    error: null as string | null,
    available: true,
    outsideCoverage: false,
    loading: false,
    retry: vi.fn(),
  };
  const { rerender } = render(<MapDetailControls detail={detail} />);
  expect(
    screen.getByRole("option", { name: "Automática (500 m)" }),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Agrupación del mapa"), {
    target: { value: "1000" },
  });
  expect(detail.setSetting).toHaveBeenCalledWith("1000");
  expect(screen.queryByLabelText("Radio de consulta")).not.toBeInTheDocument();
  rerender(<MapDetailControls detail={{ ...detail, error: "HTTP 429" }} />);
  fireEvent.click(screen.getByRole("button", { name: "Reintentar detalle" }));
  expect(detail.retry).toHaveBeenCalledOnce();
});
