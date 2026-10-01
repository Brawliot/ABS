-- ABS migration 005: add indexes for parte_identity range queries
-- DOWN

DROP INDEX IF EXISTS abs_identity.idx_parte_identity_updated_at;
DROP INDEX IF EXISTS abs_identity.idx_parte_identity_created_at;

DELETE FROM abs_events.schema_migrations WHERE version = '005_identity_indexes';
