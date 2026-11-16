import { describe, expect, it, vi, afterEach } from "vitest";
import { runInNewContext } from "node:vm";
import { generateSite } from "../../seo/generate";
import {
  validateSnapshot,
  nationalMonthly,
  type StatisticsSnapshot,
} from "../../seo/snapshot";
import { applyPageMetadata, pages, siteOrigin } from "./pageMetadata";
import { initialStatisticsSelection } from "./statisticsSelection";

// Explicitly synthetic fixtures, never an input to production builds.
const fixture = (): StatisticsSnapshot => ({
  version: 1,
  exportedAt: "2026-11-13T10:00:00Z",
  period: { year: 2026, month: 9 },
  imports: [{ sha256: "a".repeat(64), importedAt: "2026-11-12T10:00:00Z" }],
  departments: [
    {
      code: "15",
      name: "TEST DEPARTMENT",
      monthly: [
        { year: 2026, month: 7, reports: 0 },
        { year: 2026, month: 9, reports: 7 },
      ],
      districts: [
        {
          code: "150101",
          name: "TEST DISTRICT",
          province: "TEST PROVINCE",
          reports: 7,
        },
      ],
      categories: [{ name: "TEST CATEGORY", reports: 7 }],
    },
    {
      code: "07",
      name: "TEST CALLAO",
      monthly: [{ year: 2026, month: 9, reports: 3 }],
      districts: [
        {
          code: "070101",
          name: "TEST DISTRICT",
          province: "TEST PROVINCE",
          reports: 3,
        },
      ],
      categories: [{ name: "TEST CATEGORY", reports: 3 }],
    },
  ],
});
const template =
  '<!doctype html><html lang="es-PE"><head><!--seo:start--><!--seo:end--><link rel="stylesheet" href="/assets/app.css"><script type="module" src="/assets/app.js"></script></head><body><div id="root"><!--seo:body--><!--seo:body:end--></div></body></html>';
const parse = (html: string) =>
  new DOMParser().parseFromString(html, "text/html");
afterEach(() => {
  vi.unstubAllEnvs();
  document.head.innerHTML = "";
});

