#!/usr/bin/env sh
# Prueba de conmutación lab (primario caído → promote réplica).
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
PRIMARY_URL="${PRIMARY_URL:-postgres://abs:abs-ha-dev-only@127.0.0.1:55432/abs}"
REPLICA_URL="${REPLICA_URL:-postgres://abs:abs-ha-dev-only@127.0.0.1:55433/abs}"

echo "[failover] insertando evento confirmado en primario…"
psql "$PRIMARY_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA IF NOT EXISTS abs_failover;
CREATE TABLE IF NOT EXISTS abs_failover.marker (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO abs_failover.marker(id) VALUES ('pre-failover')
ON CONFLICT DO NOTHING;
SQL

MARKER=$(psql "$PRIMARY_URL" -Atc "SELECT id FROM abs_failover.marker WHERE id='pre-failover'")
test "$MARKER" = "pre-failover"

echo "[failover] esperando replay en réplica…"
i=0
while [ "$i" -lt 30 ]; do
  if psql "$REPLICA_URL" -Atc "SELECT id FROM abs_failover.marker WHERE id='pre-failover'" 2>/dev/null | grep -q pre-failover; then
    break
  fi
  i=$((i + 1))
  sleep 1
done
psql "$REPLICA_URL" -Atc "SELECT id FROM abs_failover.marker WHERE id='pre-failover'" | grep -q pre-failover

echo "[failover] deteniendo primario…"
docker compose -f "$ROOT/docker-compose.yml" stop pg-primary

echo "[failover] promocionando réplica…"
docker compose -f "$ROOT/docker-compose.yml" exec -T pg-replica \
  psql -U abs -d abs -c "SELECT pg_promote();" || true

sleep 2
echo "[failover] escribiendo en (ex)réplica promovida…"
psql "$REPLICA_URL" -v ON_ERROR_STOP=1 \
  -c "INSERT INTO abs_failover.marker(id) VALUES ('post-failover') ON CONFLICT DO NOTHING;"

COUNT=$(psql "$REPLICA_URL" -Atc "SELECT count(*) FROM abs_failover.marker WHERE id IN ('pre-failover','post-failover')")
test "$COUNT" = "2"

echo "[failover] OK — evento pre-failover intacto; post-failover aceptado tras promote"
