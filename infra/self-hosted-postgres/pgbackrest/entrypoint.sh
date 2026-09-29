#!/bin/bash
# Stub: en imagen postgres no viene pgBackRest; en nodos reales instalar paquete.
# Aquí documentamos el flujo y archivamos WAL vía archive_command del primario.
set -euo pipefail
echo "[pgbackrest] sidecar de referencia — instalar pgbackrest en el host de datos"
echo "Flujo prod: pgbackrest --stanza=abs stanza-create && pgbackrest --stanza=abs backup"
sleep infinity
