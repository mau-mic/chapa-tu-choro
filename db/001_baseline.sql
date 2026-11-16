-- Source of truth for the MVP database schema. Run once in PostGIS Docker or the Supabase SQL editor.
-- When using Supabase, enable PostGIS in the extensions schema and include extensions in search_path.
CREATE EXTENSION IF NOT EXISTS postgis;
SET search_path TO public, extensions;

-- Aggregated police reports. NOT individual incidents or precise crime locations.
CREATE TABLE IF NOT EXISTS monthly_reports (
    year SMALLINT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    ubigeo VARCHAR(6) NOT NULL CHECK (ubigeo ~ '^[0-9]{6}$'),
    department TEXT NOT NULL,
    province TEXT NOT NULL,
    district TEXT NOT NULL,
    category TEXT NOT NULL,
    reports INTEGER NOT NULL CHECK (reports >= 0),
    PRIMARY KEY (year, month, ubigeo, category)
);
CREATE INDEX IF NOT EXISTS ix_reports_geography ON monthly_reports (ubigeo, year, month);
CREATE INDEX IF NOT EXISTS ix_reports_period_category ON monthly_reports (year, month, category);

CREATE TABLE IF NOT EXISTS district_boundaries (
    ubigeo VARCHAR(6) PRIMARY KEY CHECK (ubigeo ~ '^[0-9]{6}$'),
    district TEXT NOT NULL,
    geom geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_district_boundaries_gist ON district_boundaries USING GIST (geom);

-- Prevent reprocessing exact same imported source and preserve provenance.
CREATE TABLE IF NOT EXISTS import_runs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_kind VARCHAR(30) NOT NULL,
    source_name TEXT NOT NULL,
    sha256 CHAR(64) NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    selected_rows BIGINT NOT NULL CHECK (selected_rows >= 0),
    UNIQUE (source_kind, sha256)
);

-- Recommended for future incident module (not created yet): incidents + incident_sources + moderation.
-- Do not merge incidents from news into the SIDPOL monthly_reports totals.
-- Additive upgrade for databases initialized before nationwide exploration.
-- Run once before the new ETL/API. Never delete the existing database volume.
SET search_path TO public, extensions;
CREATE TABLE IF NOT EXISTS department_boundaries (
    ubigeo VARCHAR(2) PRIMARY KEY CHECK (ubigeo ~ '^[0-9]{2}$' AND ubigeo <> '00'),
    department TEXT NOT NULL,
    geom geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_department_boundaries_gist ON department_boundaries USING GIST (geom);

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

-- Server-side spatial aggregates. No case IDs, addresses or personal fields.
SET search_path TO public, extensions;
CREATE TABLE IF NOT EXISTS concentration_locations (
 import_id BIGINT NOT NULL,
 category TEXT NOT NULL,
 ubigeo VARCHAR(6) NOT NULL,
 longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -82 AND -68),
 latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -19 AND 1),
 records BIGINT NOT NULL CHECK (records > 0),
 position geography(Point,4326) GENERATED ALWAYS AS
   (ST_SetSRID(ST_MakePoint(longitude,latitude),4326)::geography) STORED,
 PRIMARY KEY(import_id,category,ubigeo,longitude,latitude),
 FOREIGN KEY(import_id,category) REFERENCES concentration_series(import_id,category) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_concentration_locations_position ON concentration_locations USING GIST(position);
CREATE INDEX IF NOT EXISTS ix_concentration_locations_scope ON concentration_locations(import_id,category,ubigeo);
-- Supabase browser roles must never read coordinates, even through PostgREST.
ALTER TABLE concentration_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON concentration_locations FROM PUBLIC;
DO $$ DECLARE client_role text; BEGIN
 FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
     EXECUTE format('REVOKE ALL ON concentration_locations FROM %I',client_role);
   END IF;
 END LOOP;
END $$;

