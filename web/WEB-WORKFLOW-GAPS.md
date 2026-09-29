# WEB-WORKFLOW-GAPS — Lo que falta para alcanzar 90% de los negocios

**Fecha:** 2026-09-29  
**Módulo:** `web/` (Web Workflow)  
**Objetivo:** Identificar componentes, servicios e integraciones necesarias para una plataforma de producción lista para empresas reales.

---

## 📋 Resumen Ejecutivo

El Web Workflow actual es un **MVP funcional** con:
- ✅ Renderizado SSR desde UiSpec
- ✅ Intérprete → Juez integrados
- ✅ Persistencia SQLite
- ✅ Sesión provisional para desarrollo

**Falta completar 10 áreas críticas** para llegar a producción y alcanzar 90% de los negocios.

---

## 🔴 1. CUENTAS Y SUBSCRIPCIONES DE PRODUCCIÓN (CRÍTICO)

### ¿Qué es?
Sistema de registro, autenticación, y gestión de planes de pago para empresas reales.

### ¿Para qué sirve?
- Empresas pueden crear cuenta propia (no sesión provisional)
- Elegir plan (Starter $49/mes, Pro $99/mes, Enterprise custom)
- Pagar con tarjeta/transferencia
- Limitar features según plan
- Gestionar múltiples usuarios por cuenta

### Hoy falta:
```
├─ Sign-up / Login real (OAuth Google/Microsoft, email+password)
├─ Sistema de planes y límites por plan
│   ├─ Starter: 1 usuario, 1000 transacciones/mes
│   ├─ Pro: 10 usuarios, 100k transacciones/mes
│   └─ Enterprise: sin límites
├─ Integración con Stripe/MercadoPago para pagos
├─ Provisioning automático de tenants en BD producción
├─ Auto-upgrade/downgrade de planes
├─ Gestión de suspensiones por falta de pago
└─ Trial de 14 días
```

### Impacto en negocio
Sin esto: **No hay modelo de ingresos. El sistema es un juguete.**

---

## 📧 2. NOTIFICACIONES MULTI-CANAL (MUY IMPORTANTE)

### ¿Qué es?
Sistema para comunicar eventos importantes al usuario por email, SMS, push, Slack, etc.

### ¿Para qué sirve?
- Usuario no necesita estar en la plataforma para enterarse
- Aprobaciones urgentes llegan por SMS/Telegram
- Confirmaciones de transacciones por email
- Recordatorios de compromisos vencidos
- Alertas de errores críticos

### Hoy falta:
```
├─ Email transaccional
│   ├─ Motor de templates (Handlebars/EJS)
│   ├─ Proveedor: SendGrid, Mailgun, o AWS SES
│   ├─ Templates para: confirmación, error, aprobación, vencimiento
│   └─ Tracking de abiertos/clicks
├─ SMS/Telegram para alertas urgentes
├─ Push notifications en navegador
├─ Historial de notificaciones en app
├─ Panel de preferencias: qué alertas recibir y por dónde
├─ Rate limiting para no spamear
└─ Retry automático si falla envío
```

### Impacto en negocio
Sin esto: **Los usuarios no se enteran de nada. Las aprobaciones demoran días.**

---

## 📊 3. REPORTES Y DASHBOARDS (IMPORTANTE)

### ¿Qué es?
Visualización de datos de negocio: KPIs, tendencias, históricos.

### ¿Para qué sirve?
- Dueño ve: "hice 45 transacciones por $3,500 este mes"
- Detectar caídas en ventas o cuellos de botella
- Cumplimiento vs. políticas (% transacciones aprobadas)
- Exportar a Excel para contador/banco
- Auditoría histórica

### Hoy falta:
```
├─ Dashboard principal
│   ├─ KPI cards: transacciones (contador, $), tasa aprobación
│   ├─ Gráfico de línea: transacciones por día (últimos 30 días)
│   └─ Estado de compromisos: en plazo, en riesgo, vencidos
├─ Reportes por período (diario/semanal/mensual/trimestral)
├─ Filtros: por rol, parte, estado, rango de fechas
├─ Análisis de cumplimiento
│   ├─ % transacciones rechazadas por política
│   ├─ Motivos top de rechazo
│   └─ Compromisos vencidos
├─ Exportación: PDF, Excel, CSV
├─ Gráficos: barras, líneas, pie, mapa de calor
├─ Drilldown: click en dato → detalle de transacciones
└─ Programación: enviar reporte por email cada lunes
```