describe("static statistical publication", () => {
  it("reconciles totals and preserves missing months and explicit zeros", () => {
    const s = validateSnapshot(fixture());
    expect(nationalMonthly(s)).toEqual([
      { year: 2026, month: 7, reports: 0 },
      { year: 2026, month: 9, reports: 10 },
    ]);
    const output = generateSite(template, s, "https://example.test", true);
    const national = parse(output.get("estadisticas/peru/index.html")!);
    expect(national.querySelector("strong")?.textContent).toBe("10 denuncias");
    expect(national.body.textContent).toContain("Septiembre 2026");
    expect(national.body.textContent).not.toContain("Agosto 2026");
    expect(national.body.textContent).toContain("Julio 2026");
    expect(national.querySelector('script[type="module"]')).toBeNull();
    expect(
      national.querySelector('link[rel="stylesheet"]')?.getAttribute("href"),
    ).toBe("/assets/app.css");
    const department = parse(
      output.get("estadisticas/departamentos/15-test-department/index.html")!,
    );
    expect(department.body.textContent).toContain("TEST DISTRICT");
    expect(
      department.querySelector('a[href="/?department=15&year=2026&month=9"]'),
    ).not.toBeNull();
    const schema = JSON.parse(
      national.querySelector('script[type="application/ld+json"]')!
        .textContent!,
    );
    expect(schema["@type"]).toBe("Dataset");
    expect(schema.creator.name).toBe("Chapa Tu Choro");
    expect(schema.isBasedOn.creator.name).toContain("MININTER");
    expect(schema.license).toBeUndefined();
    expect(schema.temporalCoverage).toBe("2026-07-01/2026-09-30");
  });
  it.each([
    "districtTotal",
    "categoryTotal",
    "duplicate",
    "wrongGeography",
    "negative",
    "missingProvenance",
    "unsafeCount",
    "futurePeriod",
  ])("rejects inconsistent input: %s", (reason) => {
    const s = fixture();
    if (reason === "districtTotal") s.departments[0].districts[0].reports++;
    if (reason === "categoryTotal") s.departments[0].categories[0].reports++;
    if (reason === "duplicate") s.departments.push(s.departments[0]);
    if (reason === "wrongGeography")
      s.departments[0].districts[0].code = "070101";
    if (reason === "negative") s.departments[0].monthly[0].reports = -1;
    if (reason === "missingProvenance") s.imports = [];
    if (reason === "unsafeCount")
      s.departments[0].monthly[0].reports = Number.MAX_SAFE_INTEGER + 1;
    if (reason === "futurePeriod")
      s.departments[0].monthly.push({ year: 2026, month: 10, reports: 1 });
    expect(() => validateSnapshot(s)).toThrow();
  });
  it("escapes source names in HTML and JSON-LD without creating injected scripts", () => {
    const s = fixture();
    s.departments[0].name = "</script><script>alert(1)</script> $&";
    const output = generateSite(
      template,
      validateSnapshot(s),
      "https://example.test",
      true,
    );
    const key = [...output.keys()].find((k) =>
      k.startsWith("estadisticas/departamentos/15-"),
    )!;
    const html = output.get(key)!;
    const doc = parse(html);
    expect(doc.querySelectorAll("script")).toHaveLength(1);
    expect(doc.querySelector("h1")?.textContent).toContain(
      s.departments[0].name,
    );
    expect(
      JSON.parse(doc.querySelector("script")!.textContent!).spatialCoverage
        .name,
    ).toContain(s.departments[0].name);
    expect(doc.title).toContain("$&");
  });
  it("publishes distinct entry-point metadata and only real canonical pages in sitemap", () => {
    const output = generateSite(
      template,
      fixture(),
      "https://example.test",
      true,
    );
    expect(parse(output.get("denunciar/index.html")!).title).toBe(
      pages.action.title,
    );
    expect(
      parse(output.get("tendencias/index.html")!)
        .querySelector('link[rel="canonical"]')
        ?.getAttribute("href"),
    ).toBe("https://example.test/tendencias");
    expect(output.get("sitemap.xml")).toContain(
      "https://example.test/estadisticas/departamentos/15-test-department/",
    );
    expect(
      output
        .get("sitemap.xml")
        ?.match(/<loc>(.*?)<\/loc>/g)
        ?.every((loc) => !loc.includes("?")),
    ).toBe(true);
    expect(output.get("sitemap.xml")).not.toContain("lastmod");
    expect(output.get("robots.txt")).toContain(
      "Sitemap: https://example.test/sitemap.xml",
    );
  });
  it("keeps previews and unavailable statistics out of the index without inventing values", () => {
    const unavailable = generateSite(
      template,
      null,
      "https://example.test",
      true,
    );
    const doc = parse(unavailable.get("estadisticas/peru/index.html")!);
    expect(
      doc.querySelector('meta[name="robots"]')?.getAttribute("content"),
    ).toBe("noindex,follow");
    expect(doc.querySelector("table, script")).toBeNull();
    expect(unavailable.get("sitemap.xml")).not.toContain("/estadisticas/peru/");
    const preview = generateSite(template, fixture(), null, true);
    expect(preview.get("sitemap.xml")).not.toContain("<url>");
    expect(
      parse(preview.get("index.html")!).querySelector('link[rel="canonical"]'),
    ).toBeNull();
    expect(
      parse(preview.get("index.html")!)
        .querySelector('meta[name="robots"]')
        ?.getAttribute("content"),
    ).toBe("noindex,follow");
    expect(
      generateSite(template, fixture(), "https://example.test", false).get(
        "sitemap.xml",
      ),
    ).not.toContain("<url>");
  });
  it("routes published HTML at CloudFront and returns genuine 404s for unknown paths", () => {
    const code = generateSite(
      template,
      fixture(),
      "https://example.test",
      true,
    ).get("cloudfront-router.js")!;
    const handler = runInNewContext(`${code}; handler;`) as (
      event: unknown,
    ) => {
      uri?: string;
      statusCode?: number;
      headers?: Record<string, { value: string }>;
    };
    const request = (uri: string, querystring = {}) =>
      handler({ request: { uri, querystring } });
    expect(request("/").uri).toBe("/index.html");
    expect(request("/denunciar").uri).toBe("/denunciar/index.html");
    expect(request("/estadisticas/departamentos/15-test-department/").uri).toBe(
      "/estadisticas/departamentos/15-test-department/index.html",
    );
    expect(request("/estadisticas/departamentos/15-invented/").statusCode).toBe(
      404,
    );
    expect(request("/unknown").statusCode).toBe(404);
    expect(request("/assets/app.mjs").uri).toBe("/assets/app.mjs");
    for (const icon of ["/favicon.svg", "/favicon.ico", "/apple-touch-icon.png"]) {
      expect(request(icon).uri).toBe(icon);
    }
    expect(
      request("/tendencias/", { department: { value: "15" } }).headers?.location
        .value,
    ).toBe("/tendencias?department=15");
    expect(new TextEncoder().encode(code).length).toBeLessThan(10000);
  });
  it("fails publication if the actual generated route artifact exceeds the edge limit", () => {
    const s = fixture();
    s.departments = Array.from({ length: 25 }, (_, i) => {
      const code = String(i + 1).padStart(2, "0");
      return {
        ...s.departments[0],
        code,
        name: "a".repeat(300),
        districts: [{ ...s.departments[0].districts[0], code: `${code}0101` }],
      };
    });
    expect(() =>
      generateSite(template, validateSnapshot(s), "https://example.test", true),
    ).toThrow("CloudFront routing exceeds 10 KB");
  });
});
describe("metadata and map entry", () => {
  it("updates metadata when client navigation changes the page", () => {
    vi.stubEnv("VITE_SITE_URL", "https://example.test");
    document.head.innerHTML =
      '<title></title><meta name="description"><meta property="og:title"><meta property="og:description"><meta property="og:url"><link rel="canonical">';
    applyPageMetadata(pages.trends);
    expect(document.title).toBe(pages.trends.title);
    expect(
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content"),
    ).toBe(pages.trends.description);
    expect(
      document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
    ).toBe("https://example.test/tendencias");
    applyPageMetadata(pages.action);
    expect(
      document
        .querySelector('meta[property="og:url"]')
        ?.getAttribute("content"),
    ).toBe("https://example.test/denunciar");
  });
  it("rejects unsafe canonical configuration", () => {
    for (const value of [
      "http://example.test",
      "https://user:secret@example.test",
      "https://example.test/path",
      "https://example.test/?q=x",
    ])
      expect(() => siteOrigin(value)).toThrow();
    expect(siteOrigin("")).toBeNull();
    expect(siteOrigin("https://example.test/")).toBe("https://example.test");
  });
  it("accepts only supported geography and period filters", () => {
    expect(
      initialStatisticsSelection("?department=15&year=2026&month=9"),
    ).toEqual({ department: "15", period: { year: 2026, month: 9 } });
    expect(
      initialStatisticsSelection("?department=99&year=2026&month=13"),
    ).toEqual({ department: "", period: null });
    expect(
      initialStatisticsSelection("?department=15<script>&year=NaN&month=1"),
    ).toEqual({ department: "", period: null });
  });
});
