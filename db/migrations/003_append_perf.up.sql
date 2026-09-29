-- Drop redundant index (covered by UNIQUE stream_version) to speed appends
DROP INDEX IF EXISTS abs_events.idx_events_subject;

-- payload as text avoids jsonb parse on every insert; app still sends JSON
ALTER TABLE abs_events.events
  ALTER COLUMN payload TYPE TEXT USING payload::text;

INSERT INTO abs_events.schema_migrations (version)
VALUES ('003_append_perf')
ON CONFLICT DO NOTHING;
