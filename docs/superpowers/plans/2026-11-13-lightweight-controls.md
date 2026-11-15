# Lightweight controls and visual refinement

Authorized direction: refine existing shadcn/Base UI/Tailwind styling, add selected Lucide icons and searchable long territorial lists; keep native period controls and CSS transitions. No Motion, replacement UI kit, API or database change.

1. Add named Lucide imports for navigation, filters and official contact actions. Apply shared interface styles, focus/touch states and semantic tokens without changing statistical palettes.
2. Compose TerritoryField (native select plus explicit search activation for30+ options) and a lazily imported Base UI searchable control. Search name/UBIGEO locally, cap rendered matches and preserve a complete native fallback. Keep stable geographic IDs and inherited disabled semantics.
3. Add focused component and browser regressions. Prove search code loads only on intent, typing does not call the API, Escape closes nested search before sheet and API/source behavior stays intact.
4. Run frontend build/lint/format/typechecks/unit/desktop-mobile suites, review screenshots and compare generated gzip sizes with the prior baseline. Record results/limits in frontend docs; no production or infrastructure work.
