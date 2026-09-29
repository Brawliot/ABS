# LIVE-ACTIONS-REPORT — Intérprete → Juez desde la interfaz

**Fecha:** 2026-09-28  
**Alcance:** acciones UI reales + EventStore SQLite + Playwright CI

---

## Pipeline de escritura (única)

```
UI (POST /action) → Intérprete (interpret + IdempotencyLedger)
                 → Juez (attemptJudgedAdvance)
                 → SqliteEventStore.append
                 → proyección SSR (projectRows)
```

Ninguna otra ruta del servidor escribe eventos.

## UI

| Requisito | Implementación |
|-----------|----------------|
| Botones/formularios | `form.action-form` → POST `/action` (modo `live`) |
| Estado tras acción | Filas desde `runtime.projectRows()` (eventos), no estado cliente |
| Rechazos Juez | `resolveJudgeError` (Redactor) → flash `data-flash` |
| Bloqueos | `runtime.activeBlocks()` + enlace `data-block-link` al processGroup secundario |
| Idempotencia | `clientRequestId` + ledger + `store.getById`; UI `data-submitting` / «Enviando…» |
| Solo lectura | `renderAppHtml` sin `live`/`liveRows` (tests de arranque intactos) |

## Playwright

- Helpers: `tests/e2e/helpers.ts` (arranque por perfil, rol/Parte, capturas, axe, móvil)
- Humo: `tests/e2e/smoke.playwright.test.ts` (11 perfiles)
- CI: `npx playwright install --with-deps chromium` + `npm run test:unit` (incluye E2E)
- Informe: `web/E2E-REPORT.md` + `tmp/e2e/browser-suite-report.json`

## Persistencia

`tmp/web-runtime/{profile}.sqlite` (o path de prueba). Recargar / reiniciar servidor conserva eventos.

---

Ver también `web/E2E-REPORT.md` (tiempos, axe, transiciones no ejecutables) tras la suite.

### Resumen última suite navegador

- **Tiempo:** ~13 s (11 perfiles + helpers)
- **axe:** `aria-required-children` (tablist→navegación de vistas; corregido quitando `role=tablist`), `color-contrast` (barra de sesión provisional amarilla), `aria-allowed-role` (puntual en algunos perfiles)
- **Transiciones no ejecutables en humo:** ninguna (al menos una ok por perfil). Muchas transiciones fuera del estado inicial siguen rechazadas por el Juez con mensaje Redactor (p. ej. amortizar sin saldo, aceptar nueva versión fuera de renegociación).
