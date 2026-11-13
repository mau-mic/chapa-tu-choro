import { test as base, expect, type Page } from "@playwright/test";
import type {
  PopulationHistoryData,
  PopulationInsightsData,
  PopulationInsightValues,
  AreaFeatureCollection,
  Trends,
} from "../src/lib/api";
// TEST-ONLY synthetic aggregates/geometries. Not distributed in the app or
// represented as official observations. All upstream requests are intercepted.
export const period = { year: 2026, month: 2 };
const names = [
  { code: "15", name: "TEST NORTH" },
  { code: "04", name: "TEST SOUTH" },
];
const feature = (
  code: string,
  name: string,
  level: "department" | "district",
  reports: number,
  x: number,
  y: number,
) => ({
  type: "Feature" as const,
  properties: { code, name, level, reports },
  geometry: {
    type: "Polygon" as const,
    coordinates: [
      [
        [x, y],
        [x + 2, y],
        [x + 2, y + 2],
        [x, y + 2],
        [x, y],
      ],
    ],
  },
});
const country: AreaFeatureCollection = {
  type: "FeatureCollection",
  features: [
    feature("15", "TEST NORTH", "department", 30, -78, -13),
    feature("04", "TEST SOUTH", "department", 12, -73, -17),
  ],
};
export const focused: AreaFeatureCollection = {
  type: "FeatureCollection",
  features: [feature("150101", "TEST DISTRICT", "district", 30, -78, -13)],
};
export const option = {
  year: 2026,
  month: 2,
  category: "all",
  label: "TEST ALL",
  source: "https://source.example.test/geo",
  importedAt: "2026-11-12T00:00:00Z",
};
export function trends(geographic = false): Trends {
  const a = geographic ? 7 : 20,
    b = geographic ? 11 : 22;
  const points = [
    { period: { year: 2026, month: 1 }, reports: a },
    { period, reports: b },
  ];
  return {
    from: points[0].period,
    to: period,
    category: null,
    department: null,
    province: null,
    district: null,
    comparisonLevel: "department",
    departments: names,
    provinces: [],
    districts: [],
    metrics: {
      totalReports: a + b,
      monthsWithData: 2,
      requestedMonths: 2,
      currentMonthReports: b,
      previousMonthReports: a,
      previousYearMonthReports: null,
      monthlyChangePercent: null,
      yearlyChangePercent: null,
    },
    monthly: points,
    categories: [{ category: "TEST CATEGORY", reports: a + b }],
    territories: [{ code: "15", name: "TEST NORTH", reports: a + b }],
    categorySeries: [{ category: "TEST CATEGORY", monthly: points }],
  };
}
export function populationHistory(q: URLSearchParams): PopulationHistoryData {
  const from = {
    year: Number(q.get("fromYear")),
    month: Number(q.get("fromMonth")),
  };
  const to = { year: Number(q.get("toYear")), month: Number(q.get("toMonth")) };
  const monthly = Array.from(
    { length: (to.year - from.year) * 12 + to.month - from.month + 1 },
    (_, i) => {
      const date = new Date(Date.UTC(from.year, from.month - 1 + i));
      return {
        period: { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 },
        reports: 20,
        population: 10000,
        ratePer100k: 200,
        districtsWithReports: 1,
        missingPopulationDistricts: 0,
        missingGeometryDistricts: 0,
      };
    },
  );
  const territories = ["NORTH", "SOUTH", "EAST", "WEST", "CENTRAL"].map(
    (name, i) => ({
      code: `${String(i + 1).padStart(2, "0")}0000`,
      name: `TEST ${name}`,
    }),
  );
  const selected = q.has("compare")
    ? q.get("compare")!.split(",")
    : territories.slice(0, 3).map((t) => t.code);
  return {
    from,
    to,
    level: "department",
    source: {
      sha256: "test-fixture",
      sourceUrl: "https://www.gob.pe/inei",
      importedAt: option.importedAt,
    },
    monthly,
    territories,
    series: territories
      .filter((t) => selected.includes(t.code))
      .map((t) => ({ ...t, points: monthly })),
    ranking: [
      {
        ubigeo: "150000",
        name: "TEST POPULATION AREA",
        population: 10000,
        reports: 20,
        ratePer100k: 200,
      },
    ],
    quality: {
      expectedDistricts: 2,
      districtsWithReports: 1,
      missingPopulationDistricts: 0,
      missingGeometryDistricts: 0,
      populationDistrictsWithoutGeometry: 0,
      monthsWithReports: monthly.length,
      requestedMonths: monthly.length,
      yearsWithoutPopulation: [],
    },
  };
}
export function populationInsights(q: URLSearchParams): PopulationInsightsData {
  const h = populationHistory(q);
  const mean = (reports: number, rate: number, required: number) => ({
    reports,
    ratePer100k: rate,
    requiredObservations: required,
    reportObservations: required,
    rateObservations: required,
  });
  const values = (
    reports: number,
    population: number,
    rate: number,
  ): PopulationInsightValues => ({
    reports,
    population,
    ratePer100k: rate,
    rolling3: mean(reports, rate, 3),
    rolling12: mean(reports, rate, 12),
    historicalBaseline: mean(reports, rate, 36),
    seasonalBaseline: mean(reports, rate, 3),
    historicalChange: { reportsPercent: 0, ratePercent: 0 },
    seasonalChange: { reportsPercent: 0, ratePercent: 0 },
  });
  const scopeCode =
    q.get("district") ??
    q.get("province")?.padEnd(6, "0") ??
    q.get("department")?.padEnd(6, "0") ??
    "000000";
  return {
    from: h.from,
    to: h.to,
    scopeCode,
    source: h.source,
    lookbackMonths: 36,
    monthly: h.monthly.map((p) => ({
      period: p.period,
      scope: values(20, 10000, 200),
      national:
        scopeCode === "000000" ? values(20, 10000, 200) : values(40, 50000, 80),
      nationalDifferencePer100k: scopeCode === "000000" ? 0 : 120,
      nationalDifferencePercent: scopeCode === "000000" ? 0 : 150,
    })),
  };
}
export async function installFixtures(page: Page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:4183") {
      if (url.pathname.includes("MapServer/2/query"))
        return route.fulfill({
          headers: { "access-control-allow-origin": "*" },
          json: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: { type: "Point", coordinates: [-77, -12] },
                properties: {
                  objectid: 1,
                  comisaria: "TEST STATION",
                  id_dpto: "15",
                  id_prov: "1501",
                  id_dist: "150101",
                },
              },
            ],
          },
        });
      return route.fulfill({
        status: 503,
        body: "External services intentionally unavailable in browser smoke tests.",
      });
    }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const q = url.searchParams,
      dep = q.get("department"),
      province = q.get("province"),
      district = q.get("district");
    const json = async (data: unknown) => route.fulfill({ json: data });
    switch (url.pathname) {
      case "/api/population/insights":
        return json(populationInsights(q));
      case "/api/population/history":
        return json(populationHistory(q));
      case "/api/population/comparison":
        return json({
          year: Number(q.get("year")),
          month: Number(q.get("month")),
          level: "department",
          population: 10000,
          source: {
            sha256: "population-test-fixture",
            sourceUrl: "https://www.gob.pe/inei",
            importedAt: option.importedAt,
          },
          monthly: [],
          ranking: [],
        });
      case "/api/metadata":
        return json({
          latestPeriod: period,
          totalRows: 2,
          availablePeriods: [
            { year: 2025, month: 1 },
            { year: 2026, month: 1 },
            period,
          ],
          imports: [
            {
              kind: "sidpol-national",
              name: "TEST CSV",
              sha256: "test",
              importedAt: option.importedAt,
            },
          ],
          statisticsSource: "https://source.example.test/csv",
          geometrySource: "https://source.example.test/boundaries",
        });
      case "/api/categories":
        return json(["TEST CATEGORY"]);
      case "/api/explorer/rates":
      case "/api/explorer":
        return json({
          period,
          category: null,
          department: dep,
          province,
          district,
          level: dep ? "district" : "department",
          departments: names,
          provinces: dep ? [{ code: "1501", name: "TEST PROVINCE" }] : [],
          districts: dep ? [{ code: "150101", name: "TEST DISTRICT" }] : [],
          summary: {
            period,
            category: null,
            reports: dep ? 30 : 42,
            districtsWithData: dep ? 1 : 2,
            districtsWithoutGeometry: 0,
          },
          ranking: dep
            ? [{ code: "150101", name: "TEST DISTRICT", reports: 30 }]
            : country.features.map((f) => ({
                code: f.properties.code,
                name: f.properties.name,
                reports: f.properties.reports,
              })),
          map: url.pathname.endsWith("/rates")
            ? {
                ...(dep ? focused : country),
                features: (dep ? focused : country).features.map((f) => ({
                  ...f,
                  properties: {
                    ...f.properties,
                    population: 10000,
                    ratePer100k: f.properties.reports! * 10,
                  },
                })),
              }
            : dep
              ? focused
              : country,
        });
      case "/api/trends":
        return json(trends());
      case "/api/concentration/metadata":
        return json({
          setupRequired: false,
          available: [
            option,
            { ...option, month: 1 },
            {
              ...option,
              year: 2025,
              month: 1,
              category: "robbery",
              label: "TEST ROBBERY",
            },
          ],
        });
      case "/api/concentration/trends": {
        const data = trends(true),
          year = Number(q.get("year")),
          from = Number(q.get("fromMonth")),
          to = Number(q.get("toMonth"));
        data.from = { year, month: from };
        data.to = { year, month: to };
        data.category = q.get("category");
        data.monthly = Array.from({ length: to - from + 1 }, (_, i) => ({
          period: { year, month: from + i },
          reports: 7 + i * 4,
        }));
        const total = data.monthly.reduce((sum, x) => sum + x.reports!, 0);
        data.metrics = {
          ...data.metrics,
          totalReports: total,
          currentMonthReports: data.monthly.at(-1)!.reports,
          requestedMonths: data.monthly.length,
          monthsWithData: data.monthly.length,
        };
        data.categories = [{ category: "TEST CATEGORY", reports: total }];
        data.territories = [{ code: "15", name: "TEST NORTH", reports: total }];
        data.categorySeries = [
          { category: "TEST CATEGORY", monthly: data.monthly },
        ];
        return json({
          data,
          countingUnit: "source-classification-rows",
          countScope: "valid-ubigeo-including-unmappable",
          latestPeriod: { year, month: to },
          imports: [
            { ...option, year, month: to, category: q.get("category") },
          ],
        });
      }
      case "/api/concentration":
        return json({
          selection: option,
          spatialDetailAvailable: true,
          sourceRecords: 18,
          mappedRecords: 15,
          visibleRecords: 15,
          cells: [],
          ranking: [],
          monthly: trends(true).monthly,
          gridMetres: 10000,
          minimumCellRecords: 5,
          countingUnit: "source-classification-rows",
          comparisonNote: "TEST ONLY",
        });
      case "/api/concentration/cells":
        return json({
          selection: option,
          gridMetres: Number(q.get("gridMetres")),
          minimumCellRecords: 5,
          cells: [
            { id: "TEST CELL", longitude: -77, latitude: -12, records: 15 },
          ],
          visibleRecords: 15,
          suppressedCells: 1,
          coverage: { west: -82, south: -19, east: -68, north: 1 },
        });
      default:
        return route.fulfill({
          status: 501,
          json: { detail: "Unhandled browser test API route: " + url.pathname },
        });
    }
  });
}
export const test = base.extend<{ app: Page }>({
  app: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await installFixtures(page);
    await use(page);
    expect(errors, "Uncaught application exceptions").toEqual([]);
  },
});
export { expect };
export const filter = (page: Page, name: string) =>
  page
    .locator("#statistics-panel")
    .getByRole("combobox", { name, exact: true });
