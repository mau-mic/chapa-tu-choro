# Clear active migration numbering

The approved sequence is `001_baseline.sql`, `002_ingestion_leases.sql`, `003_population.sql`. Preserve SQL bytes/checksums and move superseded 002–005 scripts into `db/archive/` as historical references.

- [x] Add regression tests for legacy ledger translation, repeat execution, partial prefixes, preserved timestamps/data, checksum failures, collisions, invalid order and rollback.
- [x] Normalize only recognized old names inside the existing transaction/advisory lock, after validating the entire ledger against canonical file checksums/order.
- [x] Rename files and update the manifest, test fixtures, packaging references, operational errors and current documentation. Keep dated evidence unchanged.
- [x] Run Python/PostGIS suites, lint and affected .NET build/tests; verify ingestion artifact includes the canonical manifest/files.

No remote database access, production migrations, Git commits or cloud deployment. Integration tests use disposable local schemas; existing application ledger is not changed by this implementation task.
