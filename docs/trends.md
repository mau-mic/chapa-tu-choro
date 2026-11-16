# Historical trends

Trends now offers **Denuncias** (default) and **Delitos**. They remain separate SIDPOL publications with different counting units; selecting a source never combines or subtracts their totals. The geographic title and notice explicitly describe source-classification rows, not unique crimes or proven judicial events.

The header opens **Mapa** by default and switches to **Tendencias** without losing the category, department, province or district. The map retains its monthly period; CSV trends retain an independent inclusive year range; geographic trends retain their own annual publication, category and month range. Trends use the same geography options and parent-reset rules as the map. Changing department clears province/district; changing province clears district. Year/month/category changes preserve geography. Returning to the map preserves the district focus.

## Statistical CSV interface

- Use the two-thumb **Período disponible** slider to choose **Año inicial** and **Año final** from the imported year bounds, including a single selected year. The initial range covers the available years up to the existing ten-year API limit. The range begins in January of the selected first year. All twelve final-month choices remain selectable; explicit choices are preserved even when records are absent. The default closing month is the latest imported month of the final year, or December when that year has no observations. Missing months remain gaps rather than silently moving the selection. A dataset containing only one year displays that year without an invalid zero-width slider. Dragging updates draft labels locally and submits once on release; keyboard changes commit without losing thumb focus. When the ten-inclusive-year limit is reached, moving a thumb adjusts the opposite end. Retrying or switching views preserves the committed range.
- Indicators show the available range total, selected final-month total, month-over-month change and change against the same month in the previous year.
- The line chart switches between **Total** and **Por modalidad**. Each modality can be toggled locally, or selected with Todas/Ninguna, without another API request. All series preserve null gaps and explicit zero. The gray translucent tooltip uses the page typography and displays month, series and exact report count. It supports mouse hover, touch and keyboard focus; left/right arrows navigate observed points within a series and Escape dismisses the tooltip. Tables include the selected modality series.
- The pie chart displays each source category separately so every individual modality has a corresponding line color. Colors use the shared imported category catalog, independent of ranking order and geographic/period filters. Hover, tap or keyboard-focus a slice to display the same shared gray translucent tooltip as the line chart, including the selected range, modality, exact count and percentage of the range total. Escape dismisses it; native SVG titles are omitted to prevent competing browser tooltips. The source category **Otros** remains an original source label; the visualization does not invent an additional grouped category.
- Horizontal bars compare up to ten territories: departments nationally, provinces within a department, districts within a province, or the selected district alone. Expandable tables expose every returned category/territory and all monthly values, including nulls. Focusable chart marks, accessible labels and tables provide exact values without requiring a mouse.
- Loading clears stale figures and displays skeletons. Failures offer manual retry; HTTP 429 displays the server's retry delay. Cancellation and filter keys prevent an old request from replacing newer data. No automatic retry loop is used.

Charts are native SVG/HTML and share the existing design tokens. They require no external chart library, third-party service or API key. Mobile layouts stack the charts; skeletons respect reduced motion.

## Metrics and data integrity

Only imported MININTER/SIDPOL aggregate counts are used; no incidents, geographic coordinates, population estimates or counts are generated. Geography uses official UBIGEO. Districts with report rows but missing geometry are included in trends; INEI labels are preferred for departments/districts when available. Province labels remain source labels grouped by UBIGEO, not separate categories for spelling variants.

An absent monthly aggregate is `reports: null`, not zero. `totalReports` is null when all requested months are absent; otherwise it sums observed counts, including explicit zeros. `monthsWithData` and `requestedMonths` describe observation availability, not a guarantee of complete coverage. Range category and territory totals sum the same observed rows and reconcile to the range total.

Changes compare **the selected final month**, rather than whole ranges. The query also reads its previous month and the same month one year earlier, even if outside the visible range. For current count `c` and reference `p`, the application computes `(c-p)/p*100`, rounded to two decimal places. A missing current/reference or reference zero gives null, displayed as **No calculable**. A current reported zero against a positive reference gives -100%.