### Impacto en negocio
Sin esto: **No hay visibilidad. No sé si le va bien o mal al negocio.**

---

## 🗄️ 4. BASE DE DATOS DE PRODUCCIÓN (CRÍTICO)

### ¿Qué es?
Base de datos robusta, escalable y segura (no SQLite local).

### ¿Para qué sirve?
- Guardar datos de empresas reales sin perder nada
- Soportar millones de transacciones sin ralentarse
- Backup automático en caso de desastre
- Multi-tenant seguro (datos de una empresa no se ven en otra)
- Performance consistente

### Hoy falta:
```
├─ Migrar de SQLite a PostgreSQL (o MySQL)
│   ├─ Schema versionado (Flyway/Liquibase)
│   ├─ Índices para queries lentas
│   └─ Particionamiento por tenant/fecha para escalabilidad
├─ Clustering y replicación
│   ├─ Master-Slave (o Patroni para HA)
│   ├─ Failover automático si cae master
│   └─ Read replicas para reportes pesados
├─ Backups automáticos
│   ├─ Diarios en S3/Google Cloud
│   ├─ Point-in-time recovery (últimos 30 días)
│   └─ Testing mensual de restore
├─ Cifrado en reposo (TDE / AWS KMS)
├─ Connection pooling (PgBouncer, pgpool)
├─ Monitoreo: latencia, tamaño, queries lentas
└─ Disaster recovery: RTO < 1h, RPO < 5min
```

### Impacto en negocio
Sin esto: **Una caída = pérdida total de datos. Nadie confiaría con dinero.**

---

## 🔌 5. API REST/GRAPHQL PARA INTEGRACIONES (IMPORTANTE)

### ¿Qué es?
Endpoints para que sistemas externos (ERP, CRM, contabilidad) hablen con ABS.

### ¿Para qué sirve?
- Contador conecta Odoo → transacciones auto-contabilizadas
- Salesforce sabe cuándo se aprobó una venta
- E-commerce lanza transacción en ABS automáticamente
- Banco conecta para reconciliación
- Terceros pueden construir apps en top de ABS

### Hoy falta:
```
├─ REST API documentada (OpenAPI 3.0 / Swagger UI)
│   ├─ Autenticación: JWT token con role/permiso
│   ├─ Endpoints:
│   │   ├─ POST /transactions (crear)
│   │   ├─ GET /transactions/{id} (leer)
│   │   ├─ GET /transactions (listar filtrados)
│   │   ├─ POST /transitions (ejecutar transición)
│   │   ├─ GET /actor-directory (usuarios/roles)
│   │   └─ GET /reports/{type} (reportes)
│   ├─ Paginación (limit, offset, cursor)
│   ├─ Filtros avanzados (fecha, estado, actor)
│   └─ Rate limiting (100 req/min por token)
├─ Webhooks salientes
│   ├─ POST a URL del cliente cuando evento ocurre
│   ├─ Retry automático con backoff exponencial
│   ├─ Signature HMAC para validación
│   ├─ Dead letter queue si falla tras 5 intentos
│   └─ UI para subscribirse a eventos
├─ Batch API: procesar 100+ transacciones en 1 request
├─ Versionado: /v1/, /v2/ (nunca breaking changes sin aviso)
└─ SDK cliente (TypeScript, Python, PHP)
```

### Impacto en negocio
Sin esto: **ABS es un silo. No habla con otros sistemas.**

---

## 📱 6. PWA MADURA + MOBILE (IMPORTANTE)

### ¿Qué es?
Progressive Web App y/o app nativa para iOS/Android.

### ¿Para qué sirve?
- Funciona offline (sin internet)
- Se instala en home screen
- Acceso rápido desde móvil
- Sincronización cuando vuelve cobertura
- Mejor UX que responsive web

