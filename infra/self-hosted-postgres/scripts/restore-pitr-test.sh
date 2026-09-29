#!/usr/bin/env sh
# Restauración verificada (pg_dump → destino limpio → mismo count).
set -eu
SRC="${ABS_POSTGRES_URL:-postgres://abs:abs-dev-only@127.0.0.1:5432/abs}"
DST="${ABS_POSTGRES_RESTORE_URL:-postgres://abs:abs-dev-only@127.0.0.1:5433/abs_restore}"
DUMP="${TMPDIR:-/tmp}/abs-pitr-$$.sql"

echo "[restore] dump origen…"
pg_dump --no-owner --schema=abs_events --schema=abs_identity --schema=abs_outbox -f "$DUMP" "$SRC"

echo "[restore] limpiar destino y aplicar…"
psql "$DST" -v ON_ERROR_STOP=1 -c "
  DROP SCHEMA IF EXISTS abs_events CASCADE;
  DROP SCHEMA IF EXISTS abs_identity CASCADE;
  DROP SCHEMA IF EXISTS abs_outbox CASCADE;
"
psql "$DST" -v ON_ERROR_STOP=1 -f "$DUMP"

SRC_C=$(psql "$SRC" -Atc "SELECT count(*) FROM abs_events.events" 2>/dev/null || echo 0)
DST_C=$(psql "$DST" -Atc "SELECT count(*) FROM abs_events.events")
echo "[restore] origen=$SRC_C destino=$DST_C"
test "$SRC_C" = "$DST_C"
echo "[restore] OK — counts iguales tras restore"
rm -f "$DUMP"
