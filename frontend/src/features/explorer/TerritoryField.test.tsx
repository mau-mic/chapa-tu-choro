import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { TerritoryField } from "./TerritoryField";
const options = Array.from({ length: 80 }, (_, i) => ({
  code: String(150100 + i),
  name: i === 67 ? "Jesús María" : `Distrito ${i}`,
}));
function Example({ large = true, disabled = false }) {
  const [value, setValue] = useState("");
  return (
    <>
      <TerritoryField
        label="Distrito"
        value={value}
        onChange={setValue}
        options={large ? options : options.slice(0, 2)}
        emptyLabel="Todos los distritos"
        disabled={disabled}
      />
      <output aria-label="Código seleccionado">{value}</output>
    </>
  );
}
describe("territorial field", () => {
  it("retains native selection for short lists", () => {
    render(<Example large={false} />);
    expect(
      screen.queryByRole("button", { name: "Buscar distrito" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Distrito" }), {
      target: { value: options[1].code },
    });
    expect(screen.getByLabelText("Código seleccionado")).toHaveTextContent(
      options[1].code,
    );
  });
  it("opens search only on intent, matches accents and UBIGEO, and keeps the native alternative", async () => {
    render(<Example />);
    expect(screen.getByRole("combobox", { name: "Distrito" }).tagName).toBe(
      "SELECT",
    );
    fireEvent.click(screen.getByRole("button", { name: "Buscar distrito" }));
    const input = await screen.findByPlaceholderText(
      "Nombre o UBIGEO…",
      {},
      { timeout: 5000 },
    );
    fireEvent.change(input, { target: { value: "jesus" } });
    const match = await screen.findByRole("option", { name: /Jesús María/ });
    fireEvent.click(match);
    expect(screen.getByLabelText("Código seleccionado")).toHaveTextContent(
      options[67].code,
    );
    fireEvent.change(input, { target: { value: "no matching district" } });
    expect(await screen.findByText("No hay coincidencias.")).toBeVisible();
    expect(screen.getByLabelText("Código seleccionado")).toHaveTextContent(
      options[67].code,
    );
    fireEvent.change(input, { target: { value: options[25].code } });
    await screen.findByRole("option", { name: /Distrito 25/ });
    fireEvent.keyDown(input, { key: "Escape" });
    await screen.findByRole("button", { name: "Usar lista de distrito" });
    fireEvent.click(
      screen.getByRole("button", { name: "Usar lista de distrito" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Distrito" }).tagName).toBe(
        "SELECT",
      ),
    );
    expect(screen.getByRole("combobox", { name: "Distrito" })).toHaveValue(
      options[67].code,
    );
  });
  it("bounds rendered matches and disables both modes with their field", async () => {
    const { rerender } = render(<Example />);
    fireEvent.click(screen.getByRole("button", { name: "Buscar distrito" }));
    await screen.findByPlaceholderText("Nombre o UBIGEO…");
    expect(screen.getAllByRole("option").length).toBeLessThanOrEqual(40);
    expect(screen.getByText(/Escribe para acotar/)).toBeInTheDocument();
    rerender(<Example disabled />);
    expect(screen.getByRole("combobox", { name: "Distrito" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Usar lista de distrito" }),
    ).toBeDisabled();
  });
});