### Hoy falta:
```
├─ PWA Offline-first
│   ├─ Service Worker mejorado
│   │   ├─ Precache de assets críticos (HTML, CSS, JS)
│   │   ├─ Cache-first para assets estáticos
│   │   └─ Network-first para datos dinámicos
│   ├─ IndexedDB para guardar eventos/transacciones locales
│   ├─ Sincronización background
│   │   ├─ Background Sync API (W3C)
│   │   ├─ Retry si falla al reconectar
│   │   └─ Conflicto resolution (qué pasa si cambió en servidor)
│   ├─ Web App Manifest mejorado
│   │   ├─ Iconos en múltiples tamaños
│   │   ├─ Splash screen personalizada
│   │   └─ Tema por empresa
│   └─ App shell architecture (carga rápido, luego contenido)
├─ O: App nativa (React Native / Flutter)
│   ├─ iOS y Android en 1 codebase
│   ├─ Biométrico (Face ID, huella)
│   ├─ Acceso a cámara para escanear documentos
│   └─ Notificaciones push nativas
└─ Fallback a web si app falla
```

### Impacto en negocio
Sin esto: **Usuario en la obra sin cobertura = sin poder trabajar.**

---

## 🔐 7. SEGURIDAD Y COMPLIANCE EN PRODUCCIÓN (CRÍTICO)

### ¿Qué es?
Medidas de seguridad, encriptación, auditoría y cumplimiento legal.

### ¿Para qué sirve?
- Datos del usuario no se filtran
- Regulador (AEAT, Banco de España) puede auditar
- Usuario duerme tranquilo
- Pasamos pen test de clientes empresariales
- Cumplimiento GDPR, PSD2, ISO 27001

### Hoy falta:
```
├─ Autenticación fuerte
│   ├─ 2FA obligatorio para roles críticos (auditor, aprobador)
│   ├─ TOTP (Google Authenticator, Authy)
│   ├─ WebAuthn/FIDO2 para seguridad máxima
│   └─ Sesión con timeout automático (15 min)
├─ Encriptación
│   ├─ HTTPS/TLS 1.3 (mTLS si B2B)
│   ├─ AES-256 para datos PII en BD
│   │   ├─ Nombres, direcciones, NIFs
│   │   └─ Números de cuenta/tarjeta
│   └─ Key rotation automática (cada 90 días)
├─ Auditoría completa
│   ├─ Quién? Actor que hizo la acción
│   ├─ Cuándo? Timestamp preciso
│   ├─ Qué? Transición exacta + datos antes/después
│   ├─ De dónde? IP y User-Agent
│   ├─ Resultado? Aceptado/rechazado
│   └─ Almacenamiento: inmutable, 7 años (legal)
├─ Compliance GDPR
│   ├─ Derecho al olvido: anonimizar datos de una Parte
│   ├─ Portabilidad: exportar datos en JSON/CSV
│   ├─ Consentimiento explícito para tratamiento
│   └─ Privacy policy + terms of service
├─ DLP (Data Loss Prevention)
│   ├─ No loguear PII (NIF, email, teléfono)
│   ├─ Alertar si se detecta en logs
│   └─ Mask en UI si no tienes permiso
├─ Secrets management
│   ├─ Env vars en HashiCorp Vault, no en código
│   ├─ Rotación automática de API keys
│   └─ Auditoría de acceso a secrets
├─ OWASP Top 10
│   ├─ Inyección SQL (prepared statements)
│   ├─ Broken auth (ver arriba)
│   ├─ Sensitive data exposure (encriptación)
│   ├─ XXE / XSS / CSRF / Deserialization
│   ├─ Broken access control (Filtro + Judge)
│   └─ API con autenticación y validación
├─ Pen testing
│   ├─ Anual por tercero independiente
│   ├─ Reporte de vulnerabilidades
│   └─ Remediation tracking
└─ Certificaciones (si mercado lo exige)
    ├─ SOC2 Type II
    ├─ ISO 27001
    └─ PCI-DSS (si tocamos tarjetas)
```

### Impacto en negocio
Sin esto: **Multa GDPR de €20M. Pérdida de clientes. Cierre de empresa.**

---

## ⚙️ 8. BATCH Y AUTOMATIZACIONES SIN INTERVENCIÓN (IMPORTANTE)

### ¿Qué es?
Procesos que se ejecutan sin que el usuario haga clic en nada.

### ¿Para qué sirve?
- Recordatorio automático de compromisos que vencen mañana
- Factura auto-generada el 5 de cada mes
- Escalada automática de aprobación si demora
- Cierre de mes automático
- Reporte enviado cada lunes a las 8am

