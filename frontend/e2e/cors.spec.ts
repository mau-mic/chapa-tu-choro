import { test, expect } from "@playwright/test";
// Real backend, no intercepted API responses. Run with production CORS [] and
// CTC_E2E_API_URL pointing at the local API/Compose public entry point.
const api = process.env.CTC_E2E_API_URL!;
test("another website cannot read the real API, while same-origin reads work", async ({
  page,
  request,
}) => {
  const health = new URL("/api/health", api).href;
  expect((await request.get(health)).ok()).toBe(true);
  await page.route("http://127.0.0.1:4183/", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<title>Untrusted test origin</title>",
    }),
  );
  await page.goto("/");
  const blocked = await page.evaluate(async (url) => {
    try {
      await fetch(url, { mode: "cors" });
      return false;
    } catch {
      return true;
    }
  }, health);
  expect(
    blocked,
    "Browser must reject a response from an unlisted origin",
  ).toBe(true);
  const denied = await request.get(health, {
    headers: { Origin: "https://untrusted.example.test" },
  });
  expect(denied.headers()["access-control-allow-origin"]).toBeUndefined();
  await page.goto(health);
  const sameOrigin = await page.evaluate(async () => {
    const r = await fetch("/api/health");
    return r.ok;
  });
  expect(sameOrigin).toBe(true);
});
