"""Real restricted logins and synthetic fixtures in disposable PostGIS schemas."""

import os
from pathlib import Path
import tempfile
import unittest
import uuid
from unittest.mock import patch

from ingestion.migrate import migrate


@unittest.skipUnless(os.getenv("CTC_TEST_DATABASE_URL"), "Requires isolated PostGIS")
class DatabaseAccessTests(unittest.TestCase):
    def setUp(self):
        import psycopg
        from psycopg import sql

        self.psycopg, self.sql = psycopg, sql
        self.uri = os.environ["CTC_TEST_DATABASE_URL"]
        self.schema = "access_test_" + uuid.uuid4().hex
        self.logins = []
        self.admin = psycopg.connect(self.uri, autocommit=True)
        self.addCleanup(self.cleanup)
        self.admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(self.schema)))
        # Reproduce Supabase defaults, including global and per-schema exposure.
        for role in ("anon", "authenticated", "service_role"):
            if not self.admin.execute("SELECT 1 FROM pg_roles WHERE rolname=%s", (role,)).fetchone():
                self.admin.execute(sql.SQL("CREATE ROLE {} NOLOGIN {}").format(
                    sql.Identifier(role), sql.SQL("BYPASSRLS" if role == "service_role" else "NOBYPASSRLS")))
            self.admin.execute(sql.SQL("GRANT USAGE ON SCHEMA {} TO {}").format(
                sql.Identifier(self.schema), sql.Identifier(role)))
            for objects in ("TABLES", "SEQUENCES", "FUNCTIONS"):
                self.admin.execute(sql.SQL("ALTER DEFAULT PRIVILEGES GRANT ALL ON {} TO {}").format(
                    sql.SQL(objects), sql.Identifier(role)))
                self.admin.execute(sql.SQL("ALTER DEFAULT PRIVILEGES IN SCHEMA {} GRANT ALL ON {} TO {}").format(
                    sql.Identifier(self.schema), sql.SQL(objects), sql.Identifier(role)))
        migrate(self.admin, schema=self.schema)

    def cleanup(self):
        self.admin.execute(self.sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(self.sql.Identifier(self.schema)))
        for login in self.logins:
            self.admin.execute(self.sql.SQL("DROP ROLE {}").format(self.sql.Identifier(login)))
        self.admin.close()

    def connect_as(self, group):
        from psycopg.conninfo import make_conninfo

        login = "access_login_" + uuid.uuid4().hex
        password = uuid.uuid4().hex
        self.admin.execute(self.sql.SQL("CREATE ROLE {} LOGIN INHERIT PASSWORD {}").format(
            self.sql.Identifier(login), self.sql.Literal(password)))
        self.logins.append(login)
        self.admin.execute(self.sql.SQL("GRANT {} TO {}").format(
            self.sql.Identifier(group), self.sql.Identifier(login)))
        db = self.psycopg.connect(make_conninfo(self.uri, user=login, password=password,
            options=f"-c search_path={self.schema},public,extensions"))
        self.addCleanup(db.close)
        return db

    def assert_denied(self, db, statement):
        with self.assertRaises(self.psycopg.errors.InsufficientPrivilege), db.transaction():
            db.execute(statement)

    def test_all_application_tables_and_migration_ledger_use_rls(self):
        tables = self.admin.execute("SELECT relname,relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=%s AND c.relkind='r'", (self.schema,)).fetchall()
        self.assertGreaterEqual(len(tables), 15)
        self.assertEqual([], [name for name, enabled in tables if not enabled])

    def test_api_reads_real_rows_but_cannot_write_or_read_operations(self):
        self.admin.execute("INSERT INTO monthly_reports VALUES(2026,1,'150101','TEST','TEST','TEST','TEST',8)")
        self.admin.execute("INSERT INTO population_releases(sha256,source_url) VALUES(%s,'https://example.test/population')", ("a" * 64,))
        with self.connect_as("ctc_api_reader") as db:
            self.assertEqual(8, db.execute("SELECT reports FROM monthly_reports").fetchone()[0])
            self.assertEqual("a" * 64, db.execute("SELECT sha256 FROM population_releases").fetchone()[0])
            # Every API dependency is queryable, including server-only spatial groups.
            for table in ("import_runs", "district_boundaries", "department_boundaries",
                          "concentration_imports", "concentration_series", "concentration_areas",
                          "concentration_cells", "concentration_locations", "population_observations"):
                db.execute(self.sql.SQL("SELECT count(*) FROM {}").format(self.sql.Identifier(table)))
            for statement in ("UPDATE monthly_reports SET reports=99", "DELETE FROM monthly_reports",
                              "INSERT INTO monthly_reports VALUES(2026,2,'150101','T','T','T','T',1)",
                              "TRUNCATE monthly_reports", "CREATE TABLE forbidden(id int)",
                              "ALTER TABLE monthly_reports ADD COLUMN forbidden int",
                              "SELECT * FROM ingestion_sources", "SELECT * FROM ingestion_runs",
                              "SELECT * FROM ingestion_run_sources", "SELECT * FROM schema_migrations",
                              "SELECT nextval('import_runs_id_seq')"):
                with self.subTest(statement=statement):
                    self.assert_denied(db, statement)

    def test_statistics_etl_and_tracking_work_under_writer(self):
        from ingestion.etl import EtlSettings, run_etl
        from ingestion.tests.test_etl import fixture_fetch

        with self.connect_as("ctc_ingestion_writer") as db, tempfile.TemporaryDirectory() as temp:
            from psycopg.conninfo import make_conninfo
            parameters = db.info.get_parameters()
            parameters["password"] = db.info.password
            connection_string = make_conninfo(**parameters)
            def connect():
                return self.psycopg.connect(connection_string, prepare_threshold=None)
            with patch("ingestion.download_official.fetch", fixture_fetch), \
                 patch("ingestion.etl.connect", connect), patch("ingestion.tracking._connect", connect):
                first = run_etl(EtlSettings(Path(temp)))
                second = run_etl(EtlSettings(Path(temp)))
            self.assertEqual("succeeded", first["status"])
            self.assertEqual("skipped", second["load"]["statistics"]["status"])
            self.assertEqual(7, db.execute("SELECT sum(reports) FROM monthly_reports").fetchone()[0])
            self.assertEqual(2, db.execute("SELECT count(*) FROM ingestion_runs WHERE status IN ('succeeded','unchanged')").fetchone()[0])
            for statement in ("DELETE FROM monthly_reports", "UPDATE import_runs SET source_name='changed'",
                              "UPDATE ingestion_sources SET enabled=false", "SELECT * FROM schema_migrations",
                              "CREATE TABLE forbidden(id int)", "TRUNCATE monthly_reports"):
                with self.subTest(statement=statement):
                    self.assert_denied(db, statement)

    def test_population_copy_import_and_revision_work_under_writer(self):
        from ingestion.population import import_population
        from ingestion.tests.test_population import PopulationWorkbookTests

        fixture = PopulationWorkbookTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        fixture.write(fixture.fixture())
        original = fixture.path.read_bytes()
        with self.connect_as("ctc_ingestion_writer") as db:
            first = import_population(fixture.path, connection=db)
            self.assertEqual("imported", first["status"])
            self.assertEqual("skipped", import_population(fixture.path, connection=db)["status"])
            rows = fixture.fixture()
            for row in rows:
                row[2][0] = 101
            fixture.write(rows)
            second = import_population(fixture.path, connection=db)
            self.assertEqual("imported", second["status"])
            fixture.path.write_bytes(original)
            self.assertEqual("skipped", import_population(fixture.path, connection=db)["status"])
            self.assertEqual(second["sha256"], db.execute("SELECT sha256 FROM population_releases WHERE active").fetchone()[0])
            self.assertEqual(72, db.execute("SELECT count(*) FROM population_observations").fetchone()[0])
            self.assert_denied(db, "UPDATE population_observations SET people=1")
            self.assert_denied(db, "DELETE FROM population_releases")

    def test_population_releases_share_outer_transaction_and_roll_back_together(self):
        from ingestion.population import import_population
        from ingestion.tests.test_population import PopulationWorkbookTests

        fixture = PopulationWorkbookTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        fixture.write(fixture.fixture())
        with self.connect_as("ctc_ingestion_writer") as db:
            with self.assertRaisesRegex(RuntimeError, "rollback both releases"), db.transaction():
                self.assertEqual("imported", import_population(fixture.path, connection=db)["status"])
                rows = fixture.fixture()
                for row in rows:
                    row[2][0] = 101
                fixture.write(rows)
                self.assertEqual("imported", import_population(fixture.path, connection=db)["status"])
                self.assertEqual(72, db.execute("SELECT count(*) FROM population_observations").fetchone()[0])
                raise RuntimeError("rollback both releases")
            self.assertEqual(0, db.execute("SELECT count(*) FROM population_releases").fetchone()[0])
            self.assertEqual(0, db.execute("SELECT count(*) FROM population_observations").fetchone()[0])

    def test_concentration_replacement_uses_only_scoped_series_delete(self):
        with self.connect_as("ctc_ingestion_writer") as db:
            import_id = db.execute("INSERT INTO concentration_imports(source_key,year,month,source_url,sha256,source_rows,quality) VALUES('synthetic',2026,1,'https://example.test',%s,5,'{}') RETURNING id", ("b" * 64,)).fetchone()[0]
            db.execute("INSERT INTO concentration_series VALUES(%s,'all')", (import_id,))
            db.execute("INSERT INTO concentration_areas VALUES(%s,'all','150101',5,5)", (import_id,))
            db.execute("INSERT INTO concentration_cells VALUES(%s,'all','150101',1,1,5)", (import_id,))
            db.execute("INSERT INTO concentration_locations(import_id,category,ubigeo,longitude,latitude,records) VALUES(%s,'all','150101',-77,-12,5)", (import_id,))
            self.assertEqual(5, db.execute("SELECT records FROM concentration_locations").fetchone()[0])
            db.execute("DELETE FROM concentration_series WHERE import_id=%s", (import_id,))
            for table in ("concentration_areas", "concentration_cells", "concentration_locations"):
                self.assertEqual(0, db.execute(self.sql.SQL("SELECT count(*) FROM {}").format(self.sql.Identifier(table))).fetchone()[0])
            self.assert_denied(db, "DELETE FROM concentration_imports")
            self.assert_denied(db, "DELETE FROM concentration_locations")
            db.execute("INSERT INTO concentration_series VALUES(%s,'all')", (import_id,))

    def test_permission_groups_cannot_login_bypass_rls_or_administer(self):
        rows = self.admin.execute("SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname IN ('ctc_api_reader','ctc_ingestion_writer') ORDER BY rolname").fetchall()
        self.assertEqual([("ctc_api_reader", False, False, False, False, False, False),
                          ("ctc_ingestion_writer", False, False, False, False, False, False)], rows)
        with self.connect_as("ctc_api_reader") as db:
            self.assert_denied(db, "SET ROLE ctc_ingestion_writer")
            self.assert_denied(db, "CREATE ROLE forbidden_role")

    def test_future_objects_get_no_automatic_runtime_or_data_api_privileges(self):
        self.admin.execute("CREATE TABLE future_table(id int)")
        self.admin.execute("CREATE SEQUENCE future_sequence")
        self.admin.execute("CREATE FUNCTION future_function() RETURNS int LANGUAGE sql AS 'SELECT 1'")
        for group in ("ctc_api_reader", "ctc_ingestion_writer", "anon", "authenticated", "service_role"):
            with self.connect_as(group) as db:
                for statement in ("SELECT * FROM future_table", "SELECT nextval('future_sequence')", "SELECT future_function()"):
                    self.assert_denied(db, statement)

    def test_browser_and_service_roles_have_no_application_access(self):
        for role in ("anon", "authenticated", "service_role"):
            with self.connect_as(role) as db:
                db.execute(self.sql.SQL("SET ROLE {}").format(self.sql.Identifier(role)))
                for table, in self.admin.execute("SELECT tablename FROM pg_tables WHERE schemaname=%s", (self.schema,)):
                    with self.subTest(role=role, table=table):
                        self.assert_denied(db, self.sql.SQL("SELECT * FROM {}").format(self.sql.Identifier(table)))
                self.assert_denied(db, "SELECT nextval('import_runs_id_seq')")

    def test_security_upgrade_revokes_existing_column_level_access(self):
        import json
        from ingestion.migrate import DB_DIR, migration_files

        schema = "column_test_" + uuid.uuid4().hex
        self.admin.execute(self.sql.SQL("CREATE SCHEMA {}").format(self.sql.Identifier(schema)))
        self.addCleanup(lambda: self.admin.execute(self.sql.SQL("DROP SCHEMA {} CASCADE").format(self.sql.Identifier(schema))))
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            names = [name for name, _ in migration_files()][:3]
            for name in names:
                (directory / name).write_bytes((DB_DIR / name).read_bytes())
            (directory / "migrations.json").write_text(json.dumps(names))
            migrate(self.admin, directory, schema=schema)
        self.admin.execute(self.sql.SQL("GRANT USAGE ON SCHEMA {} TO service_role").format(self.sql.Identifier(schema)))
        self.admin.execute("GRANT SELECT(longitude) ON concentration_locations TO service_role")
        self.assertTrue(self.admin.execute("SELECT has_column_privilege('service_role',%s,'longitude','SELECT')", (schema + ".concentration_locations",)).fetchone()[0])
        migrate(self.admin, schema=schema)
        self.assertFalse(self.admin.execute("SELECT has_column_privilege('service_role',%s,'longitude','SELECT')", (schema + ".concentration_locations",)).fetchone()[0])
        with self.connect_as("service_role") as db:
            db.execute("SET ROLE service_role")
            self.assert_denied(db, self.sql.SQL("SELECT longitude FROM {}.concentration_locations").format(self.sql.Identifier(schema)))

    def test_rls_denies_rows_to_unlisted_role_even_if_table_grant_is_added(self):
        self.admin.execute("INSERT INTO monthly_reports VALUES(2026,1,'150101','TEST','TEST','TEST','TEST',8)")
        self.admin.execute("GRANT SELECT ON monthly_reports TO anon")
        with self.connect_as("anon") as db:
            self.assertEqual([], db.execute("SELECT reports FROM monthly_reports").fetchall())

    def test_unsafe_existing_group_aborts_migration_atomically(self):
        schema = "unsafe_test_" + uuid.uuid4().hex
        with self.admin.transaction():
            self.admin.execute(self.sql.SQL("CREATE SCHEMA {}").format(self.sql.Identifier(schema)))
            self.admin.execute("ALTER ROLE ctc_api_reader LOGIN")
            try:
                with self.assertRaisesRegex(self.psycopg.errors.RaiseException, "Unsafe existing permission role"):
                    migrate(self.admin, schema=schema)
                self.assertIsNone(self.admin.execute("SELECT to_regclass(%s)", (schema + ".schema_migrations",)).fetchone()[0])
            finally:
                self.admin.execute("ALTER ROLE ctc_api_reader NOLOGIN")
                self.admin.execute(self.sql.SQL("DROP SCHEMA {} CASCADE").format(self.sql.Identifier(schema)))

    def test_permission_group_with_object_ownership_is_rejected_atomically(self):
        schema = "owner_test_" + uuid.uuid4().hex
        self.admin.execute(self.sql.SQL("CREATE SCHEMA {}").format(self.sql.Identifier(schema)))
        self.admin.execute("ALTER TABLE monthly_reports OWNER TO ctc_api_reader")
        try:
            with self.assertRaisesRegex(self.psycopg.errors.RaiseException, "Unsafe existing permission role"):
                migrate(self.admin, schema=schema)
            self.assertIsNone(self.admin.execute("SELECT to_regclass(%s)", (schema + ".schema_migrations",)).fetchone()[0])
        finally:
            self.admin.execute(self.sql.SQL("ALTER TABLE {}.monthly_reports OWNER TO {}").format(
                self.sql.Identifier(self.schema), self.sql.Identifier(self.admin.info.user)))
            self.admin.execute(self.sql.SQL("DROP SCHEMA {} CASCADE").format(self.sql.Identifier(schema)))

    def test_permission_group_inherited_by_browser_is_rejected_atomically(self):
        schema = "browser_test_" + uuid.uuid4().hex
        self.admin.execute(self.sql.SQL("CREATE SCHEMA {}").format(self.sql.Identifier(schema)))
        self.admin.execute("GRANT ctc_api_reader TO anon")
        try:
            with self.assertRaisesRegex(self.psycopg.errors.RaiseException, "Unsafe existing permission role"):
                migrate(self.admin, schema=schema)
            self.assertIsNone(self.admin.execute("SELECT to_regclass(%s)", (schema + ".schema_migrations",)).fetchone()[0])
        finally:
            self.admin.execute("REVOKE ctc_api_reader FROM anon")
            self.admin.execute(self.sql.SQL("DROP SCHEMA {} CASCADE").format(self.sql.Identifier(schema)))

    def test_non_superuser_schema_owner_can_provision_access(self):
        import json
        from psycopg.conninfo import make_conninfo
        from ingestion.migrate import migration_files

        suffix = uuid.uuid4().hex
        operator, reader, writer = "operator_" + suffix, "reader_" + suffix, "writer_" + suffix
        schema = "operator_test_" + suffix
        password = uuid.uuid4().hex
        self.admin.execute(self.sql.SQL("CREATE ROLE {} LOGIN CREATEROLE PASSWORD {}").format(
            self.sql.Identifier(operator), self.sql.Literal(password)))
        self.admin.execute(self.sql.SQL("GRANT CREATE,CONNECT,TEMPORARY ON DATABASE {} TO {} WITH GRANT OPTION").format(
            self.sql.Identifier(self.admin.info.dbname), self.sql.Identifier(operator)))
        if self.admin.execute("SELECT 1 FROM pg_namespace WHERE nspname='extensions'").fetchone():
            self.admin.execute(self.sql.SQL("GRANT USAGE ON SCHEMA extensions TO {} WITH GRANT OPTION").format(
                self.sql.Identifier(operator)))
        self.admin.execute(self.sql.SQL("CREATE SCHEMA {} AUTHORIZATION {}").format(
            self.sql.Identifier(schema), self.sql.Identifier(operator)))
        try:
            with tempfile.TemporaryDirectory() as temp, self.psycopg.connect(make_conninfo(
                self.uri, user=operator, password=password)) as db:
                directory = Path(temp)
                names = []
                for name, sql in migration_files():
                    names.append(name)
                    (directory / name).write_text(sql.replace("ctc_api_reader", reader).replace("ctc_ingestion_writer", writer))
                (directory / "migrations.json").write_text(json.dumps(names))
                self.assertEqual(names, migrate(db, directory, schema=schema))
                self.assertEqual([], migrate(db, directory, schema=schema))
                self.assertFalse(db.execute("SELECT rolsuper FROM pg_roles WHERE rolname=current_user").fetchone()[0])
                self.assertTrue(db.execute("SELECT has_table_privilege(%s,%s,'SELECT')", (reader, schema + ".monthly_reports")).fetchone()[0])
        finally:
            self.admin.execute(self.sql.SQL("DROP SCHEMA {} CASCADE").format(self.sql.Identifier(schema)))
            # Revoke the operator's grant options before dropping grantee groups.
            for role in (operator, reader, writer):
                if self.admin.execute("SELECT 1 FROM pg_roles WHERE rolname=%s", (role,)).fetchone():
                    self.admin.execute(self.sql.SQL("DROP OWNED BY {} CASCADE").format(self.sql.Identifier(role)))
                    self.admin.execute(self.sql.SQL("DROP ROLE {}").format(self.sql.Identifier(role)))
