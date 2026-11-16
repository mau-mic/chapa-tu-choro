# ADR 0002 — Continue the MVP while source-specific authorization is unresolved

- Status: accepted for bounded MVP development and validation; public-release clearance remains unresolved
- Date: 2026-11-12 (America/Lima)
- Decision owner: project maintainer, requested explicitly in the development conversation
- Scope: existing official-data integrations; no new extraction, deployment or production-data change is authorized by this ADR

## Context

Chapa Tu Choro uses publicly reachable government datasets and geographic services to build a working MVP. We have downloaded official statistical/geographic files, queried public ArcGIS/OGC endpoints and inspected public viewer configuration. These acquisition methods differ from unrestricted website scraping; this decision is limited to the documented sources and methods actually used.

The repository contains source URLs, retrieval/import timestamps, validation findings and provenance records. However, formal, source-specific written authorization has not been obtained for every integration. In particular, the reviewed MININTER station and geographic-record services did not establish a dataset-specific redistribution license or sufficient definitions for accuracy and case identity. Public technical access, an official publisher, successful downloads and attribution do not by themselves establish permission for every intended use.

The [CSV counting-unit audit](../data-counting-units.md) records an explicit licence in the statistical catalogue/metadata. That is a different evidence state from an undeclared licence, and must not be transferred to another service, archive or derived product by assumption. Lack of a separate authorization letter is also different from lack of any published usage terms.

Waiting for bespoke written authorization for every source would delay development and validation of source adapters, maps and analytics. The maintainer chooses to continue the MVP work while retaining these uncertainties as explicit project risks, rather than presenting them as resolved.

## Decision

**Continue implementing and validating the MVP using the already investigated, publicly reachable official sources without making separate written authorization a prerequisite for that development work.**

This is an acceptance of an unresolved dependency and project risk. It is not evidence that permission has been granted, a legal determination that all acquisition/reuse is permitted, or a waiver of provider conditions. Calling a product an MVP does not resolve source-use restrictions.

The accepted scope is the current local/development proof of concept and its controlled validation. The decision does not authorize a public deployment, broad redistribution, raw-record export, commercial use or collection from additional websites. Those uses require their own source-by-source assessment. A public MVP must be assessed as public availability; the MVP label is not an exemption.

Sources with explicit applicable terms should be assessed against those terms; a blanket requirement for a separate permission letter must not replace that assessment. A source with missing terms remains **unresolved**, rather than being labelled open, licensed, approved or public domain.

## Boundaries and safeguards

1. **Keep acquisition bounded.** Use the documented downloads and allowlisted public service endpoints already investigated. Do not bypass authentication, access denials, paywalls or other controls. Do not rotate identities, evade limits or reverse-engineer protected internal APIs under this decision. A new source or acquisition method requires review.
2. **Preserve source-specific evidence.** Retain original references, acquisition method, published terms/license evidence or its absence, source period, import time, checksum where available and known quality limitations. Distinguish an observation about a source from a guarantee by its provider.
3. **Keep statistical units separate.** CSV complaint quantities and geographic classification rows remain separate. Do not invent distinct crimes, combine overlapping releases, infer unreported crime from differences or claim certified street accuracy.
4. **Minimize retained and displayed data.** Keep case identifiers, addresses, victim details and raw incident text out of public payloads and committed artifacts. Current geographic location/count groups remain server-only; map output is generalized and sparse groups are suppressed. Statistical source-file archival and private geographic storage are different operations and need source-specific treatment. These measures reduce exposure; they do not establish permission or guarantee anonymity.
5. **Retain attribution and uncertainty.** Show original sources, reporting/import periods and undeclared provider dates/accuracy where relevant. Do not describe the application as an official MININTER service, a source-endorsed product or an inventory of all actual crime.
6. **Respect provider limits and failures.** Preserve existing pagination, caching, scoped imports, cancellation and timeouts. Unavailable or incompatible sources fail visibly; no replacement coordinates or statistics are fabricated.
7. **Treat objections or incompatible terms as review triggers.** If a provider requests suspension, access restrictions change, or terms conflict with the use, suspend the affected acquisition/use pending review. Decide separately how retained data and derivatives must be handled. Do not silently continue, evade restrictions or automatically delete production data under this ADR.

These are decision constraints. Some are already implemented; this document does not claim a consolidated source-rights registry, automated takedown workflow or compliance enforcement system exists.

## Evidence states to retain in Phase 3

The source catalogue should keep these dimensions separate:

| Dimension | Example states |
| --- | --- |
| Technical access | Verified public access at a recorded time; unavailable; restricted; unverified |
| Usage basis | Published terms/license recorded; express authorization recorded; missing/unclear |
| Intended use assessment | Development validation assessed; public derived display assessed; redistribution assessed; unresolved |
| Data quality | Documented definition/coverage; known limitations; provider definition pending |

A successful fetch or ingest must not automatically change the usage-basis or intended-use-assessment state to approved. At ADR acceptance these were Phase 3 design inputs. The [first catalogue increment](../sources/catalog.md) now stores usage evidence, scope/limitations and separate technical attempt receipts. A structured per-intended-use review workflow and automated source health monitoring remain deferred; no permission state is inferred from import success.

## Consequences and accepted risks

- Development can continue and the MVP remains reviewable without asserting that all source-use questions have been answered.
- Provider access, terms, availability and quality remain external dependencies. We may need to disable a layer, change a source, remove an unsupported claim or rework retained/derived data after review.
- Public exposure can introduce privacy, redistribution, reputational and operational concerns that local technical tests cannot settle. Aggregation, attribution, browser CORS and API rate limiting do not resolve those concerns or grant data-use rights.
- Formal authorization and dataset-specific terms remain unresolved where the source audit says so. This ADR records that choice; it does not mark those Phase 2 production limitations complete.
- Source-management work must make those distinctions visible rather than treating ingestion success as approval.

## Alternatives considered

- **Pause all work until every provider supplies a written authorization:** not selected for local MVP development because adapters and data-quality behavior can be validated while questions remain recorded.
- **Use only sources with a verified usage basis for the intended use:** remains the preferred fallback for any source that cannot be resolved; it may reduce geographic coverage and features.
- **Treat every publicly accessible endpoint as unrestricted:** rejected; technical access and intended-use permission are separate evidence.
- **Replace missing data with invented events or coordinates:** rejected; it would undermine the application's purpose and data integrity.

## Review and exit conditions

Revisit this ADR **before enabling public access, adding a source or extraction method, redistributing data, introducing commercial use, or materially changing the precision/sensitivity of the output**. Also review it on provider objection, changed terms/access controls, an incident involving data exposure, or authoritative clarification of identity/accuracy.

For each proposed externally available source, record the intended use, the supporting terms/authorization or unresolved questions, the output/retention scope, attribution and the maintainer's resulting decision. An unresolved source may need to remain disabled while the rest of the MVP proceeds. There is no automatic expiry-to-approval or time-based assumption of consent.

## Related records

- [ADR 0001 — MVP architecture](0001-mvp-architecture.md)
- [Phase 2 traceability and unresolved source requirements](../phase-2-traceability.md)
- [Official geographic source inventory and conditions](../official-geographic-layers.md)
- [Concentration authority, storage and privacy rules](../concentration.md)
- [Validated counting units and crossing limitations](../data-counting-units.md)
- [Ingestion operation and provenance](../data-ingestion.md)
