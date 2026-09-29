# Cuentas, seguridad web y RGPD — informe técnico

**Fecha:** 2026-09-28  
**Alcance:** Capa de identidad (quién es el usuario / a qué empresa pertenece). Permisos de negocio siguen en Juez + Filtro. Sin cambios en Capa 0 ni Capa 1 ni en pruebas existentes.

---

## Decisiones de seguridad

| Decisión | Motivo |
|----------|--------|
| Identidad solo desde sesión firmada (HMAC + cookie HttpOnly / SameSite / Secure en prod) | El navegador no puede imponer `roleId`, `parteId` ni `companyId` en producción |
| Selector DevSession imposible si `ABS_ENV=production` / `NODE_ENV=production`, aunque `ABS_ALLOW_DEV_SESSION=1` | Evita “modo debug” accidental en despliegue real |
| argon2id (`@noble/hashes`, sin binario nativo) | Hash portable y resistente a GPU |
| CSRF synchronizer token en sesión + campo/header | Todas las mutaciones con sesión auth exigen CSRF |
| Rate limit en login / invitaciones / reset | Mitiga fuerza bruta y abuso de correo |
| CSP estricta + HSTS (prod) + nosniff + frame-ancestors none | Endurecimiento HTTP; en no-prod `script-src` admite `'unsafe-inline'` para axe/E2E existentes |
| PII de Parte fuera del EventStore (`ParteIdentityStore`) | Supresión RGPD sin mutar historial ni replay |
| Logs de seguridad con huella de email, sin secretos | Cumple registro + evita filtrar claves |
| Secretos solo por env (`ABS_SESSION_SECRET`, `OPENAI_API_KEY`, SMTP, DB) | Nunca en código |
| `npm run audit:deps` en CI | Auditoría de dependencias en cada push |
| En desarrollo, form/query DevSession se tolera | No romper la suite Playwright existente |

---

## Qué se entregó

### Parte 1 — Cuentas (`accounts/`, `auth/`, `web/auth-bridge.ts`)
- Correo + contraseña (argon2id), magic link, 2FA TOTP opcional (exigible al dueño), recuperación de contraseña con rotación de sesiones.
- Sesiones: cookies firmadas, idle timeout, logout / logout-all, rotación de familia al cambiar de empresa.
- Invitaciones por el dueño (rol / sede / equipo / Parte); baja → `revokeMembership` + `revokeAllForAccount` inmediato.
- Portal cliente: membresía `portal_cliente` con `parteId`.
- Multiempresa: membresías múltiples; `POST /auth/switch-company` fija una empresa activa por petición.

### Parte 2 — Seguridad web
- CSRF en `/action` y mutaciones auth/GDPR.
- Cabeceras en todas las respuestas.
- Validación de alcance: `readAuthSession` comprueba cuenta activa + membresía de la empresa de la sesión.
- Rutas: `/auth/login|logout|magic*|reset*|invite*|revoke|switch-company`, `/login`, `/gdpr/*`.

### Parte 3 — RGPD (`gdpr/`)
- Export / rectify / erase vía `ParteIdentityStore`.
- Retención configurable (`DEFAULT_RETENTION`, facturas con legalHold).
- Registro de terceros (LLM + correo) alineado con LLM-INFRA.
- RAT borrador automático, procedimiento de brecha + detección básica, checklist alojamiento UE.
- Política de privacidad y DPA marcados **PENDIENTE DE REVISIÓN POR ABOGADO**.

### Pruebas nuevas (no editan las existentes)
- `tests/accounts.auth.test.ts`
- `tests/gdpr.rights.test.ts`
- `tests/e2e/auth.login.playwright.test.ts` — login real para los perfiles bootables (10 samples + concesionaria + marketplace)

---

## Riesgos pendientes (por gravedad)

### Alta
1. **Correo real no cableado:** magic link / invitaciones / reset exponen el token solo en modo desarrollo; en producción hace falta SMTP/API y plantillas.
2. **Sesiones en memoria:** reinicio del proceso invalida sesiones; falta almacén persistente (Redis/SQLite) para HA.
3. **Vulnerabilidades npm conocidas:** `npm audit` puede reportar moderadas en la cadena transitive — revisar y pinnear.

### Media
4. **CSP con `style-src 'unsafe-inline'`:** necesario por CSS inyectado del DesignSystem; endurecer con nonces a medio plazo.
5. **2FA del dueño:** la política “obligatorio si lo configura” está modelada (`requireTotp`); falta UI de enrolamiento y recuperación de códigos de respaldo.
6. **Aislamiento multi-tenant del EventStore:** la identidad de cuenta está aislada; el runtime de un solo perfil no mezcla tenants — el servidor multi-tenant existente debe usar la misma sesión auth (pendiente de unificar del todo).

### Baja
7. **Detección de brechas:** umbrales heurísticos simples; no sustituye SIEM.
8. **argon2id costoso en CI:** aceptable; si ralentiza seeds masivos, bajar memoria solo en `ABS_ENV=test` (decisión del usuario).

---

## Requiere revisión legal (abogado)

- Política de privacidad y contrato de encargado (`/gdpr/legal-drafts`).
- RAT generado automáticamente.
- Bases de legitimación para LLM y correo; transferencias fuera del EEA (SCC).
- Plazos de retención de facturas / obligaciones mercantiles.
- Criterio de notificación de brechas (72 h / comunicación a afectados).
- Checklist de alojamiento UE (adecuación / SCC con proveedores).

---

## Requiere decisión del usuario

1. Proveedor de correo y plantillas (idioma, marca).
2. Región cloud UE concreta y política de backups.
3. ¿2FA obligatorio para todos los dueños por defecto?
4. ¿Almacén de sesiones compartido (Redis) vs SQLite en el mismo nodo?
5. Valor de `ABS_SESSION_SECRET` y rotación operativa.
6. ¿Activar auth por defecto también en desarrollo (`enableAuth`) o solo en producción?
7. ¿Unificar multi-tenant server con el mismo puente auth ahora o en un hito siguiente?

---

## Cómo activar en producción

```bash
export ABS_ENV=production
export ABS_SESSION_SECRET='…≥16 chars…'
# opcional: ABS_SESSION_IDLE_MS, DATABASE_URL, SMTP, OPENAI_API_KEY
npx tsx web/cli.ts <perfil>
```

Sin sesión válida, `/` redirige a `/login`. El selector de rol no se renderiza.
