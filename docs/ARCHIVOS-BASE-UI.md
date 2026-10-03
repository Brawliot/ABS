# 📁 Archivos Base de UI (NO Generados)

**Total:** 74 archivos  
**Fecha:** 2026-10-03  
**Estado:** Documentación de arquitectura base

---

## 📊 Resumen

| Categoría | Cantidad | Descripción |
|-----------|----------|-------------|
| **Presentation Utils** | 28 | Utilidades de rendering y estado |
| **Web Pages & Handlers** | 46 | Páginas, handlers, rutas, APIs |
| **Templates HTML** | 2 | Archivos HTML estáticos |
| **TOTAL** | **74** | Todos NO se generan |

---

## 🎨 LAYER 1: Presentation (28 archivos)

Utilidades de interfaz que son infraestructura base, NO generada.

### Interactividad & Estado
```
• ab-testing.ts                    - A/B testing framework
• state-management.ts              - Estado global (Zustand-like)
• notifications.ts                 - Toast/notificación system
• modal-system.ts                  - Modal dialogs & focus trap
• form-validation.ts               - Async form validation
• advanced-forms.ts                - Componentes de formularios avanzados
```

### Performance & Rendering
```
• html-renderer.ts                 - [GENERADO] Renderiza UiSpec → HTML
• component-library.ts             - [GENERADO] 20+ componentes predefinidos
• adaptive-layout-engine.ts        - Motor de layouts adaptativos
• microinteraction-engine.ts       - Animaciones (ripple, fade, slide, etc)
• infinite-scroll.ts               - Virtual scrolling para 1000+ items
• lazy-loader.ts                   - Lazy loading de imágenes
• lighthouse-checker.ts            - Auditoría de performance
• performance-monitor.ts           - Core Web Vitals tracking
• design-performance.ts            - Performance de diseño
```

### Estilos & Temas
```
• css-critical.ts                  - Critical CSS extractor (<5KB inline)
• css-lazy.ts                      - CSS lazy loading con media print
• dark-mode.ts                     - Dark mode automático + toggle
• typography-engine.ts             - Motor de tipografía por industria
• brand-personalization.ts         - Personalización de marca
• token-exporter.ts                - Exportador de design tokens
```

### Seguridad & Accesibilidad
```
• uispec-validator.ts              - Validador con RBAC + seguridad
• accessibility-auditor.ts         - WCAG AAA compliance checker
• error-tracking.ts                - Error capture + retry logic
• analytics.ts                     - Event tracking & analytics
```

### Infraestructura PWA & Datos
```
• service-worker.ts                - PWA offline + sync + notifications
• personalization-engine.ts        - Personalización por usuario
• constraint-solver.ts             - Solucionador de restricciones
• bind-design.ts                   - Binding del design system
• preview.html                     - Página de preview HTML
```

### Otros Tipos
```
• types.ts                         - Tipos TypeScript base
• tokens.ts                        - Tokens de diseño
• patterns.ts                      - Patrones reutilizables
• etiquetas.ts                     - Localización/etiquetas
• resolve-tokens.ts                - Resolvedor de tokens
• validated.ts                     - Tipos validados
• index.ts                         - Index de exports
• uispec-schema.ts                 - Schema de UISpec
```

---

## 🌐 LAYER 2: Web (46 archivos)

Páginas, rutas, handlers y APIs que son base, NO generadas.

### Páginas Principales (11 archivos)
```
📄 inicio.ts                       - Hub dashboard centralizado
📄 hoy.ts                          - Dashboard de hoy (pendiente unificación)
📄 dashboard-estadisticas.ts       - Dashboard de estadísticas
📄 landing.ts                      - Página de landing
📄 portal.ts                       - Portal general
📄 portal-cliente.ts               - Portal del cliente
📄 contabilidad.ts                 - Sección de contabilidad
📄 dinero.ts                       - Gestión de dinero
📄 stock.ts                        - Gestión de stock
📄 expedientes.ts                  - Gestión de expedientes
📄 facturas.ts                     - Gestión de facturas
```

### Reportes (5 archivos)
```
📊 reportes.ts                     - Orquestador de reportes
📊 reportes-routes.ts              - Rutas de reportes
📊 reportes-activos.ts             - Reportes de activos
📊 reportes-contables.ts           - Reportes contables
📊 reportes-email.ts               - Reportes por email
```

### Secciones/Vistas (5 archivos)
```
🔹 secciones-hoy.ts                - Secciones de dashboard hoy
🔹 secciones-portal.ts             - Secciones del portal
🔹 secciones-crm.ts                - Secciones de CRM
🔹 secciones-stock.ts              - Secciones de stock
🔹 secciones-web.ts                - Secciones web
```

### Handlers & Routers (9 archivos)
```
⚙️ handlers/inicio-handler.ts      - Handler del hub inicio
⚙️ action-handler.ts               - Handler de acciones
⚙️ query-handler.ts                - Handler de queries
⚙️ api-procesos-handler.ts         - Handler de procesos API
⚙️ rrhh-handler.ts                 - Handler de RRHH
⚙️ vault-handler.ts                - Handler de vault/secretos
⚙️ auth-bridge.ts                  - Bridge de autenticación
⚙️ probar-ciclo.ts                 - Handler de prueba de ciclos
⚙️ diagnosis-page.ts               - Página de diagnóstico
```

### APIs & Servidores (8 archivos)
```
🌐 server.ts                       - Servidor principal HTTP
🌐 multi-tenant-server.ts          - Soporte multi-tenant
🌐 cli.ts                          - CLI interface
🌐 runtime.ts                      - Runtime del aplicativo
🌐 api-rest.ts                     - API REST base
🌐 api-v1-router.ts                - Router API v1
🌐 api-swagger.ts                  - Documentación Swagger
🌐 boot-profile.ts                 - Bootstrap de perfiles
```

