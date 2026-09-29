#!/bin/bash
# Arranque de réplica física desde el primario (pg_basebackup).
set -euo pipefail

PRIMARY_HOST="${PRIMARY_HOST:-pg-primary}"
DATA_DIR="${PGDATA:-/var/lib/postgresql/data}"

if [ ! -s "$DATA_DIR/PG_VERSION" ]; then
  echo "[replica] basebackup desde $PRIMARY_HOST…"
  until pg_isready -h "$PRIMARY_HOST" -U abs -d abs; do sleep 2; done
  rm -rf "$DATA_DIR"/*
  PGPASSWORD=abs-ha-dev-only pg_basebackup \
    -h "$PRIMARY_HOST" -U replicator -D "$DATA_DIR" -Fp -Xs -P -R \
    -S abs_replica_slot || \
  PGPASSWORD=abs-ha-dev-only pg_basebackup \
    -h "$PRIMARY_HOST" -U replicator -D "$DATA_DIR" -Fp -Xs -P -R
  chown -R postgres:postgres "$DATA_DIR" 2>/dev/null || true
fi

exec docker-entrypoint.sh postgres \
  -c hot_standby=on \
  -c primary_conninfo="host=$PRIMARY_HOST user=replicator password=abs-ha-dev-only" \
  -c promote_trigger_file=/tmp/promote
