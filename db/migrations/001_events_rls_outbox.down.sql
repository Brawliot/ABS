-- ABS migration 001 DOWN (reversible)

DROP POLICY IF EXISTS outbox_tenant_isolation ON abs_outbox.outbox;
DROP TABLE IF EXISTS abs_outbox.outbox;
DROP SCHEMA IF EXISTS abs_outbox CASCADE;

DROP POLICY IF EXISTS identity_tenant_isolation ON abs_identity.parte_identity;
DROP TABLE IF EXISTS abs_identity.parte_identity;
DROP SCHEMA IF EXISTS abs_identity CASCADE;

DROP TRIGGER IF EXISTS trg_events_no_update ON abs_events.events;
DROP FUNCTION IF EXISTS abs_events.reject_mutation();
DROP POLICY IF EXISTS events_tenant_isolation ON abs_events.events;
DROP TABLE IF EXISTS abs_events.events;
DROP TABLE IF EXISTS abs_events.schema_migrations;
DROP SCHEMA IF EXISTS abs_events CASCADE;