### Hoy falta:
```
├─ Job scheduler
│   ├─ Cron-based (quartz, node-cron, APScheduler)
│   ├─ Expresiones: "0 8 * * 1" (lunes 8am)
│   ├─ Timezone aware
│   └─ Retry automático si falla
├─ Trigger-based automatizaciones
│   ├─ Evento = transición → ejecutar acción
│   ├─ Ejemplo: "Si transición a 'aceptada' → enviar email"
│   ├─ Múltiples triggers por regla
│   └─ Condiciones: "si monto > 1000 → aprobar directamente"
├─ Webhooks entrantes
│   ├─ POST desde sistema externo → crear transición en ABS
│   ├─ Signature HMAC para seguridad
│   ├─ Validación de datos
│   └─ Error handling y retry
├─ Dead letter queue
│   ├─ Job falló 3 veces → guardar para revisión manual
│   ├─ UI para reintentarlo
│   └─ Alertar a admin
├─ Monitoreo
│   ├─ Dashboard de jobs: próximas ejecuciones
│   ├─ Alertar si job falló
│   ├─ Historial de ejecuciones
│   └─ Logs detallados
└─ Escalabilidad
    ├─ Múltiples workers si hay muchos jobs
    ├─ Distribución: job en worker A, no B
    └─ No hacer jobs en request (async)
```

### Impacto en negocio
Sin esto: **El negocio requiere personas haciendo tareas repetitivas. Costo + errores.**

---

## 🚀 9. PERFORMANCE Y ESCALABILIDAD (IMPORTANTE)

### ¿Qué es?
Sistema que soporta miles de usuarios simultáneos sin ralentarse.

### ¿Para qué sirve?
- Black Friday: 10,000 usuarios online → sistema aguanta
- Reportes pesados no bloquean usuarios normales
- Respuesta en <200ms incluso con carga
- Reducir costos de infraestructura

### Hoy falta:
```
├─ Caché distribuido
│   ├─ Redis para: sesiones, rules compiladas, hechos
│   ├─ TTL configurable por tipo de dato
│   ├─ Invalidación inteligente (cuando cambia RuleSet)
│   └─ Replicación: Master-Slave para HA
├─ CDN para assets
│   ├─ Cloudflare, Akamai, o Bunny
│   ├─ CSS/JS/fonts cacheados globalmente
│   ├─ Compression: gzip/brotli
│   └─ Early hints para pre-cargar
├─ Clustering de servidores
│   ├─ Load balancer (nginx, HAProxy, AWS ALB)
│   ├─ Sticky sessions (usuario siempre al mismo servidor)
│   ├─ Auto-scaling: agregar servers si CPU > 70%
│   └─ Health checks: descartar servers caídos
├─ Database optimization
│   ├─ Índices: on (tenantId, state, createdAt)
│   ├─ Connection pooling: máx 20 conexiones
│   ├─ Query analysis: qué queries son lentas
│   ├─ Particionamiento: por tenant, por fecha
│   └─ Read replicas para reportes
├─ Optimización de assets
│   ├─ Minificación: CSS, JS
│   ├─ Code splitting: cargar solo lo necesario
│   ├─ Image optimization: WebP, lazy load
│   └─ Bundle size: <100KB inicial
├─ APM (Application Performance Monitoring)
│   ├─ Datadog, New Relic, o Sentry
│   ├─ Ver dónde se gasta tiempo
│   ├─ Alertas: si response time > 500ms
│   └─ Traces distribuidas (request cruza múltiples servicios)
└─ Rate limiting
    ├─ Por token/usuario: 100 req/min
    ├─ Por IP: 1000 req/min
    └─ Escalada de precios si excede
```

### Impacto en negocio
Sin esto: **Black Friday = caída. Clientes migrarse. Pérdida de millones.**

---

## 🔗 10. INTEGRACIONES COMUNES (DIFERENCIADOR)

### ¿Qué es?
Conectores pre-built con ERPs, CRMs, contabilidad, pagos.

### ¿Para qué sirve?
- "Conecta tu Odoo en 2 clics"
- Datos no se duplican entre sistemas
- Workflow completo: ABS → Odoo → Salesforce → PayPal
- Reduce trabajo manual

