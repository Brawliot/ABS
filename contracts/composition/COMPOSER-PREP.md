# COMPOSER-PREP — Informe de entrega

**Fecha:** 2026-09-28  
**Alcance:** contrato BusinessProfile **v1.2**, extensiones de núcleo de bajo riesgo, plantillas `tpl.*`, pruebas.  
**Fuente de requisitos:** `contracts/composition/EXPECTED-REPORT.md` (v1.1 revisado).

---

## 1. Implementado

### 1.1 Contrato BusinessProfile v1.2

| Pieza | Detalle |
|-------|---------|
| `schemaVersion` | `"1.2.0"`; **`"1.1.0"` sigue válida** (`SUPPORTED_SCHEMA_VERSIONS`) |
| `cobros` | Modelo tipado: `aCredito`, `aPlazos`, `fianzas`, `cuotasRecurrentes`, `pagosPorHitos` — cada uno `ProfileField` con known/unknown/not_applicable + confidence |
| Política unknown cobros | aCredito/aPlazos/cuotas → **ask**; fianzas/hitos → **default_safe** |
| `naturalezaBienes` unknown | **ask** (ya no default `[]`) |
| `capacityMode` | `cita_individual` \| `plazas` (default_safe → cita_individual + confirmación) |
| `processes[].exchangeDirection` | `empresa_vende` \| `empresa_compra` |
| `policyTemplates` | Invocaciones `tpl.*` → materialize compila a PolicyDocument |
| `portalCliente` | `{ autoservicio }` — unknown ⇒ **ask**; autoservicio=true exige canal |

Archivos: `contracts/business-profile/{types,schema,validate,materialize,CONTRACT,index}.ts`.

### 1.2 Extensiones de núcleo

| Extensión | Módulo | Pruebas |
|-----------|--------|---------|
| (a) Dirección de intercambio | `elements/exchange-direction.ts` | unit + properties |
| (b) Capacidad plazas vs cita | `facts/plazas.ts` + `capacityMode` | unit + properties |
| (c) Pagos por hitos | `archetypes/milestones.ts` + `cobros.pagosPorHitos` | unit + properties |
| (d) Liquidación fianza antes de cierre | `elements/retention-settlement.ts` | unit + properties |

Propiedad común: ninguna composición/uso de la extensión deja una máquina inválida (`tests/quality/composer-prep.properties.test.ts`).

### 1.3 Plantillas de política

Catálogo en `contracts/policy-templates/`:

- `tpl.descuento_maximo_sin_aprobacion`
- `tpl.importe_requiere_aprobacion`
- `tpl.limite_credito_por_cliente`
- `tpl.bloqueo_por_impago`
- `tpl.plazo_devolucion`
- `tpl.aviso_plazo`

Compilación determinista → `BusinessPolicy` / `CompliancePolicy`; materialize fusiona en el documento y amplía `catalogFields`.

---

## 2. Documentado sin implementar (riesgo medio/alto o alcance estrecho)

| Extensión | Perfiles | Motivo |
|-----------|----------|--------|
| **filtro_dato_sensible** | p02, p06, p09 | Riesgo medio (PII / visibilidad cross-Parte) |
| **custodia** | p04 | Riesgo medio (recurso owned-by Parte + retorno) |
| **lotes** | p05, p07 | Riesgo medio (trazabilidad stock) |
| **plazos_externos** / fiscales | p06 | Riesgo alto (plazos legales externos) |
| **facturacion_agregada** | p03 | 1 perfil; cierre mensual agregado no tipado aún |
| **versionado_alcance** | p10 | 1 perfil; renegociación en `servicio_proyecto` |

Estas piezas siguen como `REQUIERE_EXTENSION` en expected JSON; el compositor debe no inventarlas en silencio.

---

## 3. Qué siguen sin ser expresables (composiciones esperadas)

Tras v1.2 + extensiones a–d:

| Necesidad (expected) | Estado |
|----------------------|--------|
| Cuenta Parte + límite/impago (p03) | **Expresable** vía `cobros.aCredito` + `tpl.limite_credito` / `tpl.bloqueo_por_impago` |
| MUST_ASK aPlazos / cuotas / naturaleza / portal | **Expresable** (política ask + `portalCliente`) |
| Compra a proveedor con `venta` | **Expresable** (`exchangeDirection` + API dirección) |
| Plazas (peluquería, restaurante, academia…) | **Expresable** (`capacityMode` + `facts/plazas`) |
| Hitos 30/40/30 (p10) | **Expresable** (`cobros.pagosPorHitos` + `milestones`) |
| Fianza liquidada antes de cierre (p05, p08, p09) | **Expresable** (`retention-settlement`) |
| Facturación agregada mensual (p03) | **No** — documentado |
| Versionado de alcance/presupuesto (p10) | **No** — documentado |
| Custodia vehículo cliente (p04) | **No** — documentado |
| Lotes / caducidad (p05, p07) | **No** — documentado |
| Filtro dato sensible (tutor→hijo, etc.) | **No** — documentado |
| Plazos fiscales externos (p06) | **No** — documentado |
| Integración mensajería tienda (p07) | **No** — fuera de núcleo |

---

## 4. Pruebas y calidad

- Nuevas: `tests/composer-prep.v12.test.ts`, `tests/quality/composer-prep.properties.test.ts`
- **No** se editaron pruebas existentes
- Invariantes Capa 0 / suites previas deben seguir verdes

---

*Fin del informe COMPOSER-PREP.*
