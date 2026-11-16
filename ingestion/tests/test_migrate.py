"""Schema upgrades use disposable schemas; no application data is accessed."""
import os
from pathlib import Path
import shutil
import tempfile
import unittest
import uuid

from ingestion.migrate import migrate, migration_files, canonical_ledger, MigrationError, DB_DIR


class MigrationManifestTests(unittest.TestCase):
    def test_active_manifest_is_a_clear_contiguous_sequence(self):
        self.assertEqual(
            ["001_baseline.sql", "002_ingestion_leases.sql", "003_population.sql", "004_database_access.sql"],
            [name for name, _ in migration_files()],
        )

    def test_legacy_names_translate_without_mutating_input(self):
        digests = {"001_baseline.sql": "a" * 64, "002_ingestion_leases.sql": "b" * 64}
        applied = {"001_schema.sql": "a" * 64, "006_ingestion_leases.sql": "b" * 64}
        result, renames = canonical_ledger(applied, digests)
        self.assertEqual(digests, result)
        self.assertEqual([("001_baseline.sql", "001_schema.sql"), ("002_ingestion_leases.sql", "006_ingestion_leases.sql")], renames)
        self.assertIn("001_schema.sql", applied)

    def test_legacy_checksum_collision_unknown_and_gaps_fail_closed(self):
        digests = {"001_baseline.sql": "a" * 64, "002_ingestion_leases.sql": "b" * 64, "003_population.sql": "c" * 64}
        for applied, error in [
            ({"001_schema.sql": "x" * 64}, "checksum"),
            ({"001_schema.sql": "a" * 64, "001_baseline.sql": "a" * 64}, "Ambiguous"),
            ({"002_national_geography.sql": "a" * 64}, "absent from manifest"),
            ({"001_schema.sql": "a" * 64, "007_population.sql": "c" * 64}, "prefix"),
        ]:
            with self.subTest(applied=applied), self.assertRaisesRegex(MigrationError, error):
                canonical_ledger(applied, digests)

    def test_invalid_manifest_shapes_and_unsafe_paths_are_rejected(self):
        import json
        for manifest in [None, {}, [], [1], ["001_schema.sql"], ["001_baseline.sql", "001_baseline.sql"], ["001_baseline.sql", "../outside.sql"]]:
            with self.subTest(manifest=manifest), tempfile.TemporaryDirectory() as temp:
                directory = Path(temp)
                (directory / "migrations.json").write_text(json.dumps(manifest))
                with self.assertRaises(MigrationError):
                    migration_files(directory)


