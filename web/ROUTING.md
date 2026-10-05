# Arquitectura de Routing en ABS

## Visión general

El servidor web de ABS ha sido refactorizado para seguir un **patrón modular de routing** donde cada dominio de negocio tiene responsabilidades claras y separadas.

### Antes vs Después

**ANTES:**
```
server.ts (1517 líneas)
├─ HTTP helpers inline
├─ Auth logic inline  
├─ GDPR logic inline
├─ API endpoints inline
├─ Business logic inline
└─ Decision screen HTML inline
```

**DESPUÉS:**
```
Módulos especializados (6 archivos)
├─ http-utils.ts       (131 líneas) → HTTP helpers reutilizables
├─ auth-routes.ts      (240 líneas) → 10 rutas de autenticación
├─ gdpr-routes.ts      (126 líneas) → 5 rutas de privacidad/GDPR
├─ api-routes.ts       (65 líneas)  → 2 rutas de API (wizard)
├─ business-routes.ts  (260 líneas) → 6 rutas de negocio principal
└─ decision-screen.ts  (314 líneas) → Página HTML del wizard

server.ts (~800 líneas) → Orquestador limpio
```

## Módulos

### `http-utils.ts` — Utilidades HTTP Core

**Propósito:** Funciones reutilizables para peticiones/respuestas HTTP.

**Exporta:**
- `parseQuery(url)` — Extrae parámetros de query string
- `send()` — Envía respuesta con headers de seguridad
- `readBody()` — Lee cuerpo de petición
- `formToRecord()` — Convierte form-encoded a objeto
- `sendJson()` — Envía respuesta JSON
- `sendError()` — Envía error JSON estándar
- `sendHtml()` — Envía respuesta HTML
- `sendText()` — Envía plain text

**Dependencias:** Solo Node.js + seguridad

---

### `auth-routes.ts` — Rutas de Autenticación

**Propósito:** Gestionar autenticación, sesiones y permisos.

**Rutas:**
- `POST /auth/login` — Autenticación email/contraseña
- `POST /auth/logout` — Cierre de sesión
- `POST /auth/magic-request` — Solicitar magic link
- `GET /auth/magic` — Login con token mágico
- `POST /auth/reset-request` — Solicitar reset contraseña
- `POST /auth/reset` — Completar reset
- `POST /auth/invite` — Invitar empleado
- `POST /auth/invite/accept` — Aceptar invitación
- `POST /auth/revoke` — Revocar acceso
- `POST /auth/switch-company` — Cambiar empresa activa

**Exporta:** `handleAuthRoute(path, method, req, res, ctx, url)`

**Dependencias:** auth-bridge.js, http-utils.ts

---

### `gdpr-routes.ts` — Rutas de GDPR/Privacidad

**Propósito:** Gestionar derechos de privacidad y exportación de datos personales.

**Rutas:**
- `GET /gdpr/export` — Exportar datos personales
- `POST /gdpr/erase` — Borrar datos (Right to be forgotten)
- `POST /gdpr/rectify` — Rectificar datos personales
- `GET /gdpr/rat` — Registro de análisis de transferencias
- `GET /gdpr/legal-drafts` — Borradores legales

**Exporta:** `handleGdprRoute(path, method, req, res, ctx)`

**Dependencias:** gdpr/index.js, auth-bridge.js, http-utils.ts

---

### `api-routes.ts` — Rutas de API

**Propósito:** Endpoints de API para integración externa.

**Rutas:**
- `GET /api/wizard/draft` — Obtener borrador del wizard
- `POST /api/wizard/decision` — Aplicar decisiones del wizard

**Exporta:** `handleApiRoute(path, method, req, res, ctx)`

**Dependencias:** cli.js, http-utils.ts

**Nota:** Preparado para agregar `/api/v1/*` y `/api/procesos/*` en el futuro.

---

### `business-routes.ts` — Rutas de Negocio Principal

**Propósito:** Lógica de negocio central: acciones, diagnóstico, dashboard.

**Rutas:**
- `GET /wizard/decision` — Página HTML del wizard decision screen
- `GET/POST /diagnosis` — Diagnóstico del sistema
- `POST /link-devolucion` — Crear devoluciones vinculadas
- `POST /action` — **RUTA CRÍTICA**: Ejecutar acciones en el sistema
- `GET /inicio` — Dashboard/Hub principal
- `GET /login` — Página de login HTML

**Exporta:** `handleBusinessRoute(path, method, req, res, ctx, url)`

