# Database access implementation plan

User-approved scope: add `004_database_access.sql`, prove least-privilege runtime access, and document manual Supabase credential setup. Do not change the hosted database or store passwords.

Use two passwordless group roles (`ctc_api_reader`, `ctc_ingestion_writer`) with explicit table grants and command-specific RLS policies. Runtime login accounts inherit one group each and are provisioned separately. Keep the existing migration operator; runtime roles cannot own the schema or administer roles. Apply security only to application objects, leaving Supabase-managed schemas and PostGIS objects intact. Future tables/functions receive no automatic runtime or Data API access.

## Checks and work

- [x] Add real PostGIS tests for read-only API access, restricted ingestion, denied browser access, future-object defaults, migration lifecycle and safe existing-role handling. Run them before implementation.
- [x] Add migration 004 to the manifest without changing earlier SQL. Grant ingestion only operations used by current jobs, including concentration-series deletion and temporary staging.
- [x] Adjust population bulk loading to stage COPY before INSERT: PostgreSQL forbids COPY FROM directly into an RLS-enabled table. Prove the real importer works as the restricted writer.
- [x] Update migration lifecycle tests for a fourth migration and preserve legacy receipt normalization, rollback, concurrency and checksums.
- [x] Document portal checks, migration command with the Supabase CA, separate login creation/password prompts, connection formats and permission verification. Run affected suites and obtain a focused security review.

Validation uses a disposable PostGIS container with no network access or persistent volume, synthetic fixtures and real restricted logins. Review database-wide PUBLIC privileges separately from object grants: avoid changing managed-service database privileges as a side effect. No automatic migration-admin credential provisioning or cloud deployment.

Review fixes were reproduced before implementation: reject existing group ownership, test non-superuser provisioning, and remove population staging before returning to support nested caller transactions. Also reject backend-group membership inherited by Supabase API roles. All 125 ingestion tests passed with PostGIS in `extensions`; the earlier SQL hashes match the migration-numbering evidence. The local ingestion Docker image built successfully. Hosted advisors, authentication and migrations remain operator checks in the runbook.
