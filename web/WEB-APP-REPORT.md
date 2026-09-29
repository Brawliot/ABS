# WEB-APP-REPORT — UiSpec → aplicación navegable

**Fecha:** 2026-09-28  
**Módulo:** `web/`  
**Decisión de producto:** web primero, responsive, preparada para PWA; sin apps nativas.

---

## 1. Stack elegido

| Capa | Elección | Por qué |
|------|----------|---------|
| Lenguaje | TypeScript del monorepo | Misma tipación que Generador / UiSpec |
| Servidor | `node:http` nativo | Cero dependencias nuevas; trivial de probar con `fetch` / Playwright |
| UI | SSR HTML desde `ValidatedUiSpec` + CSS por tokens | Renderizar sin pantallas a mano; poco peso (sin React/Vite) |
| Cliente | JS mínimo (SW + `clientRequestId` + loading) | Sesión rol/Parte sin SPA |
| Runtime | `SqliteEventStore` + Intérprete → Juez | Única vía de escritura |
| Diseño | `proposeDesignSystems` + tokens | Sin literales de color en CSS generado |
| PWA | `manifest.webmanifest` + `sw.js` stub | Base instalable |

---

## 2. Cómo arrancar

```bash
npm run web:list
npm run web -- --profile concesionaria
npm run web -- --profile p04-taller-mecanico --port 4173
```

Sesión de desarrollo: `?role=&parte=&group=&view=` (barra provisional).

Pipeline: `bootProfile` → compositor → `generateUiSpec` → `AppRuntime` (SQLite) → SSR.

---

## 3. Qué se renderiza (modo vivo)

- Navegación = `processGroups` filtrados por rol
- Filas = proyección de eventos (`projectRows`)
- Acciones = formularios POST `/action` (Intérprete → Juez)
- Flash de ok / error (Redactor) / bloqueo con enlace
- Banner de preguntas del compositor
- Responsive + tokens

Modo sin `liveRows`: botones **disabled** + «solo lectura» (compatibilidad tests de arranque).

---

## 4. Pendiente / límites

| Pieza | Estado |
|-------|--------|
| Recorridos wizard | Listados; sin wizard de pasos |
| Offline PWA | SW registra; sin precache |
| Cuentas reales | Sesión de desarrollo provisional |
| Algunas transiciones | Rechazadas por políticas/estado (ver E2E-REPORT) |

---

## 5. Pruebas

- `tests/web-app.test.ts` — arranque / visibilidad / health (sin editar)
- `tests/web-actions.test.ts` — acciones, idempotencia, flash
- `tests/e2e/smoke.playwright.test.ts` — humo navegador en CI

Informes: `web/LIVE-ACTIONS-REPORT.md`, `web/E2E-REPORT.md`.

---

*Fin WEB-APP-REPORT.*