**Dependencias:** 
- action-handler.js (executeUiAction)
- diagnosis-page.js (diagnosis logic)
- decision-screen.ts (HTML template)
- auth-bridge.js (identity resolution)
- http-utils.ts

---

### `decision-screen.ts` — Página del Decision Screen

**Propósito:** HTML + JavaScript para el wizard decision screen.

**Exporta:** `renderDecisionScreenHtml(draftJson)`

**Características:**
- Selector de módulos
- Preview de diseño (colores, tipografía)
- Configuración de país/idioma
- Submit hacia `/api/wizard/decision`

---

### `server.ts` — Orquestador Principal

**Responsabilidades:**
1. Crear servidor HTTP
2. Routear peticiones a módulos especializados
3. Servir assets estáticos (manifest, service worker)
4. Renderizar página principal (/) con app
5. Gestionar handlers de maestros/expedientes (delegados a sus propios módulos)

**Flujo de routing:**
```
Petición HTTP
    ↓
parseQuery() → extraer parámetros
    ↓
¿Comienza con /api/? → handleApiRoute() → API
¿Comienza con /auth/? → handleAuthRoute() → Auth
¿Comienza con /gdpr/? → handleGdprRoute() → GDPR
¿Comienza con /wizard, /diagnosis, ...? → handleBusinessRoute() → Business
¿isMaestrosPath? → handleMaestros() → Maestros
¿isExpedientesPath? → handleExpedientes() → Expedientes
...
¿/ o /index.html? → Renderizar app principal
    ↓
Respuesta HTTP
```

---

## Patrones y Convenciones

### Firma de handler

```typescript
export async function handleXyzRoute(
  path: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  ctx: XyzRouteContext,
  url?: string,
): Promise<boolean>
```

**Retorna:**
- `true` — Ruta fue manejada, no continuar
- `false` — No es una ruta de este módulo, continuar

### Context interface

Cada módulo define su propio `*RouteContext` con lo que necesita:

```typescript
export interface AuthRouteContext {
  auth: AuthRuntime | undefined;
  boot: { profileId: string };
}
```

### Helper de respuesta

Usar helpers de http-utils.ts:
```typescript
return sendJson(res, 200, { ok: true }), true;
return sendError(res, 401, "No autorizado"), true;
return sendHtml(res, 200, html), true;
return sendText(res, 403, "Prohibido"), true;
```

---

## Testing

Cada módulo tiene un archivo `.test.ts` correspondiente:

```bash
npm run test:unit  # Ejecutar tests
npm run test       # Tests + typecheck
```

**Ejemplos:**
- `http-utils.test.ts` — Tests de parseQuery, formToRecord
- `auth-routes.test.ts` — Tests de handlers de auth (próximamente)
- `business-routes.test.ts` — Tests de handlers de negocio (próximamente)

---

## Próximos pasos

### Phase 1: Consolidación ✅
- [x] Extraer http-utils
- [x] Extraer auth-routes
- [x] Extraer gdpr-routes
- [x] Extraer api-routes
- [x] Extraer business-routes
- [x] Extraer decision-screen
- [x] Tests básicos para http-utils

### Phase 2: Expansión
- [ ] Tests para auth-routes
- [ ] Tests para business-routes
- [ ] Consolidar maestros/expedientes con mismo patrón
- [ ] Extraer handlers de dinero, facturas, stock
- [ ] Agregar `/api/v1/*` endpoints

### Phase 3: Documentación
- [ ] Guía de agregar nuevas rutas
- [ ] Troubleshooting de errores comunes
- [ ] Performance tuning guide

---

## Troubleshooting

### "No es una ruta válida"
1. Verificar que el handler retorna `true` si maneja la ruta
2. Verificar el orden de evaluación en server.ts (más específicas primero)
3. Verificar que path y method matchean correctamente

### "CORS error"
- Los headers se manejan en http-utils.ts `send()`
- Verificar que `securityHeaders()` no está bloqueando

### "Auth falla pero no debería"
- Verificar que `resolveRequestIdentity()` se llama en server.ts
- Verificar `readAuthSession()` en auth-routes.ts
- Verificar tokens de CSRF

---

## Referencias

- **server.ts:803-809** — Routing por prefijo de path
- **http-utils.ts** — Funciones HTTP core
- **auth-routes.ts:1-50** — Patrón de handler
- **business-routes.ts** — Ejemplo complejo con múltiples rutas
