-- db/migrations/004_document_pk_uniqueness.down.sql
-- ABS migration 004: documentation migration (no schema changes)

DELETE FROM abs_events.schema_migrations WHERE version = '004_document_pk_uniqueness';