-- Phase 3: additive catalogue and attempt history. No changes to imported statistics.
SET search_path TO public, extensions;
CREATE TABLE IF NOT EXISTS ingestion_sources (
 source_key TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 publisher TEXT NOT NULL,
 source_url TEXT NOT NULL CHECK (source_url LIKE 'https://%'),
 source_format TEXT NOT NULL,
 counting_unit TEXT NOT NULL,
 coverage TEXT NOT NULL,
 access_mode TEXT NOT NULL CHECK(access_mode IN ('etl','browser')),
 usage_status TEXT NOT NULL DEFAULT 'unresolved' CHECK(usage_status IN ('unresolved','published_terms_recorded','express_authorization_recorded')),
 terms_url TEXT,
 notes TEXT NOT NULL DEFAULT '',
 enabled BOOLEAN NOT NULL DEFAULT true,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ingestion_runs (
 run_id UUID PRIMARY KEY,
 pipeline TEXT NOT NULL CHECK(pipeline IN ('statistics','concentration','manual')),
 status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','succeeded','unchanged','unavailable','failed')),
 stage TEXT NOT NULL DEFAULT 'configuration',
 started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 finished_at TIMESTAMPTZ,
 requested_year SMALLINT CHECK(requested_year BETWEEN 2000 AND 2100),
 requested_month SMALLINT CHECK(requested_month BETWEEN 1 AND 12),
 error_type TEXT,
 CHECK ((status='running' AND finished_at IS NULL) OR (status<>'running' AND finished_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS ingestion_run_sources (
 run_id UUID NOT NULL REFERENCES ingestion_runs(run_id),
 source_key TEXT NOT NULL REFERENCES ingestion_sources(source_key),
 outcome TEXT CHECK(outcome IN ('succeeded','unchanged','unavailable','failed')),
 sha256 CHAR(64) CHECK(sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$'),
 counters JSONB NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(counters)='object'),
 PRIMARY KEY(run_id,source_key)
);
CREATE INDEX IF NOT EXISTS ix_ingestion_runs_recent ON ingestion_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS ix_ingestion_runs_status ON ingestion_runs(status,started_at);
CREATE INDEX IF NOT EXISTS ix_ingestion_source_history ON ingestion_run_sources(source_key,run_id);

-- Seed only missing entries; reruns preserve maintainer edits and permissions review.
INSERT INTO ingestion_sources(source_key,title,publisher,source_url,source_format,counting_unit,coverage,access_mode,usage_status,terms_url,notes) VALUES
('sidpol-national','SIDPOL complaint statistics','MININTER / PNP','https://www.datosabiertos.gob.pe/dataset/denuncias-policiales-registradas-nivel-nacional-mininter','csv','published-complaint-counts','Peru; imported reporting periods','etl','published_terms_recorded','https://www.datosabiertos.gob.pe/dataset/denuncias-policiales-registradas-nivel-nacional-mininter','Catalogue terms recorded; no rights inferred for other sources.'),
('inei-departments','INEI departments','INEI','https://geoespacial.inei.gob.pe/geoserver/Interoperabilidad/ows','wfs-geojson','administrative-boundaries','Peru','etl','unresolved','https://ide.inei.gob.pe/','Source-specific intended-use review pending.'),
('inei-districts','INEI districts','INEI','https://geoespacial.inei.gob.pe/geoserver/Interoperabilidad/ows','wfs-geojson','administrative-boundaries','Peru','etl','unresolved','https://ide.inei.gob.pe/','Source-specific intended-use review pending.'),
('archive-2025-homicide','archive-2025-homicide','MININTER / PNP','https://services6.arcgis.com/lMIZrqiJkpM748BR/arcgis/rest/services/HOMICIDIO_IDMODALIDAD_1010102_AL_1010130/FeatureServer/2','arcgis-geojson','source-classification-rows','2025; completed monthly/category imports only','etl','unresolved',NULL,'No combined 2025 total. Identity, precision and reuse conditions unresolved.'),
('archive-2025-extortion','archive-2025-extortion','MININTER / PNP','https://services6.arcgis.com/lMIZrqiJkpM748BR/arcgis/rest/services/EXTORSION_IDSUBTIPO_10508/FeatureServer/1','arcgis-geojson','source-classification-rows','2025; completed monthly/category imports only','etl','unresolved',NULL,'No combined 2025 total. Identity, precision and reuse conditions unresolved.'),
('archive-2025-theft','archive-2025-theft','MININTER / PNP','https://services6.arcgis.com/lMIZrqiJkpM748BR/arcgis/rest/services/HURTO_IDSUBTIPO_10501/FeatureServer/2','arcgis-geojson','source-classification-rows','2025; completed monthly/category imports only','etl','unresolved',NULL,'No combined 2025 total. Identity, precision and reuse conditions unresolved.'),
('archive-2025-robbery','archive-2025-robbery','MININTER / PNP','https://services6.arcgis.com/lMIZrqiJkpM748BR/arcgis/rest/services/ROBO_IDSUBTIPO_10502/FeatureServer/3','arcgis-geojson','source-classification-rows','2025; completed monthly/category imports only','etl','unresolved',NULL,'No combined 2025 total. Identity, precision and reuse conditions unresolved.'),
('archive-2025-fraud','archive-2025-fraud','MININTER / PNP','https://services6.arcgis.com/lMIZrqiJkpM748BR/arcgis/rest/services/ESTAFA_IDSUBTIPO_10506/FeatureServer/4','arcgis-geojson','source-classification-rows','2025; completed monthly/category imports only','etl','unresolved',NULL,'No combined 2025 total. Identity, precision and reuse conditions unresolved.'),
('archive-2025-violence','archive-2025-violence','MININTER / PNP','https://services6.arcgis.com/lMIZrqiJkpM748BR/arcgis/rest/services/VCM_IDTIPO_504/FeatureServer/0','arcgis-geojson','source-classification-rows','2025; completed monthly/category imports only','etl','unresolved',NULL,'No combined 2025 total. Identity, precision and reuse conditions unresolved.'),
('archive-2025-gangs','archive-2025-gangs','MININTER / PNP','https://services6.arcgis.com/lMIZrqiJkpM748BR/arcgis/rest/services/PANDILLAJE_IDSUBTIPO_40101/FeatureServer/6','arcgis-geojson','source-classification-rows','2025; completed monthly/category imports only','etl','unresolved',NULL,'No combined 2025 total. Identity, precision and reuse conditions unresolved.'),
('archive-2025-drugs','archive-2025-drugs','MININTER / PNP','https://services6.arcgis.com/lMIZrqiJkpM748BR/arcgis/rest/services/MICROCOMERCIALIZACION_IDMODALIDAD_1120341_5070112_5070122/FeatureServer/1','arcgis-geojson','source-classification-rows','2025; completed monthly/category imports only','etl','unresolved',NULL,'No combined 2025 total. Identity, precision and reuse conditions unresolved.'),
('active-2026','active-2026','MININTER / PNP','https://services6.arcgis.com/lMIZrqiJkpM748BR/arcgis/rest/services/SIDPOL_DELITOS_TOTAL/FeatureServer/25','arcgis-geojson','source-classification-rows','2026; completed monthly/category imports only','etl','unresolved',NULL,'No combined 2025 total. Identity, precision and reuse conditions unresolved.'),
('mininter-basic-stations','Basic police stations','MININTER / PNP','https://geomininter.mininter.gob.pe/arcgis/rest/services/ogc/lineabase/MapServer/2','arcgis-geojson','police-installations','Peru; completeness and update date undeclared','browser','unresolved','https://www.geoidep.gob.pe/static/docs/terminos_condiciones.pdf','Browser-only adapter; not an ingestion job.'),
('street-basemap','Street context','OpenFreeMap / OpenMapTiles / OpenStreetMap','https://tiles.openfreemap.org/styles/positron','vector-tiles','geographic-context','Provider coverage; current geography','browser','published_terms_recorded','https://openfreemap.org/quick_start/','Provider attribution required; no availability guarantee.')
ON CONFLICT(source_key) DO NOTHING;

-- Catalogue/operations data is server-only, not a public PostgREST API.
DO $$ DECLARE tab text; client_role text; BEGIN
 FOREACH tab IN ARRAY ARRAY['ingestion_sources','ingestion_runs','ingestion_run_sources'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',tab);
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
    EXECUTE format('REVOKE ALL ON %I FROM %I',tab,client_role);
   END IF;
  END LOOP;
 END LOOP;
END $$;
