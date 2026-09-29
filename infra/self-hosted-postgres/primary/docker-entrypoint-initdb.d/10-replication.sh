#!/bin/bash
set -euo pipefail
mkdir -p /var/lib/pgbackrest/archive
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'replicator') THEN
      CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'abs-ha-dev-only';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'abs_app') THEN
      CREATE ROLE abs_app LOGIN PASSWORD 'abs-ha-dev-only';
    END IF;
  END\$\$;
EOSQL
# Slot puede recrearse; ignorar si ya existe en reinicios con volumen.
psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -c "SELECT pg_create_physical_replication_slot('abs_replica_slot', true);" || true
