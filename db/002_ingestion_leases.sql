-- Additive leases: NULL on legacy attempts means unknown ownership, never expired.
SET search_path TO public, extensions;
ALTER TABLE ingestion_runs ADD COLUMN lease_token UUID;
ALTER TABLE ingestion_runs ADD COLUMN heartbeat_at TIMESTAMPTZ;
ALTER TABLE ingestion_runs ADD COLUMN lease_expires_at TIMESTAMPTZ;
ALTER TABLE ingestion_runs ADD CONSTRAINT ck_ingestion_lease_complete CHECK (
 (lease_token IS NULL AND heartbeat_at IS NULL AND lease_expires_at IS NULL) OR
 (lease_token IS NOT NULL AND heartbeat_at IS NOT NULL AND lease_expires_at IS NOT NULL
  AND lease_expires_at > heartbeat_at)
);
CREATE INDEX ix_ingestion_runs_expired ON ingestion_runs(lease_expires_at)
 WHERE status='running' AND lease_token IS NOT NULL;
