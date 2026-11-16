> Historical record, retained on 2026-11-13. Use the [current documentation index](../README.md) for setup and current behavior. Statements and test results below describe the date recorded, not current validation.

# Phase 1 — guided official reporting

## Scope and reuse

The [Phase 0 assessment](../phase-0-assessment.md) was completed before changes. Existing map/trends, Clean Architecture, Python ETL, SQL bootstrap, API contracts/security and deployment design are preserved. This phase upgrades Actúa into **Denunciar** at `/denunciar`. Only the reporting guide and the navigation required to reach it are implemented; phases 2+ remain recommendations.

Changed application files:

- `frontend/src/lib/reportingResources.ts`: reuse source catalogue; add station/app guides, typed seven-category recommendations and per-channel methods, requirements, anonymity and verification evidence/date.
- `frontend/src/components/TakeAction.tsx`: reuse emergency articles, official links and phone/copy controls; add danger question, category selection, immediate 105 shortcut and independent-platform notice. Only radio/select choices are held in transient React memory. No reports are submitted or stored.
- `frontend/src/lib/navigation.ts` (new): lightweight native History adapter for real links, direct load, trailing slash, reload and Back/Forward. No router/global-state dependency. Existing App state and map canvas remain mounted across views.
- `frontend/src/App.tsx`, `hooks/useStatistics.ts`, `styles.css`: Denunciar navigation, responsive guide and zero API dependency on direct guide loads. Map/trend filters retain their state.
- Existing frontend tests expanded rather than removed: source/phone/copy assertions remain, with new navigation, danger and all seven category-path tests.

No backend endpoint/entity, external client, new service, package, migration, dataset or environment variable is required. Personal information and evidence are entered only on the selected authority's service, never in this app. No analytics, geolocation permission or government iframe is added.

## Official references and uncertainty

The [source register](../reporting-resources.md) records exact links, scopes and lookup failures. Existing references and review dates are preserved. Official indexed instructions were checked for PNP document-only complaints, Fiscalía general complaint guidance, MIMP support, CUD, police-station lookup and Mi Policía Digital. Direct Gob.pe access returned 418 or timeout, and the proposed Fiscalía deep link timed out. Published requirements are presented as source-described, with visible live-availability uncertainty. No unsupported anonymity promise or successful transaction is inferred. Nobody called a hotline, submitted a complaint or installed a government app to test this feature.

## Run and direct-route hosting

Use the README's existing local .NET/Vite or Compose workflow. Open:

```text
http://localhost:5173/denunciar
```

Vite development/preview and `docker/nginx.conf` already provide SPA fallback to `index.html`; reload/direct access work. API `/api/*` continues to use its separate upstream.

**Static production hosting prerequisite:** S3's private object origin does not automatically resolve a client route. Before publishing this frontend via CloudFront, configure a viewer-request URI rewrite on the static default behavior for just these page paths:

```javascript
// Example hosting rule; not deployed or associated by this change.
function handler(event) {
  var request = event.request;
  if (['/denunciar', '/denunciar/', '/tendencias', '/tendencias/'].indexOf(request.uri) !== -1) {
    request.uri = '/index.html';
  }
  return request;
}
```

Do not attach a blanket API/403/404-to-HTML error mapping: API ProblemDetails and missing asset errors must keep their real status/content. This deployment prerequisite is documented rather than provisioning an AWS resource as part of a frontend-focused phase. Existing Terraform does not yet associate this page rewrite; direct CloudFront deep links therefore remain unverified until its ingress is configured. No Terraform plan/apply or live AWS modification was made.

## Validation and next sprint

Run `cd frontend && npm run build && npm test`; build includes TypeScript checks. The repository has no configured lint command. Backend and ingestion regression commands remain in README, with database integrations enabled only against isolated PostGIS. See the latest [validation log](../mvp-validation.md) for executed outcomes, environment prerequisites and skips.

Next sprint: separately approve Phase 2's permitted-source inventory and a documented police-station layer proof of concept. Review capabilities, attribution, license, coverage and service availability before writing an adapter. No WMS/WFS endpoint is assumed, no heatmap is treated as event coordinates, and no Phase 2 integration is implemented here.
