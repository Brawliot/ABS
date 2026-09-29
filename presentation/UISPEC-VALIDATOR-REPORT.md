# UISPEC-VALIDATOR-REPORT — Validador runtime de UiSpec

**Fecha:** 2026-09-28  
**Módulos:** `presentation/uispec-schema.ts`, `uispec-validator.ts`, `validated.ts`  
**Integración:** `generateUiSpec` sella; `renderUiSpecHtml` / `serializeValidatedUiSpec` exigen sello.

---

## 1. Reglas implementadas

| Área | Códigos | Detalle |
|------|---------|---------|
| Esquema | `SCHEMA`, `UNSUPPORTED_VERSION` | Zod completo; solo `PRESENTATION_SCHEMA_VERSION` (`2.0.0-mvp`) |
| Integridad | `REF_VIEW_STATE`, `REF_ACTION_TRANSITION`, `REF_ROLE`, `REF_PROCESS_GROUP`, `REF_PANEL`, `REF_INTERNAL`, `REF_DUPLICATE` | Estados/transiciones/roles/processGroups/paneles; sin huérfanos ni ids duplicados |
| Coherencia | `COHERENCE_ROLE_ACTION`, `COHERENCE_MISSING_BLOCK`, `COHERENCE_TERMINAL_REOPEN` | visibleRoles ⊆ guards; todo `bloquea` tiene `panel_bloqueo`; terminal sin acciones de salida |
| Seguridad | `SECURITY_DESIGN_LITERAL`, `SECURITY_INJECTION`, `SECURITY_SENSITIVE_FIELD`, `SECURITY_PORTAL_FIELD` | Reutiliza `assertSpecHasNoLiteralDesignValues`; HTML/JS; Filtro `DEFAULT_FIELD_RULES`; portal scope `propia` |
| Sello | `NOT_VALIDATED` | Render y persistencia rechazan UiSpec sin validar |

Errores: `UiSpecValidationError` con **lista completa** de issues + `path` exacto.

---

## 2. Bugs del Generador / adaptador encontrados

| Bug | Causa | Corrección |
|-----|-------|------------|
| Materialize falla en p02/p08/p09 con plantillas sample | `tpl.*` default `transitionId=t_aceptar` inexistente en servicio/uso/suscripción | `mapSampleToV12`: `transitionId` según dominante (`t_acordar` / `t_reservar` / `t_activar`…) |

**Ningún bug en la emisión de vistas/acciones/paneles del Generador** frente a este validador: las UiSpec actuales de concesionaria y de los 10 perfiles (tras resolver asks) pasan sin relajar reglas.

---

## 3. Resultado 10 perfiles + concesionaria

| Caso | Resultado | Vistas (aprox.) |
|------|----------|-----------------|
| Concesionaria (+ composition) | ✓ sellada | — |
| Concesionaria base | ✓ | — |
| p01…p10 (asks resueltos para materialize) | ✓ 10/10 | máx. **p10 = 31** vistas |

---

## 4. Rendimiento

Medido en `presentation/_uispec-validator-bench.json` (validación sola sobre la UiSpec más grande de los 10):

| Métrica | Valor |
|---------|-------|
| Perfil más grande | `p10-reformas` (**31** vistas) |
| `validateUiSpecReport` (sola) | **~6.6 ms** |
| Generación+sello (p10) | ~9–14 ms |

---

## 5. Reglas no implementables / parciales

| Regla deseada | Limitación |
|---------------|------------|
| Overlay editorial como blob en UiSpec | Los overlays se fusionan en generate; no hay campo top-level `overlays` que validar aparte |
| Coherencia a11y con DesignSystem | Sigue en `validateUiWithDesignSystem` (requiere DS); el gate estructural no lo sustituye |
| Filtro fila/ámbito runtime (`parteId`) | UiSpec no transporta filas; solo se validan campos declarados en forms/evidence vs roles |
| `COHERENCE_UNKNOWN_TRANSITION` redundante | Cubierto por `REF_ACTION_TRANSITION` |

---

## 6. Pruebas nuevas

- `tests/uispec-validator.test.ts` — 10 perfiles, mutaciones, render, persistencia, bench  
- `tests/quality/uispec-validator.properties.test.ts` — mutaciones aleatorias nunca aceptadas  

Suite: **273 passed**.

---

*Fin del informe.*