export async function openFilters(page: Page) {
  if (await page.getByRole("button", { name: "Filtros y ranking" }).isVisible())
    await page.getByRole("button", { name: "Filtros y ranking" }).click();
}
export async function mapHasGeometry(page: Page, rate = false) {
  // Read an actual browser screenshot through a 2D canvas, not private React or
  // MapLibre internals. Count neutral land pixels, excluding the gray background
  // and white navigation buttons. An empty/black WebGL canvas must fail.
  const png = await page.locator(".maplibregl-canvas").screenshot();
  return page.evaluate(
    async ({ b64, rate }) => {
      const image = new Image();
      image.src = "data:image/png;base64," + b64;
      await image.decode();
      const c = document.createElement("canvas");
      c.width = image.width;
      c.height = image.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
      let painted = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (
          Math.abs(pixels[i] - 250) +
            Math.abs(pixels[i + 1] - 248) +
            Math.abs(pixels[i + 2] - 242) <
            10 ||
          (rate &&
            pixels[i + 1] > pixels[i] * 1.05 &&
            pixels[i + 2] > pixels[i] * 1.02 &&
            pixels[i + 1] > 80)
        )
          painted++;
      return painted / (c.width * c.height);
    },
    { b64: png.toString("base64"), rate },
  );
}

export async function closeFilters(page: Page) {
  const sheet = page.getByRole("dialog", { name: "Filtros y ranking" });
  if (await sheet.isVisible()) {
    await sheet
      .getByRole("button", { name: "Ver resultados", exact: true })
      .click();
    await expect(sheet).toBeHidden();
  }
}
