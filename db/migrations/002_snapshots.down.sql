-- ABS migration 002 DOWN
DROP POLICY IF EXISTS snapshots_tenant_isolation ON abs_events.snapshots;
DROP TABLE IF EXISTS abs_events.snapshots;
DELETE FROM abs_events.schema_migrations WHERE version = '002_snapshots';