The original trend charts use absolute counts. The separate population analysis provides same-year normalized rates. Variations are changes in available registered reports, not estimates of crime risk or causation. Latest imported period and the original government source are always shown. No assumption is made that a recently published dataset covers future or complete periods.

## API contract

```text
GET /api/trends?fromYear=2025&fromMonth=10&toYear=2026&toMonth=9
    [&category=...][&department=04][&province=0401][&district=040101]
```

- Dates must be valid years 2000–2100 and months 1–12. The range is inclusive, ordered, and bounded to 120 months.
- Category is trimmed, exact-match and at most 200 characters. Geography uses the same shared validation as `/api/explorer`: department two ASCII digits; province four and matching department; district six and matching department and any province. A district can be selected across all provinces of a department.
- Invalid parameters return 400 ProblemDetails; unknown selected geography returns 404. Empty periods/categories are valid 200 responses with explicit gaps and empty distributions.
- Response: `from`, `to`, selected filters, `comparisonLevel`, `departments`, `provinces`, `districts`, `metrics`, `monthly`, `categories`, `territories`, `categorySeries`.
- `metrics`: nullable `totalReports`, `currentMonthReports`, `previousMonthReports`, `previousYearMonthReports`, `monthlyChangePercent`, `yearlyChangePercent`; integer `monthsWithData`, `requestedMonths`.
- `monthly`: ordered `{period: {year, month}, reports: integer|null}` for every requested month.
- `categorySeries`: `{category, monthly: [{period: {year, month}, reports: integer|null}]}`. Each category present in the scoped range has exactly one aligned point per requested month. Its observed monthly values sum to its category total. The same period/category/geographic predicates apply to every series.
- `categories`: `{category, reports}` descending by count with deterministic category ties; no API truncation.
- `territories`: `{code, name, reports}` descending by count then UBIGEO; no API truncation.

`GetTrendsHandler` in Application owns range/geography validation, explicit gaps, totals and percentages. `ITrendsReadRepository` returns sparse observations and grouped data. Infrastructure uses parameterized Npgsql SQL and an existing PostGIS-enabled pool; reads share a repeatable-read transaction so charts and selectors describe one snapshot. Range tuple predicates use existing `(year, month, ...)` indexes; no schema migration or additional service is required. `GeographicOptionsReader` reuses the explorer's selectors without generating or downloading polygons. Minimal API endpoints only bind inputs and map Result to HTTP.

See [API protection](rate-limiting.md) for all endpoint limits and deployment constraints.

## Geographic dashboard

Select **Delitos** in Tendencias. The existing line/pie/bar charts and themed tooltips are reused with **registros** as their unit. Department/province/district filters remain shared with the map, with the same parent-reset behavior. The statistical CSV year range and modality remain stored separately; geographic filter changes do not trigger CSV trend requests. Switching back restores the statistical controls and complaint units.

Choose an **annual publication**, its **source category**, and inclusive initial/final months from completed concentration imports. Interior missing months remain explicit gaps. 2026 uses exactly `active-2026`; `all` means the authoritative source total. 2025 requires an individual category archive and never offers a fabricated all-archive total. Cross-year ranges and annual percentage changes are disabled because these publications are heterogeneous. January's previous-month comparison is also unavailable when its reference belongs to another source year. Comparisons within the same annual/category source use the existing null/zero rules.

Counts sum `concentration_areas.source_records`: records with accepted territorial identifiers, **including records without usable map coordinates**. They do not sum visible map circles or `mapped_records`, and therefore do not depend on viewport, map zoom or the five-record display threshold. For example, October 2026 has **38,449** territorially accepted rows versus **38,414** mappable rows. No individual ID, coordinate or address is exposed by the trends endpoint.

For the 2026 `all` selection, the currently disjoint named modality-code groups plus the derived **Otras modalidades de la fuente** residual reconcile with the authoritative total. The residual is explicitly a derived remainder, not an additional official category or an independently imported statistic. An inconsistent negative residual fails instead of inventing a corrected number. A selected category has a single-category distribution; the 2025 pie therefore represents only the chosen archive. Counts, categories, aligned series and territorial bars all reconcile to the same scoped source total.

