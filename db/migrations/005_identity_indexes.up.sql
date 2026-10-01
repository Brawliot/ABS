-- ABS migration 005: add indexes for parte_identity range queries
-- UP

CREATE INDEX IF NOT EXISTS idx_parte_identity_created_at
  ON abs_identity.parte_identity (company_id, created_at);

CREATE INDEX IF NOT EXISTS idx_parte_identity_updated_at
  ON abs_identity.parte_identity (company_id, updated_at);

INSERT INTO abs_events.schema_migrations (version)
VALUES ('005_identity_indexes')
ON CONFLICT DO NOTHING;
