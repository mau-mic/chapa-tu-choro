# Fluid interface adaptation

Approved scope: implement the already proposed approachable, modern direction across the frontend; no Carbon/Datawrapper/ONS adoption and no backend/database changes.

1. Shared interface: update semantic tokens, header/navigation/focus/typography and responsive layout; keep MapLibre geometric palettes. Define visual direction in docs/frontend-design.md.
2. Explorer: add a selection summary with individual removal and reset, preserve current reporting period and source; use Base UI Dialog for the mobile filter sheet and preserve desktop aside. Compose sidebar contents once; keep map mounted across navigation.
3. Trends: emphasize the chart/header and source selector, replace boxed metrics with a readable strip; retain SVG charts, tooltips, accessible tables and distinctions between datasets.
4. Reporting: prioritize the existing emergency resource, place actions before verification details and group existing official resources by purpose. Preserve the danger/situation flow and all existing external destinations.
5. Validate: focused behavior regressions and existing frontend tests; lint/format/typecheck/build; desktop/mobile browser flow, keyboard dismissal/focus, overflow and visual screenshots. Document actual results and limits. Do not deploy or change data.
