# Informe — modos de alojamiento, movimiento, PG propio, costes

Fecha: 2026-09-28

## 1. Dónde viven las cuentas y por qué

| Modo | Cuentas + membresías | EventStore / identidad / outbox |
|------|----------------------|----------------------------------|
| **COMPARTIDO** | Plano de control central (`AccountStore` / registry) | BD PostgreSQL compartida + `company_id` + RLS |
| **DEDICADO** | **Mismo plano de control central** | BD PostgreSQL propia (misma estructura + RLS) |
| **EN CLIENTE** | **Instalación local** (`local_install`) | BD PostgreSQL del cliente |

**Justificación:** un usuario puede pertenecer a varias empresas (shared y dedicated a la vez). Si las cuentas vivieran solo en la BD del negocio, el login multiempresa requeriría descubrir N bases antes de autenticar. El plano de control central guarda identidad de acceso y membresías; el enrutado (`CompanyDatabaseRegistry`) elige la BD de datos. En **EN CLIENTE** no hay dependencia de nuestros servidores: cuentas + registry + PG van en el paquete del negocio (`ACCOUNT_PLACEMENT.on_client = local_install`).

Código: `hosting/types.ts` (`ACCOUNT_PLACEMENT`), `hosting/registry.ts`, `hosting/pool-router.ts`.

## 2. Enrutado

- Registro `companyId → { mode, databaseUrl, readOnly }`.
- `PoolRouter` abre **un pool por URL**; `eventStore(companyId)` nunca usa otra base.
- Misma migración / RLS / trigger / outbox / cifrado en shared y dedicated (mover no cambia código de negocio).

## 3. Movimiento y exportación

- `moveCompany`: solo-lectura → export → import → verify (count, hash flujo, hash identidad, replay) → flip ruta → purge origen → verify origen vacío; rollback si falla.
- `exportCompanyToFile` / `bootstrapOnClient`: portabilidad completa del negocio.
- CLI: `npx tsx hosting/cli.ts export|move|bootstrap-on-client`.

## 4. PostgreSQL con medios propios

| Pieza | Herramienta OSS | Por qué |
|-------|-----------------|---------|
| HA + failover | Patroni (+ etcd) | Estándar de facto; promote automático |
| Endpoint único | HAProxy | Sin DNS propietario |
| Backup / PITR | pgBackRest + `archive_command` | Diferencial + WAL; restore a un instante |
| Motor | PostgreSQL 16 vanilla | Sin funciones de proveedor |

Lab: `infra/self-hosted-postgres/` + `RUNBOOK.md`.  
Scripts: `scripts/failover-test.sh`, `scripts/restore-pitr-test.sh`.

## 5. Resultados de pruebas

| Prueba | Resultado |
|--------|-----------|
| 2 shared + 1 dedicated simultáneos | **PASS** `tests/hosting.isolation.test.ts` |
| Move shared→dedicated→shared + verify | **PASS** `tests/hosting.move.test.ts` |
| EN CLIENTE desde export (cuentas locales + replay) | **PASS** `tests/hosting.on-client.test.ts` |
| Conmutación sin pérdida de confirmados | **PASS** `tests/hosting.failover.test.ts` |
| Restore counts (script Node) | **PASS** `npm run infra:restore-test` |
| Failover físico Patroni/lab | Script `infra/.../failover-test.sh` (stack HA) |
| Suite completa + tsc | **441 passed**, 1 skip (Playwright scaffold); `tsc --noEmit` OK |

Ejecutar hosting PG:
```bash
docker compose up -d postgres postgres-restore
export ABS_POSTGRES_URL=postgres://abs:abs-dev-only@127.0.0.1:5432/abs
export ABS_POSTGRES_RESTORE_URL=postgres://abs:abs-dev-only@127.0.0.1:5433/abs_restore
export ABS_POSTGRES_DEDICATED_URL=postgres://abs:abs-dev-only@127.0.0.1:5432/abs_dedicated
npx vitest run tests/hosting*.test.ts
```

## 6. Modelo de costes (orden de magnitud €/mes, UE)

Supuestos: ~5–20k eventos/empresa/año; 1 FTE ops = 6 000 €/mes cargado; managed PG pequeño ~40–80 €.

| Escala | Managed UE (todo shared) | Servidores propios (Patroni 2+1) | Mixto (shared + top dedicated) |
|--------|---------------------------|----------------------------------|--------------------------------|
| **10 empresas** | 50–90 € + 0,1 FTE (~600) ≈ **650–700** | 80–150 infra + 0,25 FTE ≈ **1 600–1 650** | Como managed; dedicated no compensa |
| **100 empresas** | 120–250 + 0,2 FTE ≈ **1 300–1 450** | 150–300 + 0,4 FTE ≈ **2 500–2 700** | Shared base + 5–10 dedicated: **1 800–2 200** |
| **1 000 empresas** | 600–1 200 + 0,5 FTE ≈ **3 600–4 200** | 400–800 + 1 FTE ≈ **6 400–6 800** | Shared + 50 dedicated + archive frío: **4 500–5 500** |

*Conclusión:* a poca escala el managed gana por ops; a partir de ~100 empresas el mixto equilibra control y coste; 1 000+ exige archive frío y ops propia aunque el hardware sea barato.

## 7. Crecimiento EventStore y archivado

- Estimación: `estimateEventStoreGrowth` (~1 KB/evento).
- Política: snapshot por subject + eventos > `coldAfterDays` (365) a object storage; cola caliente `keepRecentPerSubject` (1 000). Replay operativo = snapshot + caliente; auditoría rehidrata frío.

## 8. PROPUESTA PARA EL USUARIO — umbrales

| Condición | Acción recomendada |
|-----------|-------------------|
| ≤ 50 empresas, volumen bajo | **COMPARTIDO** (default) |
| 50–100 o un cliente exige aislamiento de red/datos | Ese cliente a **DEDICADO**; resto shared |
| Cliente regula “datos solo en mi VPC” | **EN CLIENTE** (export + bootstrap) |
| EventStore total > ~50 GiB | Activar **archivado frío** + snapshots |
| ≥ 100 empresas o coste managed > 0,5 FTE ops | Valorar **PG propio** (Patroni) o mixto |

Constantes: `HOSTING_THRESHOLDS` en `hosting/archive-policy.ts`.
