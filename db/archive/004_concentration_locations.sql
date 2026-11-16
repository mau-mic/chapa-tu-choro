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
