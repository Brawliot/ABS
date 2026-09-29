# Informe — activación real de plantillas tpl.*

Fecha: 2026-09-28 · Suite: `npm test` (tsc + vitest + Playwright)

## Resumen

| Plantilla | Activación en Juez | Prueba | Notas |
|-----------|-------------------|--------|-------|
| `tpl.descuento_maximo_sin_aprobacion` | Sí — restricción `descuento_pct` | `policy-templates.activation.test.ts` | Rechaza descuento > umbral |
| `tpl.importe_requiere_aprobacion` | Sí — `present` + aprobación por umbral | activation + E2E `templates-weak` | Sin `importe` rechaza; umbral alto exige rol en unit test |
| `tpl.limite_credito_por_cliente` | Sí — `factRestriction` saldo+importe | activation + `credit-limit.properties.test.ts` | Bloqueo ferretería en E2E adverse |
| `tpl.bloqueo_por_impago` | Sí — `present` + restricción | activation + E2E `templates-weak` | Sin dato o impago activo rechaza |
| `tpl.plazo_devolucion` | Sí — `legal_deadline` | activation | Bloquea cierre dentro del plazo legal |
| `tpl.aviso_plazo` | No bloquea transiciones | activation | Solo `dataRetention` documental |
| `tpl.restriccion_saldo_antes_de` | Sí — hecho `parte.saldo_pendiente` | activation + `composer.gaps` + E2E taller | |
| `tpl.evidencia_requerida` | Sí — `evidence_requirement` cumplimiento | activation + E2E clínica | |
| `tpl.fianza_condicional` | Sí — restricción `fianza_eur` | activation + E2E maquinaria | Restricción única (sin condition gte obligatoria) |
| `tpl.permiso_excepcion` | Sí — guarda de permiso | activation | Rol no autorizado rechazado |
| `tpl.limite_plazos_financiacion` | Sí — restricción `plazos_meses` | activation | |
| `tpl.hitos_pago` | Sí — condición `eq true` por hito | activation + `hitos-phase.properties` + E2E reformas | Regla nativa en `ruleSet`; compositor enriquece `hitosJson` |

## Cambios clave de producto

1. **`tpl.hitos_pago`**: emite condiciones por hito (`hito_{id}_cobrado` / `hito_anterior_cobrado`); el compositor inyecta `hitosJson`.
2. **Plantillas débiles**: `present` en campos críticos; el Juez rechaza si falta dato (no pasa silenciosamente).
3. **Runtime web**: `enrichFormForTransition` aporta defaults seguros (`dias_impago`, `importe`, `recibos_pendientes`, hitos cobrados en camino feliz).
4. **`ABS_SESSION_SECRET`**: ≥32 caracteres en producción; `assertProductionSecurityConfig()` en arranque del servidor.

## Plantilla sin guarda bloqueante

- **`tpl.aviso_plazo`**: compila cumplimiento con `dataRetention` únicamente; no genera reglas en el Juez. Activación = documentación/retención, no bloqueo de transición.

## Cobertura de pruebas nuevas

- `tests/policy-templates.activation.test.ts` — una prueba por plantilla vía Juez
- `tests/hitos-phase.properties.test.ts` — propiedad hitos
- `tests/session-secret.production.test.ts` — secreto de sesión
- `tests/e2e/adverse/templates-weak.playwright.test.ts` — E2E impago + importe ausente
