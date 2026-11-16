# Searchable pages and static statistical publishing

Chapa Tu Choro keeps the interactive React/Vite/MapLibre application and publishes additional HTML resources at build time. No rendering server, new API endpoint or public database access is introduced. Search engines and people without JavaScript can read the same published tables. This improves technical eligibility; rankings, indexing and inclusion in Google AI Overviews/AI Mode are not guaranteed.

## What is generated

| URL | Content |
| --- | --- |
| `/` | National map entry, descriptive initial HTML and links to resources; React starts the map when JavaScript is enabled. |
| `/tendencias` | Distinct title/description and initial historical-statistics explanation; existing interactive charts remain. |
| `/denunciar` | Distinct metadata and initial links to the existing official reporting resources; React provides the complete guide. |
| `/metodologia/` | Sources, counting units, territorial/period scope, privacy and interpretation limits, readable without JavaScript. |
| `/estadisticas/peru/` | Latest imported CSV month: departmental totals, monthly history, modalities and provenance. |
| `/estadisticas/departamentos/NN-name/` | Same edition for one department, including district/province names and UBIGEO. Codes prevent slug collisions. |

Statistical pages contain HTML tables and do not load the map JavaScript. They link back to `/?department=NN&year=YYYY&month=M`; the map validates these initial filters and falls back to its latest available period if the requested one is unavailable. Interactive filter permutations canonicalize to the map entry instead of creating thousands of indexable URLs. District pages and article/news generation are not implemented.

Each page has a Spanish title/description, Open Graph/Twitter text metadata and, when configured, an absolute canonical URL. Statistical pages have `Dataset` JSON-LD matching visible scope/period and source attribution. No license, official endorsement, individual-event coordinates or unverified crime-risk score is invented. A sitemap includes only actual published canonical pages. No artificial `lastmod` timestamp is added on every build.

## Build configuration

Set public build variables in `frontend/.env.local` or the build environment:

```dotenv
VITE_SITE_URL=https://YOUR-ACTUAL-PUBLIC-HOST
VITE_SEO_NOINDEX=false
```

Replace the host with the real HTTPS origin. It must have no credentials, subpath, query or fragment. Both a custom domain and an assigned HTTPS hosting address can work; no domain purchase or AWS deployment is required to develop this feature. Use one stable canonical host before public indexing. DNS, custom-domain certificates/aliases, redirects between hosts and domain ownership are separate launch work.

**An empty `VITE_SITE_URL` produces `noindex,follow` pages, no canonical URLs and an empty sitemap.** Set `VITE_SEO_NOINDEX=true` for preview environments even if testing a real canonical origin. `robots.txt` allows crawling so crawlers can read `noindex`; it is not an access-control mechanism. These settings do not change API CORS, rate limits or authentication. Never place a secret in `VITE_*` variables.

Without a statistics snapshot, general pages still build. The national statistics page explicitly says no edition is published, has no fabricated totals or Dataset markup, is `noindex` and is omitted from the sitemap. Department pages are not created. With a supplied snapshot, invalid/missing input or inconsistent totals fails the build; do not upload artifacts from a failed build.

## Produce a consistent snapshot

`ingestion.export_statistics` owns the read-only export. It uses the existing local `DATABASE_URL` or Lambda-compatible `DATABASE_URL_PARAMETER_NAME` connection configuration. The exporter uses one **REPEATABLE READ, READ ONLY** transaction and a 60-second statement timeout. It requires a successful `sidpol-national` import audit and imported aggregates. It never reads geographic concentration/private coordinate tables, and it does not import or update anything.

From the repository root, with the normal Python dependencies installed:

```bash
python -m ingestion.export_statistics --output frontend/.generated/statistics.json
npm --prefix frontend run build
```

`frontend/.generated/` is ignored by Git. The JSON is a build input, not copied as a public downloadable dataset. It contains only aggregate counts/names and safe CSV audit hashes/timestamps. It excludes local source filenames, connection details, addresses, case IDs and positions. The final HTML publishes the corresponding aggregate tables. The exporter atomically replaces the file only after the read succeeds; failure preserves the previous input. A build validates nonnegative safe counts, periods, unique identifiers, district/department relationships and reconciliation of monthly/category/district totals.

For local Docker development, from the repository root:

```bash
docker compose up -d --wait postgis
docker compose --profile etl build etl
mkdir -p frontend/.generated
docker compose --profile etl run --rm --no-deps \
  --user "$(id -u):$(id -g)" \
  --volume "$PWD/frontend/.generated:/publish" \
  --entrypoint python etl \
  -m ingestion.export_statistics --output /publish/statistics.json
docker compose --profile app up --build -d
```

