import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Trends } from "./Trends";
import type { Trends as TrendsData } from "../lib/api";

// Isolated synthetic fixtures, never displayed as official application data.
const data: TrendsData = {
  from: { year: 2024, month: 1 },
  to: { year: 2024, month: 3 },
  category: null,
  department: null,
  province: null,
  district: null,
  comparisonLevel: "department",
  departments: [],
  provinces: [],
  districts: [],
  metrics: {
    totalReports: 10,
    monthsWithData: 2,
    requestedMonths: 3,
    currentMonthReports: 0,
    previousMonthReports: null,
    previousYearMonthReports: 20,
    monthlyChangePercent: null,
    yearlyChangePercent: -100,
  },
  monthly: [
    { period: { year: 2024, month: 1 }, reports: 10 },
    { period: { year: 2024, month: 2 }, reports: null },
    { period: { year: 2024, month: 3 }, reports: 0 },
  ],
  categories: [
    { category: "TEST A", reports: 7 },
    { category: "TEST B", reports: 3 },
  ],
  categorySeries: [
    {
      category: "TEST A",
      monthly: [
        { period: { year: 2024, month: 1 }, reports: 7 },
        { period: { year: 2024, month: 2 }, reports: null },
        { period: { year: 2024, month: 3 }, reports: 0 },
      ],
    },
    {
      category: "TEST B",
      monthly: [
        { period: { year: 2024, month: 1 }, reports: 3 },
        { period: { year: 2024, month: 2 }, reports: null },
        { period: { year: 2024, month: 3 }, reports: 0 },
      ],
    },
  ],
  territories: [{ code: "04", name: "TEST DEPARTMENT", reports: 10 }],
};
const props = {
  data,
  metadata: null,
  loading: false,
  error: null,
  retry: vi.fn(),
  geography: "Perú",
};
describe("historical charts", () => {
  it("uses geographic record units across every chart and shows annual-source provenance", () => {
    render(
      <Trends
        {...props}
        data={{
          ...data,
          metrics: { ...data.metrics, yearlyChangePercent: null },
        }}
        geographic={{
          latestPeriod: data.to,
          imports: [
            {
              year: 2024,
              month: 3,
              category: "robbery",
              label: "Robo",
              source: "https://example.test/geographic",
              importedAt: "2026-11-12",
            },
          ],
        }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Delitos: registros geográficos." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Gráfico de líneas de registros por mes",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Gráfico de barras de registros por territorio",
      }),
    ).toBeInTheDocument();
    fireEvent.pointerEnter(
      screen
        .getByRole("img", { name: /Gráfico circular/ })
        .querySelector("path")!,
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent("7 registros");
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("denuncias");
    expect(
      screen.getByText("No se comparan publicaciones de años distintos."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no equivalen a delitos únicos/),
    ).toBeInTheDocument();
    expect(screen.getByText("Publicaciones del rango (1)")).toBeInTheDocument();
  });
  it("renders line, pie and bars with accessible data and breaks lines across missing months", () => {
    render(<Trends {...props} />);
    const line = screen.getByRole("img", {
      name: "Gráfico de líneas de denuncias por mes",
    });
    expect(
      line.querySelector("path")?.getAttribute("d")?.match(/M/g),
    ).toHaveLength(2);
    expect(line.querySelectorAll("circle")).toHaveLength(2); // Explicit zero is plotted.
    expect(
      screen
        .getByRole("img", { name: /Gráfico circular/ })
        .querySelectorAll("path"),
    ).toHaveLength(2);
    expect(
      screen.getByRole("img", { name: /Gráfico de barras/ }),
    ).toHaveTextContent("TEST DEPARTMENT");
    expect(screen.getByText("2 de 3 meses con registros")).toBeInTheDocument();
    expect(screen.getByText("No calculable")).toBeInTheDocument();
    expect(screen.getByText("-100%")).toBeInTheDocument();
    expect(
      screen.getByText("Ver datos mensuales", { selector: "summary" }),
    ).toBeInTheDocument();
  });
  it("shows themed point tooltips for mouse and keyboard and handles explicit zero", () => {
    render(<Trends {...props} />);
    const circles = screen
      .getByRole("img", { name: /Gráfico de líneas/ })
      .querySelectorAll("circle");
    fireEvent.pointerEnter(circles[0]);
    expect(screen.getByRole("tooltip")).toHaveClass("chart-tooltip");
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "10 denuncias registradas",
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent("Total de denuncias");
    fireEvent.pointerLeave(circles[0]);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.focus(circles[1]);
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "0 denuncias registradas",
    );
    fireEvent.keyDown(circles[1], { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
  it("uses the line tooltip style for pie slices with range, count, share and matching color", () => {
    render(<Trends {...props} />);
    const pie = screen.getByRole("img", { name: /Gráfico circular/ });
    const slices = pie.querySelectorAll("path");
    expect(pie.querySelector("title")).toBeNull(); // Avoid a competing browser-native tooltip.
    fireEvent.pointerEnter(slices[0]);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveClass("chart-tooltip");
    expect(tooltip).toHaveTextContent("TEST A");
    expect(tooltip).toHaveTextContent("7 denuncias registradas");
    expect(tooltip).toHaveTextContent("70.0% del total del rango");
    expect(tooltip.querySelector("span")).toHaveTextContent(/2024.*—.*2024/);
    expect(tooltip.querySelector("i")).toHaveStyle({
      background: slices[0].getAttribute("fill"),
    });
    expect(slices[0]).toHaveAttribute("aria-describedby", tooltip.id);
    fireEvent.pointerLeave(slices[0]);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.focus(slices[1]);
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "3 denuncias registradas",
    );
    fireEvent.keyDown(slices[1], { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.click(slices[0]);
    expect(screen.getByRole("tooltip")).toHaveTextContent("TEST A");
    fireEvent.blur(slices[0]);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
  it("supports a single full-circle category and clears the tooltip when the data changes", () => {
    const single = {
      ...data,
      categories: [{ category: "TEST SINGLE", reports: 10 }],
    };
    const { rerender } = render(<Trends {...props} data={single} />);
    const circle = screen
      .getByRole("img", { name: /Gráfico circular/ })
      .querySelector("circle")!;
    expect(circle).toHaveAttribute("tabindex", "0");
    fireEvent.focus(circle);
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "100.0% del total del rango",
    );
    rerender(<Trends {...props} />);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
  it("filters category lines locally using the exact pie colors and preserves gaps and zeros", () => {
    render(<Trends {...props} categoryOrder={["TEST B", "TEST A"]} />);
    const pie = screen.getByRole("img", { name: /Gráfico circular/ });
    const pieColors = [...pie.querySelectorAll("path")].map((path) =>
      path.getAttribute("fill"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Por modalidad" }));
    const chart = screen.getByRole("img", { name: /Gráfico de líneas/ });
    expect(
      [...chart.querySelectorAll("path")].map((path) =>
        path.getAttribute("stroke"),
      ),
    ).toEqual(pieColors);
    expect(chart.querySelectorAll("circle")).toHaveLength(4);
    fireEvent.click(screen.getByRole("checkbox", { name: "TEST A" }));
    const filtered = screen.getByRole("img", { name: /Gráfico de líneas/ });
    expect(filtered.querySelectorAll("path")).toHaveLength(1);
    expect(filtered.querySelector("path")).toHaveAttribute(
      "stroke",
      pieColors[1],
    );
    expect(
      filtered.querySelector("path")?.getAttribute("d")?.match(/M/g),
    ).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Ninguna" }));
    expect(
      screen.getByText(/Selecciona al menos una modalidad/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Todas" }));
    expect(
      screen
        .getByRole("img", { name: /Gráfico de líneas/ })
        .querySelectorAll("path"),
    ).toHaveLength(2);
  });
  it("shows skeleton and API failure without stale charts", () => {
    const { rerender } = render(<Trends {...props} data={null} loading />);
    expect(
      screen.getByRole("status", { name: "Cargando tendencias" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    rerender(
      <Trends
        {...props}
        data={null}
        error="Demasiadas solicitudes. Espera 10 segundos."
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Espera 10 segundos");
    expect(
      screen.getByRole("button", { name: "Reintentar" }),
    ).toBeInTheDocument();
  });
});
