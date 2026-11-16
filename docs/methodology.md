# Methodology and interpretation

The application presents two independent official data families. **Statistical CSV counts** are registered police-report aggregates by period, territory and modality. **Geographic classification rows** are records from a specific MININTER source/year/category publication, including repeated business identifiers. Neither family measures personal risk, victim counts or unique crimes. Do not add their totals together. See the [counting-unit contract](data-counting-units.md).

The map offers absolute counts or monthly rates, while the original trend charts retain counts. A separate [population comparison](ingestion/population.md) in CSV Trends divides monthly registered reports by same-year INEI June 30 population projections and multiplies by 100,000. The historical series uses each year’s own denominator and supports up to four peer territories. Visible quality indicators describe observations and missing population/geometries without certifying reporting completeness. Rates are not annualized and are suppressed when compatible denominators are missing. These preliminary 2018–2026 projections do not incorporate definitive Census 2025 results. High counts or rates can reflect recording practices, availability, commuting or reporting behavior; they do not establish higher individual crime risk.

## Geography and missing observations

Official INEI boundaries define statistical territories. Missing aggregates are unavailable, distinct from explicit imported zeroes. Districts without geometry remain in totals/rankings with a warning. Incomplete georeferencing and source precision limits prevent interpreting a heatmap as verified incident addresses.

Concentration displays coarse, thresholded aggregates. Bins below five classification rows are suppressed; radius queries suppress positive counts below five while preserving explicit zero. Suppression is not an anonymity or positional-accuracy guarantee. Separate 2025 archives cannot form an archive-wide total because overlaps cannot be reconciled reliably. See [concentration semantics](concentration.md).

## Provenance, dates and authorization

Source references, checksums, import times and available periods accompany imports. Reporting/occurrence periods differ from publication dates and import times. [Freshness](ingestion/freshness.md) uses imported observation periods and preserves unknown dates.

Public technical access does not establish permission to redistribute. The [source catalogue](sources/catalog.md) tracks usage evidence separately from access or import success. [ADR 0002](adrs/0002-mvp-data-use-with-unresolved-authorization.md) records bounded development while source-specific authorization remains unresolved. Source investigations preserve [technical and identity uncertainties](mininter-denuncias-validation.md).

No invented incidents, sample crime statistics, victim details or unverified accusations belong in public data. Synthetic test fixtures are restricted to isolated tests. Denunciar links to official resources; the application does not receive complaints or case details.

## Smoothing, prior references and national comparisons

Moving averages use 3 or 12 consecutive months including the observed month. Historical references use only the preceding 36 months; seasonal references use the same month in the preceding three years. Complete windows are required separately for count and rate means. Missing observations are not zero or interpolated. These are descriptive references, not forecasts or evidence of causes.

Peru's monthly rate divides national reports by national projected population for the same year and category, including the selected territory. It is not the unweighted average of district rates. Percent differences against a missing or zero reference are unavailable. Local/national rates can be unavailable independently when their reporting districts lack compatible population. [Exact definitions](ingestion/population.md#moving-averages-historical-references-and-national-comparison).
