-- Additive schema: coarse official source aggregates, never individual case rows.
SET search_path TO public, extensions;
CREATE TABLE IF NOT EXISTS concentration_imports (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 source_key TEXT NOT NULL,
 year SMALLINT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
 month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
 source_url TEXT NOT NULL,
 sha256 CHAR(64) NOT NULL,
 source_rows BIGINT NOT NULL CHECK (source_rows >= 0),
 distinct_source_ids BIGINT CHECK (distinct_source_ids >= 0),
 quality JSONB NOT NULL,
 imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(source_key,year,month)
);
CREATE TABLE IF NOT EXISTS concentration_series (
 import_id BIGINT NOT NULL REFERENCES concentration_imports(id) ON DELETE CASCADE,
 category TEXT NOT NULL,
 PRIMARY KEY(import_id,category)
);
CREATE TABLE IF NOT EXISTS concentration_areas (
 import_id BIGINT NOT NULL,
 category TEXT NOT NULL,
 ubigeo VARCHAR(6) NOT NULL CHECK (ubigeo ~ '^[0-9]{6}$'),
 source_records BIGINT NOT NULL CHECK (source_records >= 0),
 mapped_records BIGINT NOT NULL CHECK (mapped_records BETWEEN 0 AND source_records),
 PRIMARY KEY(import_id,category,ubigeo),
 FOREIGN KEY(import_id,category) REFERENCES concentration_series(import_id,category) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS concentration_cells (
 import_id BIGINT NOT NULL,
 category TEXT NOT NULL,
 ubigeo VARCHAR(6) NOT NULL,
 grid_x INTEGER NOT NULL,
 grid_y INTEGER NOT NULL,
 records BIGINT NOT NULL CHECK (records > 0),
 PRIMARY KEY(import_id,category,ubigeo,grid_x,grid_y),
 FOREIGN KEY(import_id,category,ubigeo) REFERENCES concentration_areas(import_id,category,ubigeo) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_concentration_areas_scope ON concentration_areas(ubigeo,category,import_id);

-- Existing installations: a reviewed source may omit the business identifier.
ALTER TABLE concentration_imports ALTER COLUMN distinct_source_ids DROP NOT NULL;