### Utilidades Web (8 archivos)
```
🛠️ maestros.ts                     - Utilidades maestras
🛠️ visibility.ts                   - Control de visibilidad por rol
🛠️ css-from-tokens.ts              - Genera CSS desde tokens
🛠️ exportacion.ts                  - Sistema de exportación
🛠️ sample-data.ts                  - Datos de muestra
🛠️ salud-negocio.ts                - Health check del negocio
🛠️ index.ts                        - Index de exports
🛠️ types.ts                        - Tipos TypeScript
```

### Templates HTML (1 archivo)
```
📄 templates/inicio.html           - Template del hub inicio
```

### Otros RRHH (1 archivo)
```
👥 secciones-rrhh.ts               - Secciones de RRHH
```

---

## 📝 Categorización por Tipo

### **Handlers** (6 archivos)
Son funciones que manejan rutas HTTP específicas.
```
handlers/inicio-handler.ts
action-handler.ts
query-handler.ts
api-procesos-handler.ts
rrhh-handler.ts
vault-handler.ts
```

### **APIs & Servidores** (8 archivos)
Infraestructura de red y APIs.
```
server.ts
multi-tenant-server.ts
api-rest.ts
api-v1-router.ts
api-swagger.ts
cli.ts
boot-profile.ts
runtime.ts
```

### **Secciones** (5 archivos)
Agrupaciones de vistas por dominio.
```
secciones-hoy.ts
secciones-portal.ts
secciones-crm.ts
secciones-stock.ts
secciones-rrhh.ts
```

### **Reportes** (5 archivos)
Sistema de generación de reportes.
```
reportes.ts
reportes-routes.ts
reportes-activos.ts
reportes-contables.ts
reportes-email.ts
```

### **Portales** (3 archivos)
Interfaces específicas por tipo de usuario.
```
portal.ts
portal-cliente.ts
maestros.ts (gestión de maestros)
```

### **Templates HTML** (2 archivos)
Archivos HTML estáticos.
```
templates/inicio.html
presentation/preview.html
```

### **Utilities & Otros** (50 archivos)
El resto de utilidades de infraestructura.

---

## 🔄 Vs. Archivos GENERADOS

**Estos archivos NO se generan** (son base, parte de la plataforma):
- Todos los 74 listados arriba

**Estos archivos SÍ se generan** (del UiSpec):
```
✅ UISpec (especificación de interfaz)
✅ Componentes instanciados
✅ Vistas dinámicas
✅ Formularios generados
✅ Acciones derivadas
✅ Procesos navegables
```

**La diferencia:**
```
GENERADOS: 
  BusinessProfile → Compositor → Generador → UISpec
  UISpec → Renderer → Componentes + Vistas

NO GENERADOS:
  Infraestructura hardcodeada que INTERPRETA el UISpec
  y lo convierte en interfaz final
```

---

## 📐 Arquitectura de Capas

```
┌─────────────────────────────────────────┐
│  Generated UI                           │
│  (componentes, vistas, formularios)     │
│  ← Viene de UISpec                      │
└─────────────────────────────────────────┘
           ↑
           │ (interpreta y renderiza)
           │
┌─────────────────────────────────────────┐
│  Base UI Layer (46 archivos /web)       │
│  Handlers, APIs, Rutas, Páginas         │
└─────────────────────────────────────────┘
           ↑
           │ (utiliza)
           │
┌─────────────────────────────────────────┐
│  Presentation Utilities (28 archivos)   │
│  Rendering, State, Performance, PWA     │
└─────────────────────────────────────────┘
           ↑
           │ (depends on)
           │
┌─────────────────────────────────────────┐
│  Core Libraries                         │
│  React, TypeScript, CSS-in-JS, etc.     │
└─────────────────────────────────────────┘
```

---

## 📋 Checklist: ¿Qué Necesita Cada Nueva Página?

Si agregas una nueva página como `/inicio`, necesitas:

```
✅ Handler en /web (ej: handlers/nuevo-handler.ts)
✅ Ruta en server.ts o api router
✅ Template HTML en /web/templates/ (si es estática)
✅ Secciones/componentes en /web/secciones-*.ts
✅ Types en /web/types.ts
✅ Estilos CSS (usa presentation utils)
✅ Visibility logic en visibility.ts (si tiene RBAC)
✅ Tests (si es crítica)
```

No necesitas:
```
❌ Nuevos componentes (usa component-library.ts)
❌ Nuevas animaciones (usa microinteraction-engine.ts)
❌ Nuevo validador (usa uispec-validator.ts)
❌ Nuevo sistema de estado (usa state-management.ts)
```

---

## 🎯 Próximas Mejoras

Si quieres agregar nueva UI base:

### 1. **WebPage** (5-10 archivos)
```
web/pages/webpage-generator.ts
web/handlers/webpage-handler.ts
presentation/seo-engine.ts
web/secciones-web.ts (extender)
web/templates/landing.html
```

### 2. **GoogleBusiness** (3-5 archivos)
```
web/handlers/google-business-handler.ts
web/pages/google-business.ts
presentation/maps-integration.ts
web/secciones-web.ts (extender)
```

### 3. **Analytics Dashboard** (4-6 archivos)
```
web/pages/analytics.ts
web/handlers/analytics-handler.ts
web/secciones-analytics.ts
presentation/chart-engine.ts
web/api-analytics.ts
```

---

**Total UI base: 74 archivos**  
**Nuevos archivos/año (estimado): 15-20**  
**Mantenibilidad: ALTA** (estructura clara y modular)