Loading, explicit zero, missing months, absent imports, invalid filters, 429 and failed requests have distinct states. Cancellation, 25-second client timeouts, version/filter keys and manual retry prevent stale charts. The selected source's latest available period and per-month original source/import timestamps are shown. This is a new query over existing imports; there is no schema migration or ingestion rerun for already imported concentration data.

### Geographic API

```text
GET /api/concentration/trends?year=2026&fromMonth=1&toMonth=10&category=all
    [&department=15][&province=1501][&district=150122]
```

- One registered annual source, ordered months 1–12, exact registered category and the shared validated geographic hierarchy. 2025 `all` and cross-year application queries are rejected. A missing source/category returns 404; absent concentration setup returns 503; invalid queries return 400 ProblemDetails.
- Response: `{data: TrendsDto, countingUnit: "source-classification-rows", countScope: "valid-ubigeo-including-unmappable", latestPeriod, imports: ConcentrationOption[]}`. The existing chart transport's `reports` fields carry the explicitly tagged record unit for this route; the original `/api/trends` contract is unchanged.
- `GetConcentrationTrendsHandler` owns validation/source policy. `ConcentrationTrendsReadRepository` uses parameterized aggregate queries and one repeatable-read transaction for availability, provenance and counts; commands time out at 20 seconds. It never reads the precise location table. Official geography and available UBIGEO codes support selectors without requiring CSV observations; statistical labels may supply province names, never metric counts. Missing names fall back to the actual code.
- Application `GetTrendsHandler.Project` shares aligned gaps, metrics and category-series projection across sources. Previous-year observations are never supplied from another geographic source. Minimal endpoints remain thin, preserving centralized exceptions, Result/ProblemDetails, Serilog and CORS.
- The route uses the stricter existing query limit (20/minute per client/endpoint by default), plus global/client/concurrency protection. No new package, service or cloud resource is required.

See [counting-unit validation](data-counting-units.md) and [concentration source policy](concentration.md) for the limits of cross-source interpretations.

## Population comparison (Phase 4)

The existing charts above remain absolute counts. Below CSV trends, **Denuncias y población** provides a separate monthly comparison: population, report count, rate per 100,000 projected residents, monthly table across every selected year through the shared cutoff and a territorial ranking sortable by count or rate. The shared sidebar year range and final-month selector control both sections; the population comparison uses the final month and its annual denominator. Geography and category are shared, while ranking order remains a presentation control inside its chart. Its optional data/chunk failures do not replace the existing trend charts. The geographic source remains separate. See [population import, endpoint and interpretation](ingestion/population.md).

The population analysis now covers the full shared year range with same-year monthly denominators and up to four independently selected territorial series. A local count/rate switch changes presentation without fetching again. Missing denominators leave gaps while preserving report counts. Visible quality indicators distinguish observed coverage from reporting completeness. Initial loading is coordinated across the dashboard; subsequent queries retain local loading/error states. See the population documentation for the history and rate-map contracts.

### Simple period selection and unavailable data

The sidebar slider is the only year control for Denuncias and population analysis. Both requests use the same initial year and final year/month. The population monthly table follows the complete selected range, in a bounded scroll region; summary KPIs and territorial rankings refer to the closing month. There are no population-specific date controls. Missing counts/rates are labeled **No hay datos disponibles** and all-missing charts show an empty state instead of empty axes. An unavailable population publication (`population.unavailable`) is an empty state; unknown territories, connectivity failures and server errors retain their error/retry behavior. Source switch labels are simply **Denuncias** and **Delitos**; provenance and the distinct counting units remain documented and linked. Geographic annual publication controls remain independent, as these sources cannot form a comparable cross-year series.

## Advanced Phase 4 analysis

Denuncias includes 3/12-month moving averages, a prior-only 36-month historical baseline and a same-month previous-three-year seasonal reference. The shared sidebar remains the only date control; chart selectors change presentation locally. Each reference requires complete count/rate windows and exposes sample availability. Selected territories also have a national rate line, weighted from national totals and same-year population; all-Peru selection avoids a redundant comparison. Missing values, zero references, source changes and recoverable failures remain explicit. See [formulas and insights API](ingestion/population.md#moving-averages-historical-references-and-national-comparison).