@unittest.skipUnless(os.getenv("CTC_TEST_DATABASE_URL"), "Requires isolated PostGIS")
class MigrationTests(unittest.TestCase):
    def setUp(self):
        import psycopg
        self.db = psycopg.connect(os.environ['CTC_TEST_DATABASE_URL'])
        self.schema = 'migration_test_' + uuid.uuid4().hex
        self.db.execute('CREATE SCHEMA ' + self.schema)
        self.db.commit()
        self.addCleanup(self.cleanup)

    def cleanup(self):
        self.db.rollback()
        self.db.execute('DROP SCHEMA ' + self.schema + ' CASCADE')
        self.db.commit()
        self.db.close()

    def seed_legacy_ledger(self, count=3):
        import json
        canonical = [name for name, _ in migration_files()][:count]
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            for name in canonical:
                shutil.copy(DB_DIR / name, directory / name)
            (directory / "migrations.json").write_text(json.dumps(canonical))
            migrate(self.db, directory, schema=self.schema)
        for previous, name in zip(
            ["001_schema.sql", "006_ingestion_leases.sql", "007_population.sql"], canonical
        ):
            self.db.execute("UPDATE schema_migrations SET name=%s,applied_at='2026-11-10T12:00:00Z' WHERE name=%s", (previous, name))
        self.db.execute("INSERT INTO monthly_reports VALUES(2026,1,'150101','T','T','T','T',8)")
        self.db.execute("UPDATE ingestion_sources SET notes='operator review' WHERE source_key='active-2026'")
        self.db.commit()
        return self.ledger()

    def ledger(self):
        return self.db.execute("SELECT name,sha256,applied_at FROM schema_migrations ORDER BY name").fetchall()

    def test_legacy_complete_ledger_renames_and_adds_access_preserving_data_hashes_and_dates(self):
        before = self.seed_legacy_ledger()
        self.assertEqual(["004_database_access.sql"], migrate(self.db, schema=self.schema))
        after = self.ledger()
        self.assertEqual(["001_baseline.sql", "002_ingestion_leases.sql", "003_population.sql", "004_database_access.sql"], [row[0] for row in after])
        self.assertEqual([row[1:] for row in before], [row[1:] for row in after[:3]])
        self.assertEqual(8, self.db.execute("SELECT reports FROM monthly_reports").fetchone()[0])
        self.assertEqual("operator review", self.db.execute("SELECT notes FROM ingestion_sources WHERE source_key='active-2026'").fetchone()[0])
        self.db.commit()
        self.assertEqual([], migrate(self.db, schema=self.schema))
        self.assertEqual(after, self.ledger())

    def test_legacy_baseline_prefix_applies_only_new_pending_migrations(self):
        self.seed_legacy_ledger(1)
        self.assertEqual(["002_ingestion_leases.sql", "003_population.sql", "004_database_access.sql"], migrate(self.db, schema=self.schema))
        self.assertEqual(8, self.db.execute("SELECT reports FROM monthly_reports").fetchone()[0])

    def test_legacy_lease_prefix_applies_population_and_access(self):
        self.seed_legacy_ledger(2)
        self.assertEqual(["003_population.sql", "004_database_access.sql"], migrate(self.db, schema=self.schema))
        self.assertEqual(4, len(self.ledger()))

    def test_invalid_legacy_receipts_leave_names_and_data_untouched(self):
        self.seed_legacy_ledger()
        self.db.execute("UPDATE schema_migrations SET sha256=%s WHERE name='007_population.sql'", ("0" * 64,))
        self.db.commit()
        before = self.ledger()
        self.db.commit()
        with self.assertRaisesRegex(MigrationError, "checksum"):
            migrate(self.db, schema=self.schema)
        self.assertEqual(before, self.ledger())
        self.assertEqual(8, self.db.execute("SELECT reports FROM monthly_reports").fetchone()[0])

    def test_collision_between_legacy_and_current_receipts_is_rejected(self):
        self.seed_legacy_ledger()
        self.db.execute("INSERT INTO schema_migrations SELECT '001_baseline.sql',sha256,applied_at FROM schema_migrations WHERE name='001_schema.sql'")
        self.db.commit()
        before = self.ledger()
        self.db.commit()
        with self.assertRaisesRegex(MigrationError, "Ambiguous"):
            migrate(self.db, schema=self.schema)
        self.assertEqual(before, self.ledger())

    def test_failure_after_legacy_rename_rolls_back_names_and_pending_ddl(self):
        import json
        self.seed_legacy_ledger()
        before = self.ledger()
        self.db.commit()
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            names = [name for name, _ in migration_files()]
            for name in names:
                shutil.copy(DB_DIR / name, directory / name)
            names.append("005_failure.sql")
            (directory / "migrations.json").write_text(json.dumps(names))
            (directory / "005_failure.sql").write_text("CREATE TABLE pending_failure(id int); SELECT 1/0;")
            with self.assertRaises(Exception):
                migrate(self.db, directory, schema=self.schema)
        self.assertEqual(before, self.ledger())
        self.assertIsNone(self.db.execute("SELECT to_regclass(%s)", (self.schema + ".pending_failure",)).fetchone()[0])

    def test_concurrent_legacy_runners_rename_once_and_keep_receipt_dates(self):
        import psycopg
        from concurrent.futures import ThreadPoolExecutor
        before = self.seed_legacy_ledger()
        # Release the ledger SELECT before another session takes its DDL lock.
        self.db.commit()
        def apply():
            with psycopg.connect(os.environ["CTC_TEST_DATABASE_URL"]) as db:
                return migrate(db, schema=self.schema)
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda _: apply(), range(2)))
        self.assertEqual([0, 1], sorted(map(len, results)))
        self.assertIn(["004_database_access.sql"], results)
        self.assertEqual([row[1:] for row in before], [row[1:] for row in self.ledger()[:3]])

    def test_fresh_apply_repeat_and_changed_checksum_rejected(self):
        self.assertEqual(['001_baseline.sql','002_ingestion_leases.sql','003_population.sql','004_database_access.sql'], migrate(self.db,schema=self.schema))
        self.assertEqual([],migrate(self.db,schema=self.schema))
        with tempfile.TemporaryDirectory() as temp:
            directory=Path(temp)
            for name in ('001_baseline.sql','002_ingestion_leases.sql','003_population.sql','004_database_access.sql','migrations.json'):
                shutil.copy(DB_DIR/name,directory/name)
            with (directory/'001_baseline.sql').open('a') as file:
                file.write('\n-- modified\n')
            with self.assertRaisesRegex(MigrationError,'checksum'):
                migrate(self.db,directory,schema=self.schema)
        self.assertEqual(4,self.db.execute('SELECT count(*) FROM schema_migrations').fetchone()[0])

    def test_adopt_old_partial_schema_preserves_rows(self):
        baseline=(DB_DIR/'001_baseline.sql').read_text().split('-- Additive upgrade')[0]
        self.db.execute(baseline.replace('SET search_path TO public, extensions;',f'SET search_path TO {self.schema}, public, extensions;'))
        self.db.execute("INSERT INTO monthly_reports VALUES(2026,1,'150101','T','T','T','T',8)")
        self.db.commit()
        migrate(self.db,schema=self.schema)
        self.assertEqual(8,self.db.execute('SELECT reports FROM monthly_reports').fetchone()[0])
        self.assertEqual(0,self.db.execute('SELECT count(*) FROM ingestion_runs').fetchone()[0])

    def test_adopt_full_untracked_schema(self):
        self.db.execute((DB_DIR/'001_baseline.sql').read_text().replace('SET search_path TO public, extensions;',f'SET search_path TO {self.schema}, public, extensions;'))
        self.db.commit()
        self.assertEqual(4,len(migrate(self.db,schema=self.schema)))

    def test_incompatible_adoption_rolls_back_all_ddl(self):
        self.db.execute(f'CREATE TABLE {self.schema}.monthly_reports(year text)')
        self.db.commit()
        with self.assertRaisesRegex(MigrationError,'incompatible table monthly_reports'):
            migrate(self.db,schema=self.schema)
        self.db.rollback()
        self.assertIsNone(self.db.execute('SELECT to_regclass(%s)',(self.schema+'.schema_migrations',)).fetchone()[0])
        self.assertIsNone(self.db.execute('SELECT to_regclass(%s)',(self.schema+'.ingestion_runs',)).fetchone()[0])

    def test_failed_new_migration_rolls_back_baseline_and_ledger(self):
        with tempfile.TemporaryDirectory() as temp:
            directory=Path(temp)
            shutil.copy(DB_DIR/'001_baseline.sql',directory/'001_baseline.sql')
            (directory/'migrations.json').write_text('["001_baseline.sql","999_failure.sql"]')
            (directory/'999_failure.sql').write_text('CREATE TABLE should_rollback(id int); SELECT 1/0;')
            with self.assertRaises(Exception):
                migrate(self.db,directory,schema=self.schema)
        self.db.rollback()
        self.assertIsNone(self.db.execute('SELECT to_regclass(%s)',(self.schema+'.monthly_reports',)).fetchone()[0])

    def test_concurrent_runners_serialize_one_application(self):
        import psycopg
        from concurrent.futures import ThreadPoolExecutor
        def apply():
            with psycopg.connect(os.environ['CTC_TEST_DATABASE_URL']) as db:
                return migrate(db,schema=self.schema)
        with ThreadPoolExecutor(max_workers=2) as executor:
            results=list(executor.map(lambda _:apply(),range(2)))
        self.assertEqual([0,4],sorted(map(len,results)))
        self.assertEqual(4,self.db.execute('SELECT count(*) FROM '+self.schema+'.schema_migrations').fetchone()[0])

    def test_unvalidated_constraints_are_rejected_on_adoption(self):
        baseline=(DB_DIR/'001_baseline.sql').read_text().split('-- Additive upgrade')[0]
        self.db.execute(baseline.replace('SET search_path TO public, extensions;',f'SET search_path TO {self.schema}, public, extensions;'))
        self.db.execute('ALTER TABLE monthly_reports DROP CONSTRAINT monthly_reports_reports_check')
        self.db.execute('ALTER TABLE monthly_reports ADD CONSTRAINT monthly_reports_reports_check CHECK(reports>=0) NOT VALID')
        self.db.commit()
        with self.assertRaisesRegex(MigrationError,'incompatible table monthly_reports'):
            migrate(self.db,schema=self.schema)
