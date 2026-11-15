# Chapa Tu Choro

Explore Peru's registered police reports on a map, compare historical trends and find official reporting channels. The application uses React/TypeScript, MapLibre, ASP.NET Core 10, PostgreSQL/PostGIS and Python ingestion.

**Current scope:** the Phase 1–4 MVP is implemented and tested locally. AWS deployment is prepared in Terraform, but the [prelaunch review](docs/aws-review.md) identifies work required before publication. News ingestion is not implemented.

## Run locally

Install Docker with Compose, then run from the repository root:

```bash
docker compose --profile app up --build -d
```

Open [the application](http://localhost:5173) and [database readiness](http://localhost:5173/api/ready). Compose applies [versioned migrations](db/README.md) before starting the API. Existing database volumes keep their imported data; a new database starts empty.

To acquire and import the official statistical CSV and INEI boundaries:

```bash
docker compose --profile etl run --build --rm etl
```

To import the supplied INEI population workbook, place it at `data/population.xlsx` and run:

```bash
docker compose --profile etl run --build --rm population /input/population.xlsx
```

Government services may be unavailable or change format; failed imports are reported rather than replaced with sample data. [Import procedures](docs/data-ingestion.md) cover validation, recovery and the separate geographic-concentration pipeline.

## Understand the project

Start with [the engineer's guide](docs/getting-started.md), then [architecture](docs/architecture.md), [operations](docs/operations.md) and [testing](docs/testing.md). The [documentation index](docs/README.md) links to detailed contracts and source investigations.

Counts, population-adjusted rates and geographic classification rows are different measures. Missing data is not zero, and a higher count or rate does not establish higher individual risk. Read [methodology](docs/methodology.md) before interpreting results.

Database credentials stay server-side. The checked-in Compose password is a disposable local placeholder, not a production credential. The application does not receive complaints, collect case details or authenticate users.
