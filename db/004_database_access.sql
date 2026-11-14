-- Server-to-server permissions. Apply through ingestion.migrate as the schema owner.
-- Login accounts/passwords are provisioned separately; see docs/supabase-setup.md.
SET search_path TO public, extensions;

DO $$
DECLARE
    app_schema text := current_schema();
    permission_role text;
    api_role text;
    operation text;
    relation record;
    sequence_name text;
BEGIN
    FOREACH permission_role IN ARRAY ARRAY['ctc_api_reader', 'ctc_ingestion_writer'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = permission_role) THEN
            EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', permission_role);
        END IF;
        -- These reserved groups must never inherit other roles or bypass policies.
        -- Reject a conflicting existing role instead of silently changing it.
        IF EXISTS (
            SELECT 1 FROM pg_roles r WHERE r.rolname = permission_role
            AND (r.rolcanlogin OR r.rolsuper OR r.rolcreatedb OR r.rolcreaterole
                 OR r.rolreplication OR r.rolbypassrls
                 OR EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member = r.oid)
                 OR EXISTS (SELECT 1 FROM pg_shdepend d
                            WHERE d.refclassid = 'pg_authid'::regclass
                              AND d.refobjid = r.oid AND d.deptype = 'o')
                 OR EXISTS (SELECT 1 FROM pg_roles client
                            WHERE client.rolname IN ('anon','authenticated','service_role','authenticator')
                              AND pg_has_role(client.oid, r.oid, 'MEMBER')))
        ) THEN
            RAISE EXCEPTION 'Unsafe existing permission role: %', permission_role;
        END IF;
    END LOOP;

    EXECUTE format('REVOKE CREATE ON SCHEMA %I FROM PUBLIC', app_schema);
    EXECUTE format('REVOKE ALL ON SCHEMA %I FROM ctc_api_reader, ctc_ingestion_writer', app_schema);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO ctc_api_reader, ctc_ingestion_writer', app_schema);
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
        GRANT USAGE ON SCHEMA extensions TO ctc_api_reader, ctc_ingestion_writer;
    END IF;
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO ctc_api_reader, ctc_ingestion_writer', current_database());
    EXECUTE format('GRANT TEMPORARY ON DATABASE %I TO ctc_ingestion_writer', current_database());
    -- Database-wide PUBLIC CONNECT/TEMP defaults are left intact for managed services.
    -- Permissions below concern persistent application objects only.

    FOR relation IN SELECT * FROM (VALUES
        ('monthly_reports',          true,  ARRAY['SELECT','INSERT','UPDATE']),
        ('district_boundaries',      true,  ARRAY['SELECT','INSERT','UPDATE']),
        ('department_boundaries',    true,  ARRAY['SELECT','INSERT','UPDATE']),
        ('import_runs',              true,  ARRAY['SELECT','INSERT']),
        ('concentration_imports',    true,  ARRAY['SELECT','INSERT','UPDATE']),
        -- Replacing a snapshot deletes its series; FKs cascade to derived groups.
        ('concentration_series',     true,  ARRAY['SELECT','INSERT','DELETE']),
        ('concentration_areas',      true,  ARRAY['SELECT','INSERT']),
        ('concentration_cells',      true,  ARRAY['SELECT','INSERT']),
        ('concentration_locations',  true,  ARRAY['SELECT','INSERT']),
        ('population_releases',      true,  ARRAY['SELECT','INSERT','UPDATE']),
        ('population_observations',  true,  ARRAY['SELECT','INSERT']),
        ('ingestion_sources',        false, ARRAY['SELECT']),
        ('ingestion_runs',           false, ARRAY['SELECT','INSERT','UPDATE']),
        ('ingestion_run_sources',    false, ARRAY['SELECT','INSERT','UPDATE']),
        ('schema_migrations',        false, ARRAY[]::text[])
    ) AS permissions(table_name, api_reads, writer_operations) LOOP
        -- schema_sql() bootstraps isolated fixtures without a migration ledger.
        IF relation.table_name = 'schema_migrations'
           AND to_regclass(format('%I.%I', app_schema, relation.table_name)) IS NULL THEN
            CONTINUE;
        END IF;
        EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', app_schema, relation.table_name);
        EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM PUBLIC, ctc_api_reader, ctc_ingestion_writer', app_schema, relation.table_name);
        FOREACH api_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
                EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM %I', app_schema, relation.table_name, api_role);
            END IF;
        END LOOP;

        -- These are trusted backend service principals, not user/tenant identities.
        -- They intentionally see all rows in the explicitly granted tables.
        IF relation.api_reads THEN
            EXECUTE format('GRANT SELECT ON TABLE %I.%I TO ctc_api_reader', app_schema, relation.table_name);
            EXECUTE format('CREATE POLICY ctc_api_select ON %I.%I FOR SELECT TO ctc_api_reader USING (true)', app_schema, relation.table_name);
        END IF;
        FOREACH operation IN ARRAY relation.writer_operations LOOP
            EXECUTE format('GRANT %s ON TABLE %I.%I TO ctc_ingestion_writer', operation, app_schema, relation.table_name);
            EXECUTE format('CREATE POLICY %I ON %I.%I FOR %s TO ctc_ingestion_writer %s',
                'ctc_ingestion_' || lower(operation), app_schema, relation.table_name, operation,
                CASE operation
                    WHEN 'INSERT' THEN 'WITH CHECK (true)'
                    WHEN 'UPDATE' THEN 'USING (true) WITH CHECK (true)'
                    ELSE 'USING (true)'
                END);
        END LOOP;
    END LOOP;

    -- Identity generation only; API cannot advance sequences and writer cannot reset them.
    FOREACH sequence_name IN ARRAY ARRAY[
        pg_get_serial_sequence(format('%I.import_runs', app_schema), 'id'),
        pg_get_serial_sequence(format('%I.concentration_imports', app_schema), 'id')
    ] LOOP
        EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, ctc_api_reader, ctc_ingestion_writer', sequence_name);
        EXECUTE format('GRANT USAGE ON SEQUENCE %s TO ctc_ingestion_writer', sequence_name);
        FOREACH api_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
                EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM %I', sequence_name, api_role);
            END IF;
        END LOOP;
    END LOOP;

    -- Default ACLs apply to this migration owner only. Per-schema revokes cannot
    -- cancel global defaults, so remove both. Existing managed objects are untouched.
    FOREACH api_role IN ARRAY ARRAY['PUBLIC','ctc_api_reader','ctc_ingestion_writer','anon','authenticated','service_role'] LOOP
        IF api_role = 'PUBLIC' OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
            FOREACH operation IN ARRAY ARRAY['TABLES','SEQUENCES','FUNCTIONS'] LOOP
                EXECUTE format('ALTER DEFAULT PRIVILEGES REVOKE ALL ON %s FROM %s', operation,
                    CASE WHEN api_role = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(api_role) END);
                EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON %s FROM %s', app_schema, operation,
                    CASE WHEN api_role = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(api_role) END);
            END LOOP;
        END IF;
    END LOOP;
END $$;
