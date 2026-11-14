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
