"""Transactional, serialized schema upgrades. DATABASE_URL must target the intended DB.

001 is the immutable baseline, including the scripts retained in db/archive. Adoption verifies
existing baseline relations before filling missing tables; it never changes data.
"""
import argparse
import hashlib
import json
from pathlib import Path
import uuid

from .common import connect

DB_DIR = Path(__file__).resolve().parent.parent / "db"
SEARCH_PATH = "SET search_path TO public, extensions;"
LEGACY_NAMES = {
    "001_schema.sql": "001_baseline.sql",
    "006_ingestion_leases.sql": "002_ingestion_leases.sql",
    "007_population.sql": "003_population.sql",
}


class MigrationError(RuntimeError):
    pass


def migration_files(directory=DB_DIR):
    names = json.loads((directory / "migrations.json").read_text())
    if not isinstance(names, list) or not names or any(not isinstance(name, str) for name in names):
        raise MigrationError("Invalid migration manifest")
    if names[0] != "001_baseline.sql" or len(set(names)) != len(names):
        raise MigrationError("Invalid migration manifest")
    if any(Path(name).name != name or not name.endswith(".sql") for name in names):
        raise MigrationError("Unsafe migration path")
    return [(name, (directory / name).read_text()) for name in names]


def canonical_ledger(applied, digests):
    """Validate every receipt before allowing any legacy filename updates."""
    canonical = {}
    renames = []
    for name, digest in applied.items():
        target = LEGACY_NAMES.get(name, name)
        if target not in digests:
            raise MigrationError("Database contains migrations absent from manifest: " + name)
        if target in canonical:
            raise MigrationError("Ambiguous migration ledger: duplicate receipt for " + target)
        if digest != digests[target]:
            raise MigrationError("Applied migration checksum changed: " + name)
        canonical[target] = digest
        if target != name:
            renames.append((target, name))
    if set(canonical) != set(list(digests)[:len(canonical)]):
        raise MigrationError("Migration ledger is not a manifest prefix")
    return canonical, renames


def schema_sql(schema="public", directory=DB_DIR):
    """Test bootstrap only; production upgrades must use migrate()."""
    if not schema.replace("_", "").isalnum():
        raise MigrationError("Invalid schema")
    return "\n".join(sql.replace(SEARCH_PATH, SEARCH_PATH if schema == "public" else f'SET search_path TO "{schema}", public, extensions;')
                     for _, sql in migration_files(directory))


def structure(db, schema):
    # Use catalog definitions rather than checking only table names/counts. The
    # comparison includes typmods (PostGIS subtype/SRID), defaults, FK/checks,
    # generated columns, identities, indexes, and server-only RLS flags.
    result = {}
    tables = db.execute("SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=%s AND c.relkind='r'", (schema,)).fetchall()
    for table, rls in tables:
        def normalize(value):
            return str(value).replace('"' + schema + '".', '').replace(schema + '.', '')
        oid = db.execute("SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=%s AND c.relname=%s", (schema,table)).fetchone()[0]
        columns = db.execute("SELECT a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=%s AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum", (oid,)).fetchall()
        constraints = db.execute("SELECT conname,convalidated,pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid=%s ORDER BY conname", (oid,)).fetchall()
        indexes = db.execute("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname=%s AND tablename=%s ORDER BY indexname", (schema,table)).fetchall()
        result[table] = (rls, normalize(columns), normalize(constraints), normalize(indexes))
    return result


def adopt_baseline(db, sql, schema):
    from psycopg import sql as pgsql
    scratch = "migration_verify_" + uuid.uuid4().hex
    db.execute(pgsql.SQL("CREATE SCHEMA {}").format(pgsql.Identifier(scratch)))
    db.execute(sql.replace(SEARCH_PATH, f'SET search_path TO "{scratch}", public, extensions;'))
    expected, actual = structure(db, scratch), structure(db, schema)
    for table in expected.keys() & actual.keys():
        if expected[table] != actual[table]:
            raise MigrationError("Baseline adoption rejected: incompatible table " + table)
    db.execute(pgsql.SQL("DROP SCHEMA {} CASCADE").format(pgsql.Identifier(scratch)))
    db.execute(sql.replace(SEARCH_PATH, f'SET search_path TO "{schema}", public, extensions;'))
    actual = structure(db, schema)
    if any(actual.get(table) != definition for table, definition in expected.items()):
        raise MigrationError("Baseline verification failed")


def migrate(db, directory=DB_DIR, schema="public"):
    from psycopg import sql as pgsql
    files = migration_files(directory)
    digests = {name: hashlib.sha256((directory / name).read_bytes()).hexdigest() for name, _ in files}
    with db.transaction():
        db.execute("SET LOCAL lock_timeout='30s'")
        db.execute("SET LOCAL statement_timeout='120s'")
        db.execute("SELECT pg_advisory_xact_lock(17294002)")
        db.execute(pgsql.SQL("SET LOCAL search_path TO {},public,extensions").format(pgsql.Identifier(schema)))
        db.execute("""CREATE TABLE IF NOT EXISTS schema_migrations (
            name TEXT PRIMARY KEY, sha256 CHAR(64) NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now())""")
        applied, renames = canonical_ledger(dict(db.execute("SELECT name,sha256 FROM schema_migrations")), digests)
        for target, previous in renames:
            db.execute("UPDATE schema_migrations SET name=%s WHERE name=%s", (target, previous))
        completed = []
        for name, sql in files:
            digest = digests[name]
            if name in applied:
                continue
            if name == "001_baseline.sql":
                adopt_baseline(db, sql, schema)
            else:
                db.execute(sql.replace(SEARCH_PATH, f'SET search_path TO "{schema}", public, extensions;'))
            db.execute("INSERT INTO schema_migrations(name,sha256) VALUES(%s,%s)", (name,digest))
            completed.append(name)
        return completed


def main():
    argparse.ArgumentParser(description=__doc__).parse_args()
    with connect() as db:
        print(json.dumps({"applied": migrate(db)}))


if __name__ == "__main__":
    main()
