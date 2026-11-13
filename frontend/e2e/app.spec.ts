import {
  test,
  expect,
  filter,
  openFilters,
  closeFilters,
  mapHasGeometry,
  focused,
  populationHistory,
} from "./fixtures";

test("all optional layers can be off without losing the map; statistics restore", async ({
  app: page,
}) => {
  await page.goto("/");
  await page.getByRole("checkbox", { name: "Calles y referencias" }).uncheck();
  await page.getByRole("checkbox", { name: "Denuncias SIDPOL" }).uncheck();
  await expect.poll(() => mapHasGeometry(page)).toBeGreaterThan(0.01);
  expect(await mapHasGeometry(page)).toBeLessThan(0.9);
  await expect(
    page.getByLabel("Leyenda de cantidad absoluta de denuncias"),
  ).toBeHidden();
  await expect(
    page.getByRole("checkbox", { name: "Comisarías básicas" }),
  ).not.toBeChecked();
  await page.getByRole("checkbox", { name: "Denuncias SIDPOL" }).check();
  await expect(
    page.getByLabel("Leyenda de cantidad absoluta de denuncias"),
  ).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(1);
});

test("geographic focus, country return and source failure preserve context", async ({
  app: page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("alert").filter({ hasText: "calles" }),
  ).toBeVisible();
  await openFilters(page);
  await filter(page, "Departamento").selectOption("15");
  await expect(filter(page, "Distrito")).toContainText("TEST DISTRICT");
  await closeFilters(page);
  await expect(
    page.getByRole("button", { name: "← Volver a Perú" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "← Volver a Perú" }).click();
  await openFilters(page);
  await expect(filter(page, "Departamento")).toHaveValue("");
  await closeFilters(page);
  await page.getByRole("checkbox", { name: "Denuncias SIDPOL" }).uncheck();
  await expect.poll(() => mapHasGeometry(page)).toBeGreaterThan(0.01);
});

test("station layer loads only on opt-in and stays independent of statistics", async ({
  app: page,
}) => {
  let requests = 0;
  page.on("request", (r) => {
    if (r.url().includes("MapServer/2/query")) requests++;
  });
  await page.goto("/");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  expect(requests).toBe(0);
  await page.getByRole("checkbox", { name: "Comisarías básicas" }).check();
  await expect(
    page.getByRole("status").filter({ hasText: "1 ubicaciones" }),
  ).toBeVisible();
  expect(requests).toBe(1);
  await page.getByRole("checkbox", { name: "Denuncias SIDPOL" }).uncheck();
  await expect(
    page.getByRole("status").filter({ hasText: "1 ubicaciones" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Comisarías básicas" }).uncheck();
  await expect.poll(() => mapHasGeometry(page)).toBeGreaterThan(0.01);
});

test("concentration replaces choropleth and updates its grid legend", async ({
  app: page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Concentración", exact: true })
    .click();
  await expect(page.getByLabel("Leyenda de concentración")).toContainText(
    "10 km por lado",
  );
  await page
    .getByLabel("Agrupación del mapa", { exact: true })
    .selectOption("500");
  await expect(page.getByLabel("Leyenda de concentración")).toContainText(
    "500 m por lado",
  );
  await expect(page.getByLabel("Leyenda de concentración")).not.toContainText(
    "Cargando",
  );
  await expect(
    page.getByRole("checkbox", { name: "Denuncias SIDPOL" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Estadísticas", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Denuncias SIDPOL" }),
  ).toBeChecked();
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(1);
});

test("trend sources use independent controls/units and recover without stale charts", async ({
  app: page,
}) => {
  await page.goto("/tendencias");
  await expect(
    page.getByRole("img", { name: "Gráfico de líneas de denuncias por mes" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delitos" }).click();
  await expect(
    page.getByRole("img", { name: "Gráfico de líneas de registros por mes" }),
  ).toBeVisible();
  await openFilters(page);
  await filter(page, "Publicación anual").selectOption("2025");
  await expect(filter(page, "Categoría de la fuente geográfica")).toHaveValue(
    "robbery",
  );
  await expect(
    filter(page, "Categoría de la fuente geográfica").locator(
      'option[value="all"]',
    ),
  ).toHaveCount(0);
  await page.route("**/api/concentration/trends?**", (r) =>
    r.fulfill({ status: 503, json: { status: 503 } }),
  );
  await filter(page, "Publicación anual").selectOption("2026");
  await closeFilters(page);
  await expect(
    page.getByRole("alert").filter({ hasText: "HTTP 503" }),
  ).toBeVisible();
  await expect(page.locator(".trends-panel .line-chart")).toHaveCount(0);
  await page.unroute("**/api/concentration/trends?**");
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Gráfico de líneas de registros por mes" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Denuncias" }).click();
  await expect(
    page.getByRole("img", { name: "Gráfico de líneas de denuncias por mes" }),
  ).toBeVisible();
  await openFilters(page);
  await expect(page.getByRole("slider", { name: "Año inicial" })).toBeVisible();
  await closeFilters(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("reporting route defers the map bundle and keeps the visited canvas", async ({
  app: page,
}) => {
  const mapModules: string[] = [];
  page.on("request", (request) => {
    if (/\/assets\/CrimeMap-[^/]+\.js/.test(request.url()))
      mapModules.push(request.url());
  });
  await page.goto("/denunciar");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(0);
  expect(mapModules).toHaveLength(0);
  await page.getByRole("link", { name: "Mapa", exact: true }).click();
  const canvas = page.locator(".maplibregl-canvas");
  await expect(canvas).toBeVisible();
  expect(mapModules).toHaveLength(1);
  await canvas.evaluate((node) =>
    node.setAttribute("data-retained-test", "original"),
  );
  await page.getByRole("link", { name: "Denunciar", exact: true }).click();
  await expect(canvas).toBeHidden();
  await page.getByRole("link", { name: "Mapa", exact: true }).click();
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-retained-test", "original");
  expect(mapModules).toHaveLength(1);
});

test("failed deferred map bundle has an understandable recovery action", async ({
  app: page,
}) => {
  await page.route("**/assets/CrimeMap-*.js", (route) => route.abort());
  await page.goto("/denunciar");
  await page.getByRole("link", { name: "Mapa", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "No se pudo abrir esta vista" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Volver a cargar", exact: true }),
  ).toBeVisible();
});

test("concentration geographic filters work without a SIDPOL CSV import", async ({
  app: page,
}) => {
  await page.route("**/api/metadata", (route) =>
    route.fulfill({
      json: {
        latestPeriod: null,
        totalRows: 0,
        availablePeriods: [],
        imports: [],
        statisticsSource: "https://source.example.test/csv",
        geometrySource: "https://source.example.test/boundaries",
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Concentración", exact: true })
    .click();
  await openFilters(page);
  await expect(filter(page, "Departamento")).toBeEnabled();
  await expect(filter(page, "Departamento")).toContainText("TEST NORTH");
  await filter(page, "Departamento").selectOption("15");
  await expect(filter(page, "Distrito")).toContainText("TEST DISTRICT");
});

test("active selections reset without changing period and mobile filters restore keyboard focus", async ({
  app: page,
}, testInfo) => {
  await page.goto("/");
  await openFilters(page);
  await filter(page, "Año").selectOption("2025");
  await filter(page, "Departamento").selectOption("15");
  await expect(filter(page, "Distrito")).toContainText("TEST DISTRICT");
  await filter(page, "Modalidad de delito").selectOption("TEST CATEGORY");
  await page
    .getByRole("button", { name: "Restablecer filtros", exact: true })
    .click();
  await expect(filter(page, "Departamento")).toHaveValue("");
  await expect(filter(page, "Modalidad de delito")).toHaveValue("");
  await expect(filter(page, "Año")).toHaveValue("2025");
  await closeFilters(page);
  const toggle = page.getByRole("button", {
    name: "Filtros y ranking",
    exact: true,
  });
  if (await toggle.isVisible()) {
    await expect(toggle).toBeFocused();
    await toggle.click();
    await expect(
      page.getByRole("dialog", { name: "Filtros y ranking" }),
    ).toBeVisible();
    const sheet = page.getByRole("dialog", { name: "Filtros y ranking" });
    await expect(sheet).toHaveCSS("opacity", "1");
    await expect(
      sheet.getByRole("button", { name: "Ver resultados" }),
    ).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("filters.png") });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(toggle).toBeFocused();
    const viewport = page.viewportSize()!;
    await toggle.click();
    await page.setViewportSize({ width: 1200, height: viewport.height });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".sidebar")).toBeVisible();
    await page.setViewportSize(viewport);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } else await expect(page.locator(".sidebar")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("reporting groups preserve official actions and situation-specific recommendations", async ({
  app: page,
}) => {
  await page.goto("/denunciar");
  await expect(
    page.getByRole("article", { name: "Emergencia policial" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Llamar al 105", exact: true }),
  ).toHaveAttribute("href", "tel:105");
  await expect(
    page.getByRole("region", { name: "Presentar una denuncia", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("radio", { name: "No, quiero consultar cómo denunciar" })
    .check();
  await page
    .getByLabel("2. ¿Qué situación quieres consultar?")
    .selectOption("extortion");
  await expect(
    page.getByRole("article", { name: "Central contra extorsiones" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Llamar al 111", exact: true }),
  ).toHaveAttribute("href", "tel:111");
  await expect(
    page.getByRole("article", { name: "Línea 100", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("responsive views keep clear layout and review screenshots", async ({
  app: page,
}, testInfo) => {
  for (const [path, name] of [
    ["/", "map"],
    ["/tendencias", "trends"],
    ["/denunciar", "reporting"],
  ]) {
    await page.goto(path);
    if (name === "map") {
      await page
        .getByRole("checkbox", { name: "Calles y referencias" })
        .uncheck();
      await page.getByRole("checkbox", { name: "Denuncias SIDPOL" }).uncheck();
      await expect.poll(() => mapHasGeometry(page)).toBeGreaterThan(0.01);
      await page.getByRole("checkbox", { name: "Denuncias SIDPOL" }).check();
    }
    if (name === "trends")
      await expect(
        page.getByRole("img", {
          name: "Gráfico de líneas de denuncias por mes",
        }),
      ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`${name}.png`),
      fullPage: true,
    });
  }
});

// Synthetic long-list fixture, never published as official geography.
const searchableDistricts = Array.from({ length: 80 }, (_, i) => ({
  code: `1501${String(i + 1).padStart(2, "0")}`,
  name: i === 66 ? "TEST Jesús María" : `TEST DISTRICT ${i + 1}`,
}));
async function installLongDistricts(page: import("@playwright/test").Page) {
  await page.route("**/api/explorer?**", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (!query.get("department")) return route.fallback();
    return route.fulfill({
      json: {
        ...focused,
        department: query.get("department"),
        province: query.get("province"),
        district: query.get("district"),
        districts: searchableDistricts,
        period: {
          year: Number(query.get("year")),
          month: Number(query.get("month")),
        },
        level: "district",
        departments: [{ code: "15", name: "TEST NORTH" }],
        provinces: [{ code: "1501", name: "TEST PROVINCE" }],
        summary: {
          period: { year: 2026, month: 2 },
          category: null,
          reports: 30,
          districtsWithData: 1,
          districtsWithoutGeometry: 0,
        },
        ranking: [{ code: "150101", name: "TEST DISTRICT", reports: 30 }],
        map: focused,
      },
    });
  });
}

test("long territorial search loads on intent, filters locally and preserves native selection", async ({
  app: page,
}, testInfo) => {
  await installLongDistricts(page);
  let searchBundles = 0,
    explorerRequests = 0,
    lastDistrict: string | null = null;
  page.on("request", (request) => {
    if (/\/assets\/SearchableTerritory-[^/]+\.js/.test(request.url()))
      searchBundles++;
    if (request.url().includes("/api/explorer?")) {
      explorerRequests++;
      lastDistrict = new URL(request.url()).searchParams.get("district");
    }
  });
  await page.goto("/");
  await openFilters(page);
  await filter(page, "Departamento").selectOption("15");
  await expect(filter(page, "Distrito").locator("option")).toHaveCount(81);
  expect(searchBundles).toBe(0);
  expect(await filter(page, "Año").evaluate((el) => el.tagName)).toBe("SELECT");
  await page
    .getByRole("button", { name: "Buscar distrito", exact: true })
    .click();
  const input = page.getByPlaceholder("Nombre o UBIGEO…");
  await expect(input).toBeFocused();
  expect(searchBundles).toBe(1);
  await expect(page.getByRole("option")).toHaveCount(40);
  const beforeTyping = explorerRequests;
  await input.fill("jesus");
  await expect(
    page.getByRole("option", { name: /TEST Jesús María/ }),
  ).toBeVisible();
  expect(explorerRequests).toBe(beforeTyping);
  await page.screenshot({
    path: testInfo.outputPath("territorial-search.png"),
  });
  await input.press("Escape");
  await expect(page.getByRole("listbox")).toBeHidden();
  if (testInfo.project.name === "mobile")
    await expect(
      page.getByRole("dialog", { name: "Filtros y ranking" }),
    ).toBeVisible();
  await input.fill("150167");
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect.poll(() => lastDistrict).toBe("150167");
  await page
    .getByRole("button", { name: "Usar lista de distrito", exact: true })
    .click();
  await expect(filter(page, "Distrito")).toHaveValue("150167");
  await expect(filter(page, "Distrito").locator("option")).toHaveCount(81);
  await filter(page, "Departamento").selectOption("");
  await expect(filter(page, "Distrito")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Buscar distrito", exact: true }),
  ).toHaveCount(0);
});

test("failed optional search download retains the complete native filter", async ({
  app: page,
}) => {
  await installLongDistricts(page);
  await page.route("**/assets/SearchableTerritory-*.js", (route) =>
    route.abort(),
  );
  await page.goto("/");
  await openFilters(page);
  await filter(page, "Departamento").selectOption("15");
  await expect(filter(page, "Distrito").locator("option")).toHaveCount(81);
  await page
    .getByRole("button", { name: "Buscar distrito", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Puedes usar la lista completa" }),
  ).toBeVisible();
  expect(await filter(page, "Distrito").evaluate((el) => el.tagName)).toBe(
    "SELECT",
  );
  await filter(page, "Distrito").selectOption("150167");
  await expect(filter(page, "Distrito")).toHaveValue("150167");
});

test("population comparison preserves counts, filters and source separation", async ({
  app: page,
}) => {
  let queries: URL[] = [];
  await page.route("**/api/population/history?*", async (route) => {
    const url = new URL(route.request().url());
    queries = [...queries, url];
    await route.fulfill({ json: populationHistory(url.searchParams) });
  });
  await page.goto("/tendencias");
  const panel = page.getByRole("region", { name: "Denuncias y población" });
  await expect(panel.getByText("TEST POPULATION AREA")).toBeVisible();
  await expect(panel.getByLabel("Período de comparación")).toHaveCount(0);
  const trendQueries: URL[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/trends")
      trendQueries.push(new URL(request.url()));
  });
  await openFilters(page);
  await filter(page, "Mes final").selectOption("1");
  await closeFilters(page);
  await expect
    .poll(() => queries.at(-1)?.searchParams.get("toMonth"))
    .toBe("1");
  await expect
    .poll(() => trendQueries.at(-1)?.searchParams.get("toMonth"))
    .toBe("1");
  await expect(
    panel.getByText(/Enero 2026 · Período compartido/),
  ).toBeVisible();
  await panel.getByLabel("Ordenar territorios").selectOption("count");
  await expect(panel.getByText(/No mide el riesgo individual/)).toBeVisible();
  await openFilters(page);
  await filter(page, "Departamento").selectOption("15");
  await closeFilters(page);
  await expect
    .poll(() => queries.at(-1)?.searchParams.get("department"))
    .toBe("15");
  await page.getByRole("button", { name: "Delitos", exact: true }).click();
  await expect(panel).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("trend scrolling stays within its panel without a blank document tail", async ({
  app: page,
}) => {
  await page.goto("/tendencias");
  const panel = page.getByRole("main", { name: "Tendencias históricas" });
  await expect(
    page.getByRole("heading", { name: "Denuncias y población" }),
  ).toBeVisible();
  const desktop = await page.evaluate(() => innerWidth > 940);
  if (desktop) {
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollHeight - innerHeight,
        ),
      )
      .toBeLessThanOrEqual(1);
    await panel.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await panel.hover();
    await page.mouse.wheel(0, 5000);
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await expect(
      page.getByRole("navigation", { name: "Vista principal" }),
    ).toBeVisible();
    await panel.evaluate((element) => {
      element.scrollTop = 0;
    });
    await expect(
      page.getByRole("heading", { name: "Las denuncias, en el tiempo." }),
    ).toBeVisible();
  } else {
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollHeight -
            document.getElementById("root")!.getBoundingClientRect().height,
        ),
      )
      .toBeLessThanOrEqual(1);
  }
});

test("first trends load waits for population then reveals recoverable errors", async ({
  app: page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/population/history?*", async (route) => {
    await gate;
    await route.fulfill({
      status: 503,
      json: {
        title: "Population unavailable",
        detail: "TEST temporarily unavailable",
      },
    });
  });
  await page.goto("/tendencias");
  await expect(
    page.getByRole("status", { name: "Cargando datos oficiales" }),
  ).toBeVisible();
  await expect(
    page.getByRole("main", { name: "Tendencias históricas" }),
  ).toBeHidden();
  await expect
    .poll(() =>
      page
        .locator('.initial-loader [data-slot="skeleton"]')
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
    )
    .toBe("none");
  release();
  await expect(
    page.getByRole("main", { name: "Tendencias históricas" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Cargando datos oficiales" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Reintentar comparación" }),
  ).toBeVisible();
});

test("historical comparison limits peers and rate map retains geometry", async ({
  app: page,
}) => {
  await page.goto("/tendencias");
  const peers = page.getByRole("group", {
    name: "Comparar territorios · hasta 4",
  });
  await expect(peers).toBeVisible();
  await peers.getByRole("checkbox", { name: "TEST WEST" }).check();
  await expect(
    peers.getByRole("checkbox", { name: "TEST CENTRAL" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Calidad y cobertura observada" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cantidad de denuncias", exact: true })
    .click();
  await expect(
    page
      .getByRole("img", { name: "Gráfico de líneas de denuncias por mes" })
      .first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "Mapa", exact: true }).click();
  await page
    .getByRole("button", { name: "Por 100.000 hab.", exact: true })
    .click();
  await expect(
    page.getByLabel("Leyenda de tasa mensual de denuncias"),
  ).toBeVisible();
  await expect.poll(() => mapHasGeometry(page, true)).toBeGreaterThan(0.01);
  await page.getByRole("button", { name: "Cantidad", exact: true }).click();
  await expect(
    page.getByLabel("Leyenda de cantidad absoluta de denuncias"),
  ).toBeVisible();
});

test("failed deferred trends bundle releases the initial loader", async ({
  app: page,
}) => {
  await page.route("**/assets/Trends-*.js", (route) => route.abort());
  await page.goto("/tendencias");
  await expect(
    page.getByRole("heading", { name: "No se pudo abrir esta vista" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Volver a cargar" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Cargando datos oficiales" }),
  ).toHaveCount(0);
});

test("one sidebar period controls reports and population without replacing unavailable dates", async ({
  app: page,
}) => {
  const populationQueries: URL[] = [],
    reportQueries: URL[] = [];
  await page.route("**/api/population/history?*", async (route) => {
    const url = new URL(route.request().url());
    populationQueries.push(url);
    if (url.searchParams.get("toYear") === "2025")
      return route.fulfill({
        status: 404,
        json: { title: "population.unavailable" },
      });
    await route.fulfill({ json: populationHistory(url.searchParams) });
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/trends") reportQueries.push(url);
  });
  await page.goto("/tendencias");
  await expect(
    page.getByRole("button", { name: "Denuncias", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Delitos", exact: true }),
  ).toBeVisible();
  await openFilters(page);
  await expect(page.getByRole("slider")).toHaveCount(2);
  await expect(filter(page, "Mes final").locator("option")).toHaveCount(12);
  await filter(page, "Mes final").selectOption("12");
  await page.getByRole("slider", { name: "Año final" }).focus();
  await page.getByRole("slider", { name: "Año final" }).press("ArrowLeft");
  await expect(page.getByRole("slider", { name: "Año final" })).toHaveAttribute(
    "aria-valuenow",
    "2025",
  );
  await expect(filter(page, "Mes final")).toHaveValue("12");
  await closeFilters(page);
  await expect
    .poll(() => populationQueries.at(-1)?.searchParams.get("toYear"))
    .toBe("2025");
  await expect
    .poll(() => reportQueries.at(-1)?.searchParams.get("toYear"))
    .toBe("2025");
  expect(populationQueries.at(-1)?.searchParams.get("toMonth")).toBe("12");
  expect(reportQueries.at(-1)?.searchParams.get("toMonth")).toBe("12");
  await expect(
    page.getByText("No hay datos disponibles para el período seleccionado.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reintentar comparación" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("status", { name: "Cargando datos oficiales" }),
  ).toHaveCount(0);
});

test("advanced statistics share dates and switch smoothing without new requests", async ({
  app: page,
}) => {
  const insightQueries: URL[] = [];
  page.on("request", (request) => {
    const u = new URL(request.url());
    if (u.pathname === "/api/population/insights") insightQueries.push(u);
  });
  await page.goto("/tendencias");
  await expect(
    page.getByRole("heading", { name: "Evolución y referencias históricas" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Selecciona un departamento, provincia o distrito para compararlo con Perú/,
    ),
  ).toBeVisible();
  await openFilters(page);
  await filter(page, "Departamento").selectOption("15");
  await closeFilters(page);
  await expect(
    page.getByLabel("Comparación con Perú", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => insightQueries.at(-1)?.searchParams.get("department"))
    .toBe("15");
  const requests = insightQueries.length;
  await page
    .getByRole("combobox", { name: "Media móvil", exact: true })
    .selectOption("12");
  await page
    .getByRole("combobox", { name: "Referencia histórica", exact: true })
    .selectOption("historical");
  await expect(
    page.locator('[data-series="Media móvil de 12 meses"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('[data-series="Media de los 36 meses anteriores"]'),
  ).toHaveCount(1);
  expect(insightQueries.length).toBe(requests);
  await page
    .getByRole("button", { name: "Cantidad de denuncias", exact: true })
    .click();
  await expect(page.locator('[data-series="Perú"]')).toHaveCount(1);
  await openFilters(page);
  await filter(page, "Mes final").selectOption("12");
  await closeFilters(page);
  await expect
    .poll(() => insightQueries.at(-1)?.searchParams.get("toMonth"))
    .toBe("12");
  await expect(
    page.getByRole("heading", { name: "Territorio frente a Perú" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("failed advanced analysis preserves reports and recovers explicitly", async ({
  app: page,
}) => {
  let fail = true;
  await page.route("**/api/population/insights?*", async (route) => {
    if (fail)
      return route.fulfill({
        status: 503,
        json: { title: "temporarily-unavailable" },
      });
    return route.fallback();
  });
  await page.goto("/tendencias");
  await expect(
    page.getByRole("heading", { name: "Denuncias y población" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reintentar análisis" }),
  ).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Reintentar análisis" }).click();
  await expect(
    page.getByRole("combobox", { name: "Media móvil", exact: true }),
  ).toBeVisible();
});
