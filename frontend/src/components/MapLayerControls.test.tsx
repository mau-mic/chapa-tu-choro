import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MapLayerControls } from "./MapLayerControls";
import { policeStationSource } from "../lib/policeStations";

const defaults = () => ({
  statistics: true,
  setStatistics: vi.fn(),
  stations: false,
  setStations: vi.fn(),
  loading: false,
  error: null,
  count: null,
  retry: vi.fn(),
});

describe("official map layer controls", () => {
  it("keeps the street-map toggle independent in concentration mode", () => {
    const setStreets = vi.fn(),
      props = defaults();
    render(
      <MapLayerControls
        {...props}
        streets
        setStreets={setStreets}
        showStatisticsControl={false}
      />,
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Calles y referencias" }),
    );
    expect(setStreets).toHaveBeenCalledWith(false);
    expect(props.setStatistics).not.toHaveBeenCalled();
    expect(props.setStations).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("checkbox", { name: "Denuncias SIDPOL" }),
    ).not.toBeInTheDocument();
  });
  it("hides statistics controls in concentration and restores their selection on return", () => {
    const props = defaults();
    const { rerender } = render(
      <MapLayerControls {...props} showStatisticsControl={false} />,
    );
    expect(
      screen.queryByRole("checkbox", { name: "Denuncias SIDPOL" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Comisarías básicas" }),
    );
    expect(props.setStations).toHaveBeenCalledWith(true);
    expect(props.setStatistics).not.toHaveBeenCalled();
    rerender(<MapLayerControls {...props} showStatisticsControl />);
    expect(
      screen.getByRole("checkbox", { name: "Denuncias SIDPOL" }),
    ).toBeChecked();
  });
  it("keeps independent accessible controls and requires explicit station opt-in", () => {
    const props = defaults();
    render(<MapLayerControls {...props} />);
    expect(
      screen.getByRole("checkbox", { name: "Denuncias SIDPOL" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Comisarías básicas" }),
    ).not.toBeChecked();
    expect(
      screen.queryByText(/fecha de actualización/),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Comisarías básicas" }),
    );
    expect(props.setStations).toHaveBeenCalledWith(true);
    expect(props.setStatistics).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Denuncias SIDPOL" }));
    expect(props.setStatistics).toHaveBeenCalledWith(false);
  });

  it("announces loading and service failure with an independent retry action", () => {
    const props = defaults();
    const { rerender } = render(
      <MapLayerControls {...props} stations loading />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Cargando comisarías oficiales",
    );
    rerender(
      <MapLayerControls
        {...props}
        stations
        error="Servicio oficial no disponible"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Servicio oficial no disponible",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Reintentar comisarías" }),
    );
    expect(props.retry).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("checkbox", { name: "Denuncias SIDPOL" }),
    ).toBeChecked();
  });

  it("explains empty coverage, provenance and distinct statistical periods", () => {
    render(
      <MapLayerControls
        {...defaults()}
        stations
        count={0}
        fetchedAt="2026-11-11T12:00:00Z"
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "0 ubicaciones en la selección · No implica que no existan comisarías",
    );
    expect(
      screen.getByText(/no por año, mes ni modalidad/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/fecha de actualización no declarada/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Consulta:/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /MININTER \/ PNP/ }),
    ).toHaveAttribute("href", policeStationSource.service);
    expect(
      screen.getByRole("link", { name: /MININTER \/ PNP/ }),
    ).toHaveAttribute("rel", "noopener noreferrer");
  });
});
