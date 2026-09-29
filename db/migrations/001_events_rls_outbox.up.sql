-- ABS migration 001: events append-only + company isolation + optimistic concurrency
-- UP

CREATE SCHEMA IF NOT EXISTS abs_events;
CREATE SCHEMA IF NOT EXISTS abs_identity;
CREATE SCHEMA IF NOT EXISTS abs_outbox;

-- App role placeholder (created by deploy scripts if missing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'abs_app') THEN
    CREATE ROLE abs_app LOGIN PASSWORD 'change-me-in-deploy';
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS abs_events.events (
  id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  stream_version BIGINT NOT NULL,
  payload TEXT NOT NULL,
  seq BIGSERIAL NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, id),
  CONSTRAINT events_stream_version_uq UNIQUE (company_id, subject_id, stream_version)
);

CREATE INDEX IF NOT EXISTS idx_events_seq
  ON abs_events.events (company_id, seq);

-- payload TEXT: insert más rápido que JSONB (el cliente serializa JSON)
-- (migración 003 altera instalaciones ya existentes)

-- Append-only trigger: reject UPDATE/DELETE
CREATE OR REPLACE FUNCTION abs_events.reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ABS events are append-only: % not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_no_update ON abs_events.events;
CREATE TRIGGER trg_events_no_update
  BEFORE UPDATE OR DELETE ON abs_events.events
  FOR EACH ROW EXECUTE PROCEDURE abs_events.reject_mutation();

-- RLS
ALTER TABLE abs_events.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE abs_events.events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS events_tenant_isolation ON abs_events.events;
CREATE POLICY events_tenant_isolation ON abs_events.events
  FOR ALL
  USING (company_id = current_setting('abs.company_id', true))
  WITH CHECK (company_id = current_setting('abs.company_id', true));

-- App role: INSERT + SELECT only (no UPDATE/DELETE)
GRANT USAGE ON SCHEMA abs_events TO abs_app;
GRANT SELECT, INSERT ON abs_events.events TO abs_app;
GRANT USAGE, SELECT ON SEQUENCE abs_events.events_seq_seq TO abs_app;
REVOKE UPDATE, DELETE ON abs_events.events FROM abs_app;

-- Identity schema (PII)
CREATE TABLE IF NOT EXISTS abs_identity.parte_identity (
  company_id TEXT NOT NULL,
  parte_id TEXT NOT NULL,
  ciphertext BYTEA NOT NULL,
  nonce BYTEA NOT NULL,
  erased_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, parte_id)
);

ALTER TABLE abs_identity.parte_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE abs_identity.parte_identity FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS identity_tenant_isolation ON abs_identity.parte_identity;
CREATE POLICY identity_tenant_isolation ON abs_identity.parte_identity
  FOR ALL
  USING (company_id = current_setting('abs.company_id', true))
  WITH CHECK (company_id = current_setting('abs.company_id', true));

GRANT USAGE ON SCHEMA abs_identity TO abs_app;
GRANT SELECT, INSERT, UPDATE ON abs_identity.parte_identity TO abs_app;

-- Outbox for external effects
CREATE TABLE IF NOT EXISTS abs_outbox.outbox (
  id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  PRIMARY KEY (company_id, id)
);

CREATE INDEX IF NOT EXISTS idx_outbox_unpublished
  ON abs_outbox.outbox (company_id, created_at)
  WHERE published_at IS NULL;

ALTER TABLE abs_outbox.outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE abs_outbox.outbox FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outbox_tenant_isolation ON abs_outbox.outbox;
CREATE POLICY outbox_tenant_isolation ON abs_outbox.outbox
  FOR ALL
  USING (company_id = current_setting('abs.company_id', true))
  WITH CHECK (company_id = current_setting('abs.company_id', true));

GRANT USAGE ON SCHEMA abs_outbox TO abs_app;
GRANT SELECT, INSERT, UPDATE ON abs_outbox.outbox TO abs_app;

-- Schema migrations ledger
CREATE TABLE IF NOT EXISTS abs_events.schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO abs_events.schema_migrations (version)
VALUES ('001_events_rls_outbox')
ON CONFLICT DO NOTHING;
