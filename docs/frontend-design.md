# Frontend visual direction

This adaptation keeps React, shadcn/Base UI, MapLibre and the existing charts. It does not adopt Carbon, Datawrapper or ONS, and does not introduce a new design-system dependency.

The direction is a fluid, contemporary public-facing interface: neutral surfaces, ink typography, one restrained action color, comfortable spacing and moderate rounding. Statistical and category colors retain their existing meanings.

- Navigation: lightweight header, explicit current view, visible keyboard focus and a skip link.
- Map: the main visual surface; compact geographic filters, active-selection summary and reset. Mobile filters use a dismissible, keyboard-accessible bottom sheet with a results action.
- Trends: a clear header and source selector, an unboxed metric strip, larger chart space, readable legends and preserved data tables/tooltips. Source units, incomplete observations and provenance remain explicit.
- Denunciar: immediate police assistance first, situation-based guidance, then channels grouped by purpose. Telephone/web actions precede detailed verification notes; existing official links, limits and review dates remain unchanged.

Desktop and mobile browser checks cover navigation, map retention, modal focus/escape, resets, source isolation and reporting actions. External providers use deterministic test fixtures; screenshots from these tests are not official statistical evidence.

Future visual references can refine this direction without replacing the application libraries. This is a UX/UI adaptation, not a statistical model or backend change.

## Where to maintain it

`frontend/src/styles/interface.css` owns the public shell, navigation, filter controls, chart layouts and reporting directory. `styles.css` retains MapLibre-specific overlays and chart internals; changing interface tokens must not change the meaning of the statistical palettes. Static methodology/statistics pages use the same interface styles and theme color without requiring React.

`features/explorer/FilterSummary.tsx` removes individual territorial/category selections and resets filters while retaining period/source. `ExplorerSidebar.tsx` composes the same contents into the desktop aside or mobile modal sheet. The sheet closes with Escape, the close button or “Ver resultados”; it restores focus and closes when switching to desktop layout. MapLibre remains mounted when switching views.

The [local validation evidence](evidence/fluid-interface-validation-2026-11-13.json) records the tested behavior and verification limits.

## Lightweight controls

Named Lucide imports provide navigation, filter and contact-action icons; no full icon catalogue or animation runtime is loaded. Interface controls reuse the existing semantic tokens, Base UI primitives and CSS transitions rather than installing a second UI kit.

Province/district fields retain a complete native select. With 30 or more options, “Buscar” explicitly activates an on-demand Base UI combobox. Its module is not requested on page load, on opening filters, or for short lists. Search matches names without accent sensitivity and UBIGEO codes locally; typing never applies a geographic filter or calls the API. Only choosing an item applies its stable code. At most 40 matching options are rendered; the user can refine the query or return to the complete native list. Period/year controls remain native.

The native fallback works while the optional module loads and if its download fails. Escape first closes the nested results popup, preserving the mobile sheet. “Lista” restores the native select and focus; changing the parent geography resets the dependent field. Input text is 16px to avoid text-field zoom on iOS; the new search action has a 44px target on coarse-pointer devices. Physical soft-keyboard behavior still needs device testing.

The [lightweight-controls validation](evidence/lightweight-controls-validation-2026-11-13.json) records 122 unit and 32 desktop/mobile browser tests, bundle comparisons and a small emulated-touch timing sample. Shared initial JavaScript grew from about 139.5 to 145.8 kB gzip; the optional search module is about 28.3 kB gzip and loads only on intent. CSS is about 10.4 kB gzip. MapLibre remains separate; no Motion runtime or additional UI kit was installed. These sizes do not establish physical-device performance or deployment compression settings.

## Shared Trends period

Denuncias groups its year slider and final month in the sidebar (the same filter sheet on mobile). The history query ends at that month; population comparison consumes the same period without owning another date state. Its monthly table covers all selected years through the shared cutoff, inside a bounded scroll area. Explicitly selected months are never replaced by imported ones; absent values show “No hay datos disponibles”. Source-switch labels omit technical CSV/publication suffixes while attribution stays visible. Territory/modality filters remain shared; sorting stays local to the ranking. Missing months and unavailable denominator years remain explicit.

The Trends scroll container is positioned relative so absolutely positioned screen-reader captions stay inside it. This prevents clipped captions from expanding the desktop document into a blank scrolling tail; captions remain accessible. Desktop uses the panel scroller, while compact layouts retain ordinary page scrolling. Browser regressions cover both layouts and scrolling down/up.

View-transition audit: this change shares persistent controls and revalidates existing charts; it does not add a navigation, shared-element morph or reordered animated list. These data refreshes remain silent, as recommended for background revalidation, without adding animation dependencies or upgrading React.

Phase 4 adds a coordinated initial skeleton over the workspace until essential data and lazy map/chart modules settle. The underlying layout stays mounted with stable dimensions and is inert/hidden from assistive technology until revealed. Optional external overlays remain independent. Errors and empty datasets release the loader and expose existing recovery controls; reduced-motion preferences disable skeleton animation. Historical count/rate switching and up to four territorial peers reuse the existing SVG renderer, with no new visualization dependency.

Advanced statistics reuse the existing SVG renderer and themed tooltip. Moving-average/reference selectors are local native controls with labels and keyboard support; they do not add date state or issue another request. Solid/dashed series, text legends, observation counts and accessible monthly tables distinguish observations from derived references. National comparison stays in rate units while local history can display counts. History and insights load in parallel and must agree on the source release and observations before combined analytics are shown. Failures preserve the original series and offer explicit retry. No visualization library or service was added.
