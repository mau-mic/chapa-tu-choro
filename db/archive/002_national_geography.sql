-- Additive upgrade for databases initialized before nationwide exploration.
-- Run once before the new ETL/API. Never delete the existing database volume.
SET search_path TO public, extensions;
CREATE TABLE IF NOT EXISTS department_boundaries (
    ubigeo VARCHAR(2) PRIMARY KEY CHECK (ubigeo ~ '^[0-9]{2}$' AND ubigeo <> '00'),
    department TEXT NOT NULL,
    geom geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_department_boundaries_gist ON department_boundaries USING GIST (geom);
