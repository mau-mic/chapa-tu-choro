import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TakeAction } from "./TakeAction";
import {
  emergencyResource,
  reportingResources,
  incidentChoices,
  resourcesFor,
  reportingDetails,
} from "../lib/reportingResources";

const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);
function clipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value });
}
afterEach(() => {
  if (originalClipboard)
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
});
const emergency = () =>
  screen.getByRole("article", { name: "Emergencia policial" });
describe("official reporting resources", () => {
  it("starts with danger guidance and only offers category selection after the non-emergency answer", () => {
    render(<TakeAction />);
    expect(
      screen.queryByLabelText("2. ¿Qué situación quieres consultar?"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("radio", { name: "Sí, necesito ayuda inmediata" }),
    );
    expect(screen.getByText(/prioriza el 105/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("radio", {
        name: "No, quiero consultar cómo denunciar",
      }),
    );
    expect(
      screen.getByLabelText("2. ¿Qué situación quieres consultar?"),
    ).toBeInTheDocument();
  });
  it.each(incidentChoices)(
    "recommends only configured channels for $label and keeps emergency assistance available",
    (choice) => {
      render(<TakeAction />);
      fireEvent.click(
        screen.getByRole("radio", {
          name: "No, quiero consultar cómo denunciar",
        }),
      );
      fireEvent.change(
        screen.getByLabelText("2. ¿Qué situación quieres consultar?"),
        { target: { value: choice.id } },
      );
      expect(screen.getByText(choice.note)).toBeInTheDocument();
      const expected = resourcesFor(choice.id);
      expect(screen.getAllByRole("article")).toHaveLength(expected.length + 1);
      for (const resource of expected)
        expect(
          screen.getByRole("article", { name: resource.title }),
        ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Llamar al 105" }),
      ).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("radio", { name: "Sí, necesito ayuda inmediata" }),
      );
      expect(screen.queryByText(choice.note)).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText("2. ¿Qué situación quieres consultar?"),
      ).not.toBeInTheDocument();
    },
  );
  it("has review metadata for every channel and never promises anonymous reporting without evidence", () => {
    render(<TakeAction />);
    for (const resource of [emergencyResource, ...reportingResources]) {
      const details = reportingDetails[resource.id];
      expect(details.methods.length).toBeGreaterThan(0);
      expect(details.reviewedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(details.verification.length).toBeGreaterThan(0);
      expect(details.anonymity).not.toBe("Anónimo");
      const article = screen.getByRole("article", { name: resource.title });
      expect(within(article).getByText(details.anonymity)).toBeInTheDocument();
      expect(
        within(article).getByText(details.requirements),
      ).toBeInTheDocument();
    }
  });
  it("offers official HTTPS destinations, clearly scoped channels and native phone links", () => {
    render(<TakeAction />);
    expect(
      screen.getByRole("main", { name: "Denunciar: guía oficial" }),
    ).toBeInTheDocument();
    for (const resource of [emergencyResource, ...reportingResources]) {
      const article = screen.getByRole("article", { name: resource.title });
      expect(article).toHaveTextContent(resource.scope);
      if (resource.phone)
        expect(
          within(article).getByRole("link", {
            name: `Llamar al ${resource.phone}`,
          }),
        ).toHaveAttribute("href", `tel:${resource.phone}`);
    }
    for (const link of screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("https:"))) {
      const url = new URL(link.getAttribute("href")!);
      expect(
        url.hostname === "www.gob.pe" || url.hostname.endsWith(".gob.pe"),
      ).toBe(true);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
      expect(link.getAttribute("rel")).toContain("noreferrer");
    }
    expect(
      screen.getByText(/No es un portal de denuncia general/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no recibe denuncias ni guarda datos/),
    ).toBeInTheDocument();
  });
  it("copies the chosen number only after a user click and announces success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    clipboard({ writeText });
    render(<TakeAction />);
    expect(writeText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Copiar número 1818" }));
    expect(writeText).toHaveBeenCalledExactlyOnceWith("1818");
    expect(await screen.findByText("Número 1818 copiado.")).toBeInTheDocument();
    expect(within(emergency()).queryByText(/copiado/)).not.toBeInTheDocument();
  });
  it("shows a focused selectable number when clipboard access is denied", async () => {
    clipboard({
      writeText: vi.fn().mockRejectedValue(new Error("Permission denied")),
    });
    render(<TakeAction />);
    fireEvent.click(
      within(emergency()).getByRole("button", { name: "Copiar número 105" }),
    );
    const input = await screen.findByRole("textbox", {
      name: "Número para copiar: 105",
    });
    expect(input).toHaveValue("105");
    expect(input).toHaveAttribute("readonly");
    await waitFor(() => expect(input).toHaveFocus());
    expect((input as HTMLInputElement).selectionStart).toBe(0);
    expect((input as HTMLInputElement).selectionEnd).toBe(3);
    expect(within(emergency()).getByRole("status")).toHaveTextContent(
      "No se pudo copiar automáticamente",
    );
  });
  it("preserves calling and manual copying when the Clipboard API is unavailable", async () => {
    clipboard(undefined);
    render(<TakeAction />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar número 111" }));
    expect(
      await screen.findByRole("textbox", { name: "Número para copiar: 111" }),
    ).toHaveValue("111");
    expect(screen.getByRole("link", { name: "Llamar al 111" })).toHaveAttribute(
      "href",
      "tel:111",
    );
  });
});