### Hoy falta:
```
├─ Contabilidad (TOP 3)
│   ├─ Odoo: sync transacciones → asientos contables
│   ├─ SAP: asientos con centro de costo
│   └─ Sage: reconciliación automática
├─ CRM
│   ├─ Salesforce: Opportunity → transacción en ABS
│   ├─ HubSpot: Deal → transacción
│   └─ Pipedrive: timeline de ABS en CRM
├─ Pagos
│   ├─ Stripe: cobrar comisión automáticamente
│   ├─ PayPal: reconciliar pagos
│   └─ Redsys: integración ES específica
├─ Documentos
│   ├─ Dropbox: adjuntar y guardar evidencias
│   ├─ Google Drive: compartir reportes
│   └─ OneDrive: para usuarios Microsoft
├─ Comunicación
│   ├─ Slack: alertas a #transacciones
│   ├─ Teams: notificaciones
│   └─ Email: SendGrid, Mailgun
├─ Productividad
│   ├─ Google Workspace: auth + usuarios
│   ├─ Microsoft 365: lo mismo
│   └─ Calendario: eventos vs. vencimientos
└─ Analytics
    ├─ Google Analytics: User journey
    └─ Mixpanel: eventos de negocio
```

### Impacto en negocio
Sin esto: **Venta más lenta. Usuario ve competidor integrado con Odoo y compra allá.**

---

## 📅 PLAN DE IMPLEMENTACIÓN (FASE 1 → 90% NEGOCIOS)

### FASE 1: MVP de Producción (30 días)
Prioridad: **Críticos solamente**

```
Semana 1-2:
  ├─ Cuentas reales (sign-up + login OAuth)
  ├─ Stripe integration (pagos)
  ├─ PostgreSQL migration (BD)
  └─ JWT authentication (API REST básica)

Semana 3:
  ├─ Email transaccional (SendGrid)
  ├─ Rate limiting
  └─ Audit log básico

Semana 4:
  ├─ Testing de stress
  ├─ Pen test quick
  └─ Launch beta con 10 empresas
```

### FASE 2: Completar MVP (30 días)
Prioridad: **Muy importante + Importante**

```
Semana 5-6:
  ├─ Dashboard KPI principal
  ├─ Reportes básicos (PDF, Excel)
  ├─ 2FA obligatorio para aprobadores
  └─ Backup automático

Semana 7:
  ├─ PWA precache
  ├─ Webhooks salientes
  └─ API REST completa

Semana 8:
  ├─ Performance optimization
  ├─ CDN setup
  └─ Scaling a 1000 usuarios
```

### FASE 3: Diferenciadores (60 días)
Prioridad: **Diferenciadores**

```
Mes 3:
  ├─ Batch jobs + scheduler
  ├─ Integraciones TOP 3 (Odoo, Salesforce, Stripe)
  ├─ Mobile app nativa (React Native)
  ├─ Advanced analytics
  └─ SOC2 certification
```

---

## 🎯 SUCCESS CRITERIA: "90% de Negocios"

Un negocio típico necesita:

| Requisito | Fase 1 | Fase 2 | Fase 3 |
|-----------|--------|--------|--------|
| Crear cuenta propia | ✅ | ✅ | ✅ |
| Pagar por suscripción | ✅ | ✅ | ✅ |
| Notificación cuando pasa algo | ✅ | ✅ | ✅ |
| Ver KPI del negocio | ✅ | ✅ | ✅ |
| Datos seguros | ✅ | ✅ | ✅ |
| Acceso desde móvil | ✅ | ✅ | ✅ |
| Integración con ERP | ❌ | ✅ | ✅ |
| Reportes complejos | ❌ | ✅ | ✅ |
| Automatizaciones | ❌ | ✅ | ✅ |
| App nativa | ❌ | ❌ | ✅ |

**Fase 1 + 2 = 90% de funcionalidad requerida.**

---

## 📝 NEXT STEPS

1. **Validar con clientes piloto:** ¿Cuál de estos 10 es bloqueante para TI?
2. **Priorizar:** Feedback puede cambiar orden
3. **Asignar recursos:** 1-2 personas por área para Fase 1
4. **Setup CI/CD:** Automated testing antes de implementar
5. **Documentación:** Cada feature con docs para usuario y API

---

*Documento generado: 2026-09-29*  
*Versión: 1.0*