The UID/GID option avoids root-owned publication files on Linux. Compose passes `VITE_SITE_URL`/`VITE_SEO_NOINDEX` from the shell or root Compose `.env` as public web-image build arguments; rebuild the web image when changing them. Docker builds exclude `.env*` files, so `frontend/.env.local` only configures direct Vite builds. Snapshot files under `.generated/` are intentionally included in the web build context.

For the Vite development server, methodology and statistical resources are also served by the plugin. If using a custom snapshot path, set `SEO_STATISTICS_FILE` in the frontend environment file or build process; it is resolved relative to `frontend/`, can be absolute, and is never exposed to the browser. An explicitly supplied missing file fails rather than silently falling back.

A private publication role needs schema USAGE and SELECT on `monthly_reports`, `import_runs`, and `department_boundaries`. No write, private tracking-table or concentration-location privileges are needed. For Supabase, use the existing TLS/search-path/pooler settings from the ingestion guide. Target permissions must be configured by an authorized operator; no Supabase changes are performed by these scripts.

## Updates and production architecture

Export **after a successful statistical import**, then build and validate a new site artifact before publishing it. The exporter is separate from ingestion so a publication failure cannot relabel an already committed import as failed. It does not run automatically from the scheduled ingestion Lambda, upload a site, or trigger a deployment. A deployment pipeline can run the same command against its permitted database, then build; the underlying Python module can also run in the existing ingestion runtime. Public publishing remains an explicit release step.

Static pages label both the reporting month and export time; export/import times are not provider publication or event dates. The map continues querying live aggregates and can become newer than a static edition until it is rebuilt. Historical gaps stay absent, explicit zeros stay zero, and no monthly sum combines SIDPOL CSV counts with geographic classification rows. Existing imports may overlay incremental releases; their hash/date history is retained without asserting a one-file-to-each-row lineage.

nginx serves generated directory indexes and the existing interactive entry points. Unknown pages return a real 404 instead of the map with HTTP 200; API proxy errors retain their status and receive `X-Robots-Tag: noindex`.

For the planned private S3/CloudFront hosting, each build also generates `dist/cloudfront-router.js`. Terraform's `site-routes.tf` associates it with the static origin's viewer-request behavior. The generated route allowlist rewrites only published HTML paths to their S3 keys, redirects alternate trailing-slash forms while preserving query parameters, and returns unknown pages as 404. The separate `/api/*` cache behavior is unchanged. It does not globally turn API 403s into HTML. Asset requests keep their original keys.

The routing function must match the HTML artifact. `frontend_router_path` defaults to `../../frontend/dist/cloudfront-router.js` from the Terraform directory; override it for a differently located release artifact. Terraform validation can run without a build, but deployment planning requires the built router. The current 25-department output fits CloudFront Functions' code-size limit; the build rejects a generated router over 10 KB and tests cover that guard. Reassess that limit before adding many new routes. No Terraform plan/apply or deployment is part of this implementation.

## Verify before enabling indexing

```bash
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run typecheck:e2e
npm --prefix frontend run test:e2e
# Use an isolated database with existing Python test dependencies:
CTC_TEST_DATABASE_URL=postgresql://USER:PASSWORD@HOST/TEST_DB \
  python -m unittest discover -s ingestion/tests -v
terraform -chdir=infra/terraform fmt -check
terraform -chdir=infra/terraform validate
```

Tests cover reconciliation, invalid snapshots, escaped HTML/JSON-LD, missing/zero periods, no-data/noindex states, metadata changes, URL filters, generated edge routing, read-only exporter permissions and atomic output. Chromium tests cover useful initial HTML with JavaScript disabled, lightweight resource pages, desktop/mobile layouts, genuine 404s and the existing interactive map/trends behavior. CI already runs these suites; the maintained browser configuration includes the SEO cases. The tests use synthetic fixtures only inside test infrastructure; production statistics builds use an explicitly exported dataset.

After an authorized public release, verify ownership in Google Search Console, submit `/sitemap.xml`, inspect representative pages/rendered HTML, and validate applicable Dataset markup. Check canonical URLs, crawler access, no accidental `noindex`, correct statuses and current reporting periods on the real host. Search Console verification/submission and live Google indexing are not performed here. Published scope/conditions must still follow [ADR 0002](../adrs/0002-mvp-data-use-with-unresolved-authorization.md).

Official references: [Google AI features](https://developers.google.com/search/docs/appearance/ai-features), [JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), [Dataset markup](https://developers.google.com/search/docs/appearance/structured-data/dataset), [sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap). There is no special AI markup or guaranteed placement in an AI answer.
