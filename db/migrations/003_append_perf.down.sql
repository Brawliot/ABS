-- DOWN 003
ALTER TABLE abs_events.events
  ALTER COLUMN payload TYPE JSONB USING payload::jsonb;
CREATE INDEX IF NOT EXISTS idx_events_subject
  ON abs_events.events (company_id, subject_id, stream_version);
DELETE FROM abs_events.schema_migrations WHERE version = '003_append_perf';
