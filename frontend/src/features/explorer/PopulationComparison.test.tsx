import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PopulationComparison } from "./PopulationComparison";

const props = {
  period: { year: 2025, month: 1 },
  department: "",
  province: "",
  district: "",
  category: "",
};
const response = {
  year: 2025,
  month: 1,
  level: "department",
  population: 1000,
  source: {
    sha256: "test",
    sourceUrl: "https://www.gob.pe/inei",
    importedAt: "2026-01-01T00:00:00Z",
  },
  monthly: [
    { month: 1, reports: 10, ratePer100k: 1000, rowsWithoutPopulation: 0 },
  ],
  ranking: [
    {
      ubigeo: "150000",
      name: "LIMA",
      reports: 10,
      population: 1000,
      ratePer100k: 1000,
    },
  ],
};
afterEach(() => vi.unstubAllGlobals());
describe("PopulationComparison", () => {
  it("shows the annual denominator beside monthly reports and rates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => response }),
    );
    render(<PopulationComparison {...props} />);
    expect(await screen.findByText("LIMA")).toBeInTheDocument();
    expect(screen.getByText(/30 de junio de 2025/)).toBeInTheDocument();
    expect(screen.getAllByText("1,000").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/No mide el riesgo individual/),
    ).toBeInTheDocument();
  });
  it("offers retry after an API failure", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ ok: true, json: async () => response });
    vi.stubGlobal("fetch", fetch);
    render(<PopulationComparison {...props} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Reintentar comparación" }),
    );
    expect(await screen.findByText("LIMA")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("shows missing population without converting it to zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...response,
          population: null,
          monthly: [
            {
              month: 1,
              reports: 10,
              ratePer100k: null,
              rowsWithoutPopulation: 1,
            },
          ],
          ranking: [
            { ...response.ranking[0], population: null, ratePer100k: null },
          ],
        }),
      }),
    );
    render(<PopulationComparison {...props} />);
    expect(await screen.findByText("LIMA")).toBeInTheDocument();
    expect(
      screen.getAllByText("No hay datos disponibles").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(/Hay registros sin población compatible/),
    ).toBeInTheDocument();
  });
  it("cancels the previous selection and sends geographic/category filters", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => response });
    vi.stubGlobal("fetch", fetch);
    const { rerender } = render(<PopulationComparison {...props} />);
    await screen.findByText("LIMA");
    const signal = fetch.mock.calls[0][1].signal as AbortSignal;
    rerender(
      <PopulationComparison
        {...props}
        department="15"
        province="1501"
        district="150101"
        category="ROBO"
      />,
    );
    expect(signal.aborted).toBe(true);
    expect(fetch.mock.lastCall?.[0]).toContain("district=150101");
    expect(fetch.mock.lastCall?.[0]).toContain("category=ROBO");
  });
});

it("does not show a late response from a previous territory", async () => {
  let resolveOld!: (value: unknown) => void;
  const old = new Promise((resolve) => {
    resolveOld = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockReturnValueOnce(old)
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          ...response,
          ranking: [{ ...response.ranking[0], name: "NEW TERRITORY" }],
        }),
      }),
  );
  const { rerender } = render(<PopulationComparison {...props} />);
  expect(screen.getByRole("status")).toHaveTextContent("Cargando");
  rerender(<PopulationComparison {...props} department="15" />);
  expect(await screen.findByText("NEW TERRITORY")).toBeInTheDocument();
  await act(async () => {
    resolveOld({ ok: true, json: async () => response });
  });
  expect(screen.queryByText("LIMA")).not.toBeInTheDocument();
});

it("renders an empty reporting selection without inventing zero counts", () => {
  render(<PopulationComparison {...props} period={null} />);
  expect(
    screen.getByText("No hay datos disponibles para el período seleccionado."),
  ).toBeInTheDocument();
  expect(
    screen.queryByLabelText("Período de comparación"),
  ).not.toBeInTheDocument();
});

it("times out a hanging request and provides a retry action", async () => {
  vi.useFakeTimers();
  try {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url: string, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );
    render(<PopulationComparison {...props} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "La consulta tardó demasiado",
    );
    expect(
      screen.getByRole("button", { name: "Reintentar comparación" }),
    ).toBeEnabled();
  } finally {
    vi.useRealTimers();
  }
});

it("limits monthly rows to the shared closing month", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...response,
        monthly: [
          ...response.monthly,
          {
            month: 2,
            reports: 999,
            ratePer100k: 99900,
            rowsWithoutPopulation: 0,
          },
        ],
      }),
    }),
  );
  render(<PopulationComparison {...props} />);
  expect(await screen.findByText("LIMA")).toBeInTheDocument();
  expect(screen.getByText("Enero 2025")).toBeInTheDocument();
  expect(screen.queryByText("Febrero 2025")).not.toBeInTheDocument();
  expect(screen.queryByText("999")).not.toBeInTheDocument();
});
