# Reproducible browser smoke tests

The browser suite is checked into `frontend/e2e/`, configured by `frontend/playwright.config.ts`, and runs the production frontend build in Chromium on desktop and Pixel 7 mobile profiles. It owns loopback port **4183** and refuses to reuse an existing server. It neither starts Compose nor imports, resets or modifies a database.

## Run locally

From the repository root:

```bash
npm --prefix frontend ci
cd frontend
npx playwright install chromium
npm run test:e2e
```

On Linux, if browser system libraries are missing, use `npx playwright install --with-deps chromium`. Keep `VITE_API_BASE_URL` empty, as for the normal same-origin application. The command builds the app, type-checks browser configuration/fixtures, starts its own preview server and runs the desktop/mobile regression projects. It closes its preview server on completion. An unavailable browser or unexpected HTTP route fails rather than silently skipping checks.

For the additional **real-backend browser CORS check**, start the local application using the README, then run:

```bash
cd frontend
CTC_E2E_API_URL=http://127.0.0.1:5173 npm run test:e2e
```

This also enables the real-backend project. The API must be reachable at `/api/health`, and its CORS policy must not allow the test website origin `http://127.0.0.1:4183`. Production defaults (`Cors:AllowedOrigins = []`) satisfy that condition. The API health route does not require an imported database. If explicitly enabled and the API is unreachable, this test fails; it is not silently skipped. Without `CTC_E2E_API_URL`, only the separate real-backend project is omitted; the frontend projects still run.

To reuse an installed browser cache set `PLAYWRIGHT_BROWSERS_PATH` as documented by Playwright. No hardcoded workspace/cache path is in the test code. Use `npx playwright show-report` for the HTML report and `npx playwright show-trace test-results/.../trace.zip` to inspect a failure.

## Coverage and boundaries

| Scenario | What is verified |
| --- | --- |
| All optional layers off | Actual rendered neutral-land pixels remain, count legend hides, statistical colors restore, one map canvas remains |
| Geographic navigation and street failure | Department focus/return work; a failed provider does not erase neutral context |
| Police-station opt-in | No initial station fetch; enabling loads a test station; statistics toggle is independent |
| Concentration mode | Statistical controls hide; changing to 500 m updates the legend; returning restores statistics |
| Separate trend sources | Complaint/record chart units, archive category selection without invented total, failure clears charts, retry restores them, CSV slider returns, no horizontal overflow |
| Real API CORS (optional locally, enabled in CI) | A browser page on an unlisted origin cannot read the actual API response; no CORS permission is returned for an untrusted Origin; same-origin API reads work |

Frontend scenarios deliberately intercept API/provider traffic with **synthetic, explicitly TEST-labeled fixtures**. No official case locations, personal data or credentials are embedded. All external services are intercepted, making this a deterministic browser regression suite rather than a live government-service availability test. Unknown application API routes fail with a test error. The map is real MapLibre/WebGL: a screenshot is decoded in the browser and checked for neutral-land pixels; white control buttons and an empty background cannot satisfy that assertion. Tests do not access private React/MapLibre internals.

These tests complement, rather than replace, xUnit/PostGIS and Python importer tests and the historical real-dataset validation evidence. They do not certify provider licensing, coordinate accuracy, unique crime identity, public deployment readiness or physical phone-app behavior. The CORS test leaves the API response unmocked; its separate test-origin HTML is only a browser harness.

## CI and artifacts

The existing frontend job runs unit tests/build, installs Chromium/system dependencies, publishes a local .NET API and starts it with production CORS defaults and a dummy connection string. Only `/api/health` is called; no database is needed for this check. It then runs all browser projects against the existing frontend build with `npm run test:e2e:built`, avoiding a second Vite build. The standalone `npm run test:e2e` command still builds first. CI uses one worker, rejects focused tests, and permits one retry with traces retained for diagnosis. Failed screenshots/traces/reports are uploaded for seven days. This configuration has been checked in; no successful remote GitHub Actions run is implied by local results.

`test-results/`, `playwright-report/` and `blob-report/` are excluded from Git and Docker contexts. Generated browser artifacts must not be committed as real crime data. The test runner and browser version are linked by the pinned Playwright dependency/lockfile.

## Security dependency and deployment check

The browser-closeout install exposed the existing MapLibre attribution sanitizer advisory [GHSA-jrc7-96c5-q579](https://github.com/advisories/GHSA-jrc7-96c5-q579). MapLibre was upgraded from 5.24.0 to the pinned patched 6.18.0 release. The v6 namespace import and explicit, version-matched local worker asset are included in the frontend build. nginx explicitly serves `.mjs` workers as JavaScript and returns 404 for missing workers instead of SPA HTML. No worker CDN dependency or frontend secret was introduced. The browser map-pixel check detects a missing/broken worker even when controls and React content appear normal.

Use `docker compose --profile app up --build -d` to run the application locally. Historical isolated-service verification is recorded in the [archived validation ledger](archive/mvp-validation.md).

## SEO resources

The desktop/mobile projects also run `e2e/seo.spec.ts`: useful initial HTML with JavaScript disabled, distinct entry-point titles/descriptions, methodology/statistical pages without map scripts, mobile overflow and genuine unknown-page 404s. These cases support both an explicitly missing statistical edition and a validated local export. They do not create test data in a production build. [Static publishing setup](seo/publishing.md).

## Phase 4 historical closeout

Desktop/mobile regressions cover shared history/population filters, four-peer selection limits, normalized map legend and painted geometry, coordinated initial population loading, API-failure recovery and failed lazy trends-module recovery. Methodology rates and limitations remain readable without JavaScript. The map screenshot helper recognizes both neutral land and the rate palette. [Executed local evidence](evidence/phase-4-closeout-2026-11-13.json).

Advanced-statistics cases run in both desktop and mobile projects: `advanced statistics share dates and switch smoothing without new requests` and `failed advanced analysis preserves reports and recovers explicitly`. Public methodology remains accessible without JavaScript. [Advanced Phase 4 evidence](evidence/phase-4-advanced-statistics-2026-11-13.json) also records real-data formula and browser validation.
