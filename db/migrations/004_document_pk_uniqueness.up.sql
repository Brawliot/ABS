-- db/migrations/004_document_pk_uniqueness.up.sql
-- ABS migration 004: clarify PRIMARY KEY uniqueness
-- 
-- The PRIMARY KEY (company_id, id) on abs_events.events guarantees
-- global uniqueness across all instances. All event id deduplication
-- must rely on the database constraint, not instance-level caches.
-- See: PostgresEventStore.appendImmediate() error handling.

-- No schema changes. This is a documentation migration.

INSERT INTO abs_events.schema_migrations (version)
VALUES ('004_document_pk_uniqueness')
ON CONFLICT DO NOTHING;