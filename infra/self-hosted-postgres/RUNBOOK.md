# Runbook — PostgreSQL auto-gestionado (ABS)

## Alcance
Operación de clúster PostgreSQL 16 estándar con réplica en streaming, archivo WAL
(PITR) y conmutación. Herramientas: **Patroni** (HA prod), **etcd**, **HAProxy**,
**pgBackRest**. El compose de lab usa primario+réplica+promote manual para pruebas.

## Actualizaciones / parches de seguridad
1. Leer notas de versión PostgreSQL / Patroni / pgBackRest.
2. Aplicar primero en réplica: detener réplica → parche OS/paquetes → reanudar.
3. Hacer switchover controlado (Patroni `switchover`) al nodo parcheado.
4. Parchear el antiguo primario (ahora réplica).
5. Verificar `pg_stat_replication` y un insert de canario.

## Rotación de credenciales
1. Crear rol nuevo con la misma membresía (`CREATE ROLE … LOGIN`).
2. Actualizar secretos en el vault / env de la app (`ABS_POSTGRES_URL`).
3. Rodar pods/procesos de app.
4. `REVOKE` / `DROP ROLE` del anterior tras 24 h sin conexiones (`pg_stat_activity`).
5. Rotar también `replicator` y claves TLS (si `hostssl`).

## Ampliación de disco
1. Alertas: filesystem > 75 % warning, > 85 % critical.
2. Ampliar volumen del hipervisor / LVM.
3. `resize2fs` / `xfs_growfs` en caliente.
4. No bajar `max_wal_size` durante picos de archive.

## Alertas y respuesta

| Alerta | Acción |
|--------|--------|
| Primario caído / Patroni leader missing | Verificar promote automático; si no, `patronictl failover`. Revisar eventos no confirmados (solo en vuelo). |
| Réplica lag > 30 s | Mirar red/disco; pausar jobs pesados; si lag crece, alertar on-call. |
| Archive command failed | Disco de backup / permisos pgBackRest; WAL se acumula — riesgo de llenado. |
| Backup full fallido | Reintentar; si 2 fallos seguidos, restore drill en staging. |
| Conexiones > 80 % `max_connections` | Subir pool app / PgBouncer; investigar leaks. |
| Checksum / corruption | Detener escrituras; restore PITR a momento previo; abrir incidente. |
| Certificado TLS < 14 días | Renovar y recargar HAProxy/PG (`pg_reload_conf`). |

## Failover de prueba (lab)
```bash
docker compose -f infra/self-hosted-postgres/docker-compose.yml up -d
bash infra/self-hosted-postgres/scripts/failover-test.sh
```

## Restore verificado
```bash
export ABS_POSTGRES_URL=... ABS_POSTGRES_RESTORE_URL=...
bash infra/self-hosted-postgres/scripts/restore-pitr-test.sh
# o: npx vitest run tests/backup.restore.test.ts
```

## Cifrado
- **En tránsito:** `ssl=on` + `hostssl` en `pg_hba.conf`; app con `?sslmode=require`.
- **En reposo:** volumen cifrado (LUKS / cloud disk encryption). PG no cifra tablespaces por defecto a propósito (portabilidad).

## Monitorización mínima
- `pg_stat_replication`, `pg_stat_archiver`, tamaño de data dir, lag bytes.
- Exportar a Prometheus (`postgres_exporter`) + alertas anteriores.
