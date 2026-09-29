-- ABS migration 002: optional event snapshots for fast replay
-- UP

CREATE TABLE IF NOT EXISTS abs_events.snapshots (
  company_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  stream_version BIGINT NOT NULL,
  state_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, subject_id, stream_version)
);

ALTER TABLE abs_events.snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE abs_events.snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS snapshots_tenant_isolation ON abs_events.snapshots;
CREATE POLICY snapshots_tenant_isolation ON abs_events.snapshots
  FOR ALL
  USING (company_id = current_setting('abs.company_id', true))
  WITH CHECK (company_id = current_setting('abs.company_id', true));

GRANT SELECT, INSERT ON abs_events.snapshots TO abs_app;

INSERT INTO abs_events.schema_migrations (version)
VALUES ('002_snapshots')
ON CONFLICT DO NOTHING;
