#!/usr/bin/env bash
# Restaura un dump lógico en una base limpia y verifica conteo de eventos.
# Uso: ./scripts/restore-verify.sh dump.sql postgres://user:pass@host:5432/abs_restore
set -euo pipefail
DUMP="${1:?dump.sql}"
URL="${2:?postgres connection url}"
echo "Restaurando $DUMP en $URL"
psql "$URL" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS abs_events CASCADE; DROP SCHEMA IF EXISTS abs_identity CASCADE; DROP SCHEMA IF EXISTS abs_outbox CASCADE;"
psql "$URL" -v ON_ERROR_STOP=1 -f "$DUMP"
COUNT=$(psql "$URL" -tAc "SELECT count(*) FROM abs_events.events")
echo "eventos restaurados: $COUNT"
test "$COUNT" -gt 0
echo "OK restore-verify"
