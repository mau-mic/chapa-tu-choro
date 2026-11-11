import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MonthlyLine } from "../components/MonthlyEvolution";
import { usePopulationHistory } from "../hooks/usePopulationHistory";
import { api } from "./api";
afterEach(() => vi.unstubAllGlobals());
it("shows an empty message for all missing months while retaining explicit zeroes", () => {
  const { rerender } = render(
    <MonthlyLine
      series={[
        {
          name: "Test",
          color: "#000",
          points: [{ period: { year: 2024, month: 1 }, reports: null }],
        },
      ]}
    />,
  );
  expect(
    screen.getByText("No hay datos disponibles para el período seleccionado."),
  ).toBeVisible();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  rerender(
    <MonthlyLine
      series={[
        {
          name: "Test",
          color: "#000",
          points: [{ period: { year: 2024, month: 1 }, reports: 0 }],
        },
      ]}
    />,
  );
  expect(screen.getByRole("img")).toBeVisible();
});
it("treats absent population as unavailable data rather than an API failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ title: "population.unavailable" }), {
        status: 404,
      }),
    ),
  );
  const h = renderHook(() =>
    usePopulationHistory(
      true,
      { year: 2018, month: 1 },
      { year: 2018, month: 12 },
      "",
      "",
      "",
      "",
      null,
    ),
  );
  await waitFor(() => expect(h.result.current.loading).toBe(false));
  expect(h.result.current.empty).toBe(true);
  expect(h.result.current.error).toBeNull();
});
it("retains actual API failures and unknown territories as errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ title: "population.territory_unavailable" }),
          { status: 404 },
        ),
      ),
  );
  await expect(
    api.populationHistory(
      { year: 2018, month: 1 },
      { year: 2018, month: 12 },
      "",
      "",
      "",
      "",
      ["150000"],
    ),
  ).rejects.toMatchObject({
    status: 404,
    code: "population.territory_unavailable",
  });
});
