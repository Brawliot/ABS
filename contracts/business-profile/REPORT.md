# Informe — BusinessProfile v1.1

## Cambios respecto a v1.0

| Decisión | Cambio |
|----------|--------|
| 1 Permisos | Matriz = excepciones + `permissionFallback` (ask). No rol×transición. |
| 2 Inventario | `naturalezaBienes`; Inventario ↔ `propios_por_cantidad`. Fixture concesionaria: `propios_unitarios`. |
| 3 Calendario | unknown + tiene citas → L-V 9–18 + festivos `location`, confirmación. |
| 4 Portal | autoservicio ⇒ cliente + visibilidad `propia` (máx.). |
| 5 Ids | `caseId` / `documentId` / `compiledVersion` fuera del perfil; `generateSystemIds`. |
| 6 Plantillas | Propuesta abajo (sin implementar). |
| 7 Composición | Tarea pendiente documentada; no implementada. |

## structuralHash concesionaria

**Resultado: IDÉNTICO** al legacy (probado en `tests/business-profile.test.ts`).  
`propios_unitarios` no activa Inventario; sin TPV; mismos módulos CRM / Facturación / Agenda taller.

## Plantillas de políticas parametrizables (propuesta, sin código)

Cubren lo que hoy lleva el pack concesionaria vía excepciones + compliance (y dejan JSON crudo como vía avanzada):

| Plantilla | Parámetros | Expande a |
|-----------|------------|-----------|
| `tpl.permiso_transicion` | `transitionId`, `roles[]` | PermissionPolicy ejecutar |
| `tpl.permiso_cierre_financiero` | `rolesCierre[]` | permiso sobre `t_cerrar` |
| `tpl.visor_cliente_propia` | — | consultar + visibility propia |
| `tpl.fallback_gerente` | `roleId`, `excludeTransitionIds?` | permissionFallback |
| `tpl.factura_obligatoria_al_cerrar` | `referenceType?` | compliance evidencia física en `t_cerrar` |
| `tpl.retencion_fiscal` | `description`, `años?` | compliance dataRetention |

Uso futuro: `businessPolicyTemplates: Field<{ id, params }[]>` → compilador de plantillas → `PermissionPolicy` / `CompliancePolicy`. Hasta entonces: `businessPolicies` JSON o excepciones + compliance known.

## Tarea pendiente — Composición

- Añadir a `GeneratorInput` la composición (`dominant` + `secondaries` con `bloquea` / `bornInDominantState`).
- Hacer que el Generador (vistas/recorridos/módulos) la consuma.
- Exponerla en BusinessProfile de forma conversable.
- **No hecho en v1.1.**

## Verificación

- `tsc --noEmit` OK  
- Suite Vitest (incl. business-profile + regeneración packs)
