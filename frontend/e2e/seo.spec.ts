import { test, expect } from "@playwright/test";

test("initial HTML has useful content and distinct titles without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const titles = new Set<string>();
  for (const path of ["/", "/tendencias", "/denunciar"]) {
    const response = await page.goto(`http://127.0.0.1:4183${path}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /Perú/,
    );
    titles.add(await page.title());
    expect(await page.locator("nav a").count()).toBeGreaterThan(2);
  }
  expect(titles.size).toBe(3);
  await context.close();
});

test("methodology and statistical resources work without loading map JavaScript", async ({
  browser,
  isMobile,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: isMobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const scripts: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "script") scripts.push(r.url());
  });
  await page.goto("http://127.0.0.1:4183/metodologia/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Fuentes y metodología",
  );
  await expect(
    page.getByRole("heading", { name: "¿Qué mide cada fuente?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Población y tasas mensuales" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Medias y referencias históricas" }),
  ).toBeVisible();
  await expect(page.getByText(/Las tasas no se anualizan/)).toBeVisible();
  await page.getByRole("link", { name: "Estadísticas de Perú" }).click();
  await expect(page.locator("h1")).toContainText(/Perú/);
  if (await page.locator("table").count()) {
    await expect(page.locator("table").first()).toContainText("Denuncias");
    const department = page
      .locator('table a[href^="/estadisticas/departamentos/"]')
      .first();
    await department.click();
    await expect(page.locator("table").first()).toContainText("UBIGEO");
    await expect(page.locator('a[href^="/?department="]')).toBeVisible();
  } else {
    await expect(
      page.getByText("No hay una edición de tablas publicada.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex,follow",
    );
  }
  expect(scripts).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.close();
});

test("unknown pages are real 404s rather than successful map responses", async ({
  request,
}) => {
  for (const path of [
    "/does-not-exist",
    "/does-not-exist.html",
    "/estadisticas/",
    "/estadisticas/departamentos/",
    "/estadisticas/departamentos/99-invented/",
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect(await response.text()).toContain("noindex");
  }
});
