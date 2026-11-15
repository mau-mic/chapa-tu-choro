import { useEffect } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  api,
  concentrationApi,
  type Exploration,
  type Metadata,
  type Trends,
} from "./lib/api";
vi.mock("./components/CrimeMap", () => ({
  CrimeMap: ({
    onSelect,
    onReady,
  }: {
    onSelect: (area: unknown) => void;
    onReady?: (ready: boolean) => void;
  }) => {
    useEffect(() => {
      onReady?.(true);
    }, [onReady]);
    return (
      <button
        onClick={() =>
          onSelect({
            code: "04",
            name: "TEST DEPARTMENT",
            level: "department",
            reports: 7,
          })
        }
      >
        Select map department
      </button>
    );
  },
}));
vi.mock("./lib/api", () => ({
  api: {
    metadata: vi.fn(),
    categories: vi.fn(),
    explore: vi.fn(),
    trends: vi.fn(),
    populationComparison: vi.fn(),
    populationHistory: vi.fn(),
    populationInsights: vi.fn(),
    exploreRates: vi.fn(),
  },
  concentrationApi: { metadata: vi.fn(), trends: vi.fn() },
}));
// Synthetic fixtures only, never bundled as official source data.
const metadata: Metadata = {
  latestPeriod: { year: 2024, month: 2 },
  totalRows: 1,
  availablePeriods: [
    { year: 2024, month: 2 },
    { year: 2023, month: 1 },
  ],
  imports: [],
  statisticsSource: "https://example.test/source",
  geometrySource: "https://example.test/geometry",
};
const country: Exploration = {
  period: metadata.latestPeriod!,
  category: null,
  department: null,
  province: null,
  district: null,
  districts: [],
  level: "department",
  departments: [
    { code: "04", name: "TEST DEPARTMENT" },
    { code: "05", name: "OTHER DEPARTMENT" },
  ],
  provinces: [],
  summary: {
    period: metadata.latestPeriod!,
    category: null,
    reports: 7,
    districtsWithData: 1,
    districtsWithoutGeometry: 1,
  },
  ranking: [{ code: "04", name: "TEST DEPARTMENT", reports: 7 }],
  map: { type: "FeatureCollection", features: [] },
};
const focus: Exploration = {
  ...country,
  department: "04",
  level: "district",
  districts: [{ code: "040101", name: "TEST DISTRICT" }],
  provinces: [
    { code: "0401", name: "TEST PROVINCE ONE" },
    { code: "0402", name: "TEST PROVINCE TWO" },
  ],
  ranking: [{ code: "040101", name: "TEST DISTRICT", reports: 7 }],
};
beforeEach(() => {
  window.history.replaceState(null, "", "/");
  vi.resetAllMocks();
  vi.mocked(api.populationComparison).mockRejectedValue(
    new Error("Population projections unavailable in this fixture"),
  );
  vi.mocked(api.populationInsights).mockRejectedValue(
    new Error("Insights unavailable in this fixture"),
  );
  vi.mocked(api.populationHistory).mockRejectedValue(
    new Error("Population history unavailable in this fixture"),
  );
  vi.mocked(api.metadata).mockResolvedValue(metadata);
  vi.mocked(api.categories).mockResolvedValue(["TEST CATEGORY"]);
  vi.mocked(api.explore).mockImplementation(
    async (_year, _month, _category, department, province, district) =>
      department
        ? {
            ...focus,
            department,
            province: province || null,
            district: district || null,
            provinces:
              department === "04"
                ? focus.provinces
                : [{ code: "0501", name: "OTHER PROVINCE" }],
          }
        : country,
  );
});
describe("nationwide exploration", () => {
  it("defers the map until first visit and retains its canvas subtree across views", async () => {
    window.history.replaceState(null, "", "/denunciar");
    render(<App />);
    expect(screen.queryByText("Select map department")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Mapa" }));
    const map = await screen.findByText("Select map department");
    fireEvent.click(screen.getByRole("link", { name: "Denunciar" }));
    expect(screen.getByText("Select map department")).toBe(map);
    fireEvent.click(screen.getByRole("link", { name: "Mapa" }));
    expect(screen.getByText("Select map department")).toBe(map);
  });

  it("opens a published department and period directly from its map link", async () => {
    window.history.replaceState(null, "", "/?department=04&year=2023&month=1");
    render(<App />);
    await screen.findByRole("button", { name: /TEST DISTRICT/ });
    expect(api.explore).toHaveBeenCalledWith(
      2023,
      1,
      "",
      "04",
      "",
      "",
      expect.any(AbortSignal),
    );
    expect(screen.getByLabelText("Departamento")).toHaveValue("04");
  });
  it("falls back to the latest imported period when a linked period is unavailable", async () => {
    window.history.replaceState(null, "", "/?department=04&year=2026&month=1");
    render(<App />);
    await screen.findByRole("button", { name: /TEST DISTRICT/ });
    expect(api.explore).toHaveBeenCalledWith(
      2024,
      2,
      "",
      "04",
      "",
      "",
      expect.any(AbortSignal),
    );
  });
  it("switches trend sources with independent periods, units and queries while retaining geography", async () => {
    const trends: Trends = {
      from: { year: 2026, month: 1 },
      to: { year: 2026, month: 10 },
      category: "all",
      department: null,
      province: null,
      district: null,
      comparisonLevel: "department",
      departments: country.departments,
      provinces: focus.provinces,
      districts: focus.districts,
      metrics: {
        totalReports: 42,
        monthsWithData: 1,
        requestedMonths: 10,
        currentMonthReports: 42,
        previousMonthReports: null,
        previousYearMonthReports: null,
        monthlyChangePercent: null,
        yearlyChangePercent: null,
      },
      monthly: [{ period: { year: 2026, month: 10 }, reports: 42 }],
      categories: [{ category: "Robo", reports: 42 }],
      territories: country.ranking,
      categorySeries: [
        {
          category: "Robo",
          monthly: [{ period: { year: 2026, month: 10 }, reports: 42 }],
        },
      ],
    };
    vi.mocked(api.trends).mockResolvedValue({
      ...trends,
      metrics: { ...trends.metrics, totalReports: 7 },
    });
    const option = {
      year: 2026,
      month: 10,
      category: "all",
      label: "Todos",
      source: "https://example.test/geo",
      importedAt: "2026-11-12",
    };
    vi.mocked(concentrationApi.metadata).mockResolvedValue({
      setupRequired: false,
      available: [
        option,
        { ...option, month: 1 },
        { ...option, year: 2025, category: "robbery", label: "Robo", month: 9 },
      ],
    });
    vi.mocked(concentrationApi.trends).mockResolvedValue({
      data: trends,
      countingUnit: "source-classification-rows",
      countScope: "valid-ubigeo-including-unmappable",
      latestPeriod: trends.to,
      imports: [option],
    });
    render(<App />);
    await screen.findByRole("button", { name: /TEST DEPARTMENT/ });
    fireEvent.click(screen.getByRole("link", { name: "Tendencias" }));
    await screen.findByRole("img", {
      name: "Gráfico de líneas de denuncias por mes",
    });
    const csvCalls = vi.mocked(api.trends).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Delitos" }));
    await screen.findByRole("img", {
      name: "Gráfico de líneas de registros por mes",
    });
    expect(
      screen.queryByRole("slider", { name: "Año inicial" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Departamento"), {
      target: { value: "04" },
    });
    await waitFor(() =>
      expect(concentrationApi.trends).toHaveBeenLastCalledWith(
        2026,
        1,
        10,
        "all",
        "04",
        "",
        "",
        expect.any(AbortSignal),
      ),
    );
    expect(api.trends).toHaveBeenCalledTimes(csvCalls);
    fireEvent.change(screen.getByLabelText("Publicación anual"), {
      target: { value: "2025" },
    });
    await waitFor(() =>
      expect(concentrationApi.trends).toHaveBeenLastCalledWith(
        2025,
        9,
        9,
        "robbery",
        "04",
        "",
        "",
        expect.any(AbortSignal),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Denuncias" }));
    await screen.findByRole("img", {
      name: "Gráfico de líneas de denuncias por mes",
    });
    expect(screen.getByLabelText("Departamento")).toHaveValue("04");
    expect(
      screen.getByRole("slider", { name: "Año inicial" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Publicación anual"),
    ).not.toBeInTheDocument();
  });

  it("loads /denunciar without any API request and follows browser history", async () => {
    window.history.replaceState(null, "", "/denunciar");
    render(<App />);
    expect(
      screen.getByRole("main", { name: "Denunciar: guía oficial" }),
    ).toBeInTheDocument();
    expect(api.metadata).not.toHaveBeenCalled();
    expect(api.categories).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: "Mapa" }));
    expect(window.location.pathname).toBe("/");
    await screen.findByRole("button", { name: /TEST DEPARTMENT/ });
    await act(async () => {
      window.history.replaceState(null, "", "/denunciar");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(
      screen.getByRole("main", { name: "Denunciar: guía oficial" }),
    ).toBeInTheDocument();
  });
  it("provides real links for modified clicks without forcing client navigation", async () => {
    render(<App />);
    const link = screen.getByRole("link", { name: "Denunciar" });
    expect(link).toHaveAttribute("href", "/denunciar");
    fireEvent.click(link, { ctrlKey: true });
    expect(window.location.pathname).toBe("/");
    await screen.findByRole("button", { name: /TEST DEPARTMENT/ });
  });
  it("offers Denunciar third, retains map filters and does not query statistics from the resource page", async () => {
    render(<App />);
    await screen.findByRole("button", { name: /TEST DEPARTMENT/ });
    expect(
      [
        ...screen
          .getByRole("navigation", { name: "Vista principal" })
          .querySelectorAll("a"),
      ].map((button) => button.textContent),
    ).toEqual(["Mapa", "Tendencias", "Denunciar"]);
    fireEvent.change(screen.getByLabelText("Departamento"), {
      target: { value: "04" },
    });
    await screen.findByRole("option", { name: /TEST DISTRICT/ });
    const calls = vi.mocked(api.explore).mock.calls.length;
    fireEvent.click(screen.getByRole("link", { name: "Denunciar" }));
    expect(
      screen.getByRole("main", { name: "Denunciar: guía oficial" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Departamento")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Filtros y ranking" }),
    ).not.toBeInTheDocument();
    expect(api.explore).toHaveBeenCalledTimes(calls);
    expect(api.trends).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: "Mapa" }));
    await screen.findByRole("button", { name: /TEST DISTRICT/ });
    expect(screen.getByLabelText("Departamento")).toHaveValue("04");
  });
  it("keeps reporting resources available during catalogue/API failures", async () => {
    vi.mocked(api.metadata).mockRejectedValue(new Error("API offline"));
    render(<App />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("link", { name: "Denunciar" }));
    expect(screen.getByRole("link", { name: "Llamar al 105" })).toHaveAttribute(
      "href",
      "tel:105",
    );
    expect(
      screen.getByRole("heading", {
        name: "Denuncia ante el Ministerio Público",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(api.explore).not.toHaveBeenCalled();
  });

  it("defaults to Map and preserves geographic filters when switching to Trends and back", async () => {
    const trendData: Trends = {
      from: { year: 2023, month: 3 },
      to: metadata.latestPeriod!,
      category: null,
      department: "04",
      province: null,
      district: "040101",
      comparisonLevel: "district",
      departments: focus.departments,
      provinces: focus.provinces,
      districts: focus.districts,
      metrics: {
        totalReports: 7,
        monthsWithData: 1,
        requestedMonths: 12,
        currentMonthReports: 7,
        previousMonthReports: null,
        previousYearMonthReports: null,
        monthlyChangePercent: null,
        yearlyChangePercent: null,
      },
      monthly: [{ period: metadata.latestPeriod!, reports: 7 }],
      categories: [{ category: "TEST CATEGORY", reports: 7 }],
      territories: focus.ranking,
      categorySeries: [
        {
          category: "TEST CATEGORY",
          monthly: [{ period: metadata.latestPeriod!, reports: 7 }],
        },
      ],
    };
    vi.mocked(api.trends).mockResolvedValue(trendData);
    vi.mocked(api.metadata).mockResolvedValue({
      ...metadata,
      availablePeriods: [
        ...metadata.availablePeriods,
        { year: 2024, month: 1 },
      ],
    });
    render(<App />);
    expect(screen.getByRole("link", { name: "Mapa" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await screen.findByRole("button", { name: /TEST DEPARTMENT/ });
    fireEvent.change(screen.getByLabelText("Departamento"), {
      target: { value: "04" },
    });
    await screen.findByRole("option", { name: /TEST DISTRICT/ });
    fireEvent.change(screen.getByLabelText("Distrito"), {
      target: { value: "040101" },
    });
    await screen.findByRole("region", { name: "Distrito seleccionado" });
    fireEvent.click(screen.getByRole("link", { name: "Tendencias" }));
    await screen.findByRole("img", { name: /Gráfico circular/ });
    expect(api.trends).toHaveBeenLastCalledWith(
      { year: 2023, month: 1 },
      { year: 2024, month: 2 },
      "",
      "04",
      "",
      "040101",
      expect.any(AbortSignal),
    );
    expect(screen.getByLabelText("Distrito")).toHaveValue("040101");
    fireEvent.change(screen.getByLabelText("Mes final"), {
      target: { value: "1" },
    });
    await waitFor(() =>
      expect(api.populationHistory).toHaveBeenLastCalledWith(
        { year: 2023, month: 1 },
        { year: 2024, month: 1 },
        "",
        "04",
        "",
        "040101",
        null,
        expect.any(AbortSignal),
      ),
    );
    await waitFor(() =>
      expect(api.trends).toHaveBeenLastCalledWith(
        { year: 2023, month: 1 },
        { year: 2024, month: 1 },
        "",
        "04",
        "",
        "040101",
        expect.any(AbortSignal),
      ),
    );
    expect(
      screen.queryByLabelText("Período de comparación"),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("slider", { name: "Año inicial" }), {
      target: { value: "2024" },
    });
    await waitFor(() =>
      expect(api.trends).toHaveBeenLastCalledWith(
        { year: 2024, month: 1 },
        { year: 2024, month: 1 },
        "",
        "04",
        "",
        "040101",
        expect.any(AbortSignal),
      ),
    );
    fireEvent.click(screen.getByRole("link", { name: "Mapa" }));
    await screen.findByRole("region", { name: "Distrito seleccionado" });
    expect(screen.getByLabelText("Distrito")).toHaveValue("040101");
  });
  it("ignores late trend responses and presents HTTP 429 messages", async () => {
    render(<App />);
    await screen.findByRole("button", { name: /TEST DEPARTMENT/ });
    let resolveOld!: (value: Trends) => void;
    vi.mocked(api.trends).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    fireEvent.click(screen.getByRole("link", { name: "Tendencias" }));
    expect(
      await screen.findByRole("status", { name: "Cargando datos oficiales" }),
    ).toBeInTheDocument();
    const error = new Error("Demasiadas solicitudes. Espera 12 segundos.");
    error.name = "RateLimitError";
    vi.mocked(api.trends).mockRejectedValueOnce(error);
    fireEvent.change(screen.getByLabelText("Departamento"), {
      target: { value: "04" },
    });
    expect(
      await within(
        await screen.findByRole("main", { name: "Tendencias históricas" }),
      ).findByText(/Demasiadas solicitudes. Espera 12 segundos/),
    ).toBeInTheDocument();
    await act(async () =>
      resolveOld({ ...country, monthly: [] } as unknown as Trends),
    );
    expect(
      screen.queryByRole("img", { name: /Gráfico de líneas/ }),
    ).not.toBeInTheDocument();
  });
  it("filters provinces, retains them across time/category changes and resets them on a new department", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Filtros y ranking" }));
    expect(screen.getByLabelText("Provincia")).toBeDisabled();
    await screen.findByRole("button", { name: /TEST DEPARTMENT/ });
    fireEvent.change(screen.getByLabelText("Departamento"), {
      target: { value: "04" },
    });
    await screen.findByRole("option", { name: "TEST PROVINCE TWO" });
    fireEvent.change(screen.getByLabelText("Provincia"), {
      target: { value: "0402" },
    });
    await waitFor(() =>
      expect(api.explore).toHaveBeenLastCalledWith(
        2024,
        2,
        "",
        "04",
        "0402",
        "",
        expect.any(AbortSignal),
      ),
    );
    fireEvent.change(screen.getByLabelText("Año"), {
      target: { value: "2023" },
    });
    await waitFor(() =>
      expect(api.explore).toHaveBeenLastCalledWith(
        2023,
        1,
        "",
        "04",
        "0402",
        "",
        expect.any(AbortSignal),
      ),
    );
    fireEvent.change(screen.getByLabelText("Modalidad de delito"), {
      target: { value: "TEST CATEGORY" },
    });
    await waitFor(() =>
      expect(api.explore).toHaveBeenLastCalledWith(
        2023,
        1,
        "TEST CATEGORY",
        "04",
        "0402",
        "",
        expect.any(AbortSignal),
      ),
    );
    fireEvent.change(screen.getByLabelText("Departamento"), {
      target: { value: "05" },
    });
    await waitFor(() =>
      expect(api.explore).toHaveBeenLastCalledWith(
        2023,
        1,
        "TEST CATEGORY",
        "05",
        "",
        "",
        expect.any(AbortSignal),
      ),
    );
    expect(screen.getByLabelText("Provincia")).toHaveValue("");
    expect(
      screen.queryByRole("option", { name: "TEST PROVINCE TWO" }),
    ).not.toBeInTheDocument();
  });

  it("filters districts across the department, preserves selection for periods, and resets it on parent changes", async () => {
    render(<App />);
    expect(screen.getByLabelText("Distrito")).toBeDisabled();
    await screen.findByRole("button", { name: /TEST DEPARTMENT/ });
    fireEvent.change(screen.getByLabelText("Departamento"), {
      target: { value: "04" },
    });
    await screen.findByRole("option", { name: /TEST DISTRICT/ });
    fireEvent.change(screen.getByLabelText("Distrito"), {
      target: { value: "040101" },
    });
    await waitFor(() =>
      expect(api.explore).toHaveBeenLastCalledWith(
        2024,
        2,
        "",
        "04",
        "",
        "040101",
        expect.any(AbortSignal),
      ),
    );
    expect(
      await screen.findByRole("region", { name: "Distrito seleccionado" }),
    ).toHaveTextContent("7 denuncias");
    fireEvent.change(screen.getByLabelText("Año"), {
      target: { value: "2023" },
    });
    await waitFor(() =>
      expect(api.explore).toHaveBeenLastCalledWith(
        2023,
        1,
        "",
        "04",
        "",
        "040101",
        expect.any(AbortSignal),
      ),
    );
    fireEvent.change(screen.getByLabelText("Provincia"), {
      target: { value: "0402" },
    });
    await waitFor(() =>
      expect(api.explore).toHaveBeenLastCalledWith(
        2023,
        1,
        "",
        "04",
        "0402",
        "",
        expect.any(AbortSignal),
      ),
    );
    expect(screen.getByLabelText("Distrito")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Departamento"), {
      target: { value: "05" },
    });
    expect(screen.getByLabelText("Distrito")).toHaveValue("");
  });
  it("uses imported periods and keeps department selection when filters change", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Filtros y ranking" }));
    await waitFor(() =>
      expect(api.explore).toHaveBeenCalledWith(
        2024,
        2,
        "",
        "",
        "",
        "",
        expect.any(AbortSignal),
      ),
    );
    expect(
      await screen.findByText(/1 distritos con denuncias no tienen geometría/),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Departamento"), {
      target: { value: "04" },
    });
    expect(
      await screen.findByRole("button", { name: /TEST DISTRICT/ }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Año"), {
      target: { value: "2023" },
    });
    await waitFor(() =>
      expect(api.explore).toHaveBeenLastCalledWith(
        2023,
        1,
        "",
        "04",
        "",
        "",
        expect.any(AbortSignal),
      ),
    );
    fireEvent.change(screen.getByLabelText("Modalidad de delito"), {
      target: { value: "TEST CATEGORY" },
    });
    await waitFor(() =>
      expect(api.explore).toHaveBeenLastCalledWith(
        2023,
        1,
        "TEST CATEGORY",
        "04",
        "",
        "",
        expect.any(AbortSignal),
      ),
    );
  });
  it("clicks a map department and returns to Peru", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Filtros y ranking" }));
    await waitFor(() => expect(api.explore).toHaveBeenCalled());
    fireEvent.click(
      screen.getByRole("button", { name: "Select map department" }),
    );
    expect(
      await screen.findByRole("button", { name: /TEST DISTRICT/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Ranking distrital" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Volver a Perú/ }));
    await waitFor(() =>
      expect(api.explore).toHaveBeenLastCalledWith(
        2024,
        2,
        "",
        "",
        "",
        "",
        expect.any(AbortSignal),
      ),
    );
    expect(
      screen.getByRole("heading", { name: "Ranking departamental" }),
    ).toBeInTheDocument();
  });
  it("supports department navigation and district details from the keyboard-accessible ranking", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Filtros y ranking" }));
    fireEvent.click(
      await screen.findByRole("button", { name: /TEST DEPARTMENT/ }),
    );
    expect(
      await screen.findByRole("button", { name: /TEST DISTRICT/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /TEST DISTRICT/ }));
    expect(
      await screen.findByRole("region", { name: "Distrito seleccionado" }),
    ).toHaveTextContent("7 denuncias");
  });
  it("does not invent a period for an empty catalogue", async () => {
    vi.mocked(api.metadata).mockResolvedValue({
      ...metadata,
      latestPeriod: null,
      availablePeriods: [],
      totalRows: 0,
    });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Filtros y ranking" }));
    expect(
      await screen.findByText(/Todavía no hay estadísticas importadas/),
    ).toBeInTheDocument();
    expect(api.explore).not.toHaveBeenCalled();
  });
  it("keeps catalogue failures visible and offers retry", async () => {
    vi.mocked(api.metadata).mockRejectedValueOnce(new Error("offline"));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Filtros y ranking" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo cargar el catálogo",
    );
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(
      await screen.findByRole("button", { name: /TEST DEPARTMENT/ }),
    ).toBeInTheDocument();
  });
  it("removes geographic filters and resets category while retaining the reporting period", async () => {
    render(<App />);
    await screen.findByRole("option", { name: "2024" });
    fireEvent.change(screen.getByLabelText("Año"), {
      target: { value: "2023" },
    });
    fireEvent.change(screen.getByLabelText("Departamento"), {
      target: { value: "04" },
    });
    await screen.findByRole("option", { name: "TEST PROVINCE TWO" });
    fireEvent.change(screen.getByLabelText("Provincia"), {
      target: { value: "0402" },
    });
    await screen.findByRole("button", {
      name: "Quitar filtro de provincia: TEST PROVINCE TWO",
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Quitar filtro de provincia: TEST PROVINCE TWO",
      }),
    );
    expect(screen.getByLabelText("Provincia")).toHaveValue("");
    expect(screen.getByLabelText("Departamento")).toHaveValue("04");
    fireEvent.change(screen.getByLabelText("Modalidad de delito"), {
      target: { value: "TEST CATEGORY" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Restablecer filtros" }),
    );
    expect(screen.getByLabelText("Departamento")).toHaveValue("");
    expect(screen.getByLabelText("Modalidad de delito")).toHaveValue("");
    expect(screen.getByLabelText("Año")).toHaveValue("2023");
    await waitFor(() =>
      expect(api.explore).toHaveBeenLastCalledWith(
        2023,
        1,
        "",
        "",
        "",
        "",
        expect.any(AbortSignal),
      ),
    );
  });
  it("clears stale counts and ignores a response from an old department selection", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Filtros y ranking" }));
    await screen.findByRole("button", { name: /TEST DEPARTMENT/ });
    let resolveOld!: (value: Exploration) => void;
    vi.mocked(api.explore).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    fireEvent.change(screen.getByLabelText("Departamento"), {
      target: { value: "04" },
    });
    await waitFor(() =>
      expect(
        document.querySelector(".ranking .rank-row"),
      ).not.toBeInTheDocument(),
    );
    vi.mocked(api.explore).mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: /Volver a Perú/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudieron cargar las estadísticas",
    );
    await act(async () => resolveOld(focus));
    expect(screen.queryByText("TEST DISTRICT")).not.toBeInTheDocument();
  });
});

it("hides the first map view until essential data and its module are ready", async () => {
  let resolve!: (value: Exploration) => void;
  vi.mocked(api.explore).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<App />);
  expect(
    await screen.findByRole("status", { name: "Cargando datos oficiales" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Select map department" }),
  ).not.toBeInTheDocument();
  await waitFor(() => expect(api.explore).toHaveBeenCalled());
  await act(async () => resolve(country));
  expect(
    await screen.findByRole("button", { name: "Select map department" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("status", { name: "Cargando datos oficiales" }),
  ).not.toBeInTheDocument();
});

it("releases the initial loader on API failure so retry stays accessible", async () => {
  vi.mocked(api.metadata).mockRejectedValue(new Error("offline"));
  render(<App />);
  expect(
    await screen.findByText(/No se pudo cargar el catálogo/),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.queryByRole("status", { name: "Cargando datos oficiales" }),
    ).not.toBeInTheDocument(),
  );
});

it("waits for population history before revealing the first Trends view", async () => {
  window.history.replaceState(null, "", "/tendencias");
  let reject!: (error: Error) => void;
  vi.mocked(api.populationHistory).mockImplementation(
    () =>
      new Promise((_done, fail) => {
        reject = fail;
      }),
  );
  vi.mocked(api.trends).mockResolvedValue({
    from: { year: 2023, month: 1 },
    to: { year: 2024, month: 2 },
    category: null,
    department: null,
    province: null,
    district: null,
    comparisonLevel: "department",
    departments: country.departments,
    provinces: [],
    districts: [],
    metrics: {
      totalReports: 0,
      monthsWithData: 0,
      requestedMonths: 14,
      currentMonthReports: null,
      previousMonthReports: null,
      previousYearMonthReports: null,
      monthlyChangePercent: null,
      yearlyChangePercent: null,
    },
    monthly: [],
    categories: [],
    territories: [],
    categorySeries: [],
  });
  render(<App />);
  await waitFor(() => expect(api.populationHistory).toHaveBeenCalled());
  expect(
    screen.getByRole("status", { name: "Cargando datos oficiales" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("main", { name: "Tendencias históricas" }),
  ).not.toBeInTheDocument();
  await act(async () => reject(new Error("Population unavailable")));
  expect(
    await screen.findByRole("main", { name: "Tendencias históricas" }),
  ).toBeInTheDocument();
  expect(await screen.findByText("Population unavailable")).toBeInTheDocument();
  expect(
    screen.queryByRole("status", { name: "Cargando datos oficiales" }),
  ).not.toBeInTheDocument();
});
