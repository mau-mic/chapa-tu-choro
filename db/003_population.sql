-- Phase 4. Immutable workbook releases; only the active pointer changes.
SET search_path TO public, extensions;
CREATE TABLE population_releases (
 sha256 TEXT PRIMARY KEY CHECK (sha256 ~ '^[a-f0-9]{64}$'),
 source_url TEXT NOT NULL CHECK (source_url LIKE 'https://%'),
 imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 basis TEXT NOT NULL DEFAULT 'INEI preliminary projections 2018-2026; not Census 2025',
 active BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX ix_population_single_active ON population_releases(active) WHERE active;
CREATE TABLE population_observations (
 release_sha256 TEXT NOT NULL REFERENCES population_releases(sha256),
 year SMALLINT NOT NULL CHECK (year BETWEEN 2018 AND 2026),
 ubigeo VARCHAR(6) NOT NULL CHECK (ubigeo ~ '^[0-9]{6}$'),
 name TEXT NOT NULL CHECK (length(name)>0),
 people BIGINT CHECK (people>0),
 note TEXT NOT NULL DEFAULT '',
 PRIMARY KEY(release_sha256,year,ubigeo),
 CHECK (people IS NOT NULL OR length(note)>0)
);
-- PK covers release/year reads; retain source codes without requiring a geometry.
INSERT INTO ingestion_sources(source_key,title,publisher,source_url,source_format,counting_unit,coverage,access_mode,notes)
VALUES('inei-population','INEI annual population projections','INEI',
'https://www.gob.pe/institucion/inei/informes-publicaciones/6894980-peru-poblacion-total-proyectada-al-30-de-junio-de-cada-ano-segun-departamento-provincia-y-distrito-2018-2025',
'xlsx','projected-residents','2018-2026; June 30 annual reference; preliminary','etl',
'User-supplied official workbook. Historical newly-created districts may have unavailable population. Not a Census 2025 revision.');
DO $$ DECLARE tab text; client_role text; BEGIN
 FOREACH tab IN ARRAY ARRAY['population_releases','population_observations'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',tab);
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
    EXECUTE format('REVOKE ALL ON %I FROM %I',tab,client_role);
   END IF;
  END LOOP;
 END LOOP;
END $$;
