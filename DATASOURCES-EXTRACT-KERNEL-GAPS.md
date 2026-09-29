# DATASOURCES-EXTRACT-KERNEL-GAPS — Capas de entrada de datos

**Fecha:** 2026-09-29  
**Módulos:** `facts/`, `contracts/`, `interpreter/`, `learning/`, `adapters/`  
**Objetivo:** Identificar qué falta en las capas de ingesta y extracción de datos para producción.

---

## 📋 Resumen Ejecutivo

El sistema tiene dos **capas de entrada de datos**:

1. **DATASOURCES INPUT** — ¿De dónde vienen los datos? (Facts, BusinessProfile, fuentes externas)
2. **EXTRACT KERNEL** — ¿Cómo se convierten en solicitudes? (Intérprete)

Ambas son **funcionales para MVP** pero necesitan expansión para **producción y multi-canal**.

---

## 🔵 DATASOURCES INPUT — De dónde vienen los datos

### ¿Qué es?
Todas las fuentes de información que alimentan el sistema: hechos de negocio, perfiles, datos externos.

### ¿Para qué sirve?
- El Intérprete necesita datos para tomar decisiones
- Las políticas necesitan contexto (cuántas transacciones hizo el cliente, cuál es su límite)
- El motor necesita saber el estado actual (es viernes a las 18:00, ¿estamos en horario?)

---

## ✅ Hoy existe:

```
├─ Facts (`facts/`)
│   ├─ Catálogo: qué hechos están disponibles
│   ├─ Proyección: calcula hechos desde eventos (agregados incrementales)
│   ├─ Proveedor: entrega "bolsa sellada" de hechos al Juez
│   └─ Ejemplos: cuenta_cliente, total_transacciones_mes, dias_en_plazo
│
├─ BusinessProfile (`contracts/business-profile/`)
│   ├─ Perfiles de negocio por industria (peluquería, clínica, ferretería...)
│   ├─ Políticas compiladas (permisos, restricciones, cálculos)
│   ├─ Calendarios y horarios (L-V 9-18)
│   ├─ Campos de modelo (inventario, recursos, compromisos)
│   └─ Templates de políticas (sin implementar)
│
├─ Sources (`contracts/business-profile/sources/`)
│   ├─ JSON file: lee datos de archivos locales
│   └─ Fixtures: datos de prueba por perfil
│
└─ Learning (`learning/`)
    ├─ Bayesian: modelos estadísticos de confianza (α, β, Dirichlet)
    ├─ Drift: detectar cambios en comportamiento
    └─ Privacy: preservar privacidad en datos agregados
```

---

## 🔴 Falta para producción:

### 1️⃣ **Conectores a Sistemas Externos** (Crítico)

```
PROBLEMA: Los datos de negocio viven en sistemas ajenos.
Hoy: Solo JSON local, sin conexión a ERP/CRM/Banco.

FALTA:
├─ Adaptadores para sistemas comunes
│   ├─ Odoo: sync de clientes, órdenes, inventario
│   ├─ SAP: centros de costo, GL, proveedores
│   ├─ Salesforce: oportunidades, cuentas, contactos
│   ├─ HubSpot: deals, compañías, actividades
│   └─ Datos bancarios: saldos en tiempo real
│
├─ Autenticación
│   ├─ OAuth2 para conectar sin credenciales hardcodeadas
│   ├─ API key management
│   └─ Refresh token handling
│
├─ Polling automático
│   ├─ Cada 30 min: sincronizar clientes nuevos
│   ├─ Cada 15 min: saldos de cuenta
│   ├─ Sin overhead (batch, diferencial)
│   └─ Notificación de cambios
│
└─ Error handling
    ├─ Retry con backoff exponencial
    ├─ Circuit breaker si API cae 3 veces
    ├─ Log de fallos para auditoría
    └─ Fallback a cached data mientras se recupera
```

**Impacto:** Sin esto, los "hechos" que usa el Juez están desactualizados (cliente aprobó pago hace 1 hora pero el sistema no lo sabe).

---

### 2️⃣ **Webhook Entrantes** (Importante)

```
PROBLEMA: Sistemas externos no pueden notificarnos de cambios.
Hoy: Solo polling (delay), sin push.

FALTA:
├─ Endpoint para recibir webhooks
│   ├─ POST /webhooks/erp (firmado con HMAC)
│   ├─ POST /webhooks/banco (para transacciones)
│   ├─ POST /webhooks/crm (para oportunidades nuevas)
│   └─ Validación de firma y deduplicación
│
├─ Procesamiento asincrónico
│   ├─ Queue de eventos entrantes
│   ├─ Worker que actualiza Facts
│   ├─ Retry automático si falla
│   └─ Dead letter si persiste fallo
│
├─ Transformación de datos
│   ├─ Webhook de Odoo → entidad 'Parte' en ABS
│   ├─ Webhook de Salesforce → 'Oferta' en ABS
│   └─ Mapeos configurables sin código
│
└─ Documentación
    ├─ Especificación de webhook para cada partner
    ├─ Ejemplos de payloads
    └─ Testing (Postman)
```

**Impacto:** Cambios en ERP toman 30+ min en reflejarse (polling). Con webhooks: <1s.

---

### 3️⃣ **Caché Distribuido** (Importante)

```
PROBLEMA: Facts se recalculan en cada transición (lento).
Hoy: Sin caché, recalcula desde EventStore cada vez.

FALTA:
├─ Redis para hechos volátiles
│   ├─ cuenta_activa: TTL 30 min
│   ├─ total_transacciones_mes: TTL 5 min
│   ├─ saldo_cliente: TTL 2 min (del banco)
│   └─ calendario_horarios: TTL 1 día
│
├─ Invalidación inteligente
│   ├─ Evento 'transicion aceptada' → invalidar facts de cliente
│   ├─ No invalidar TODO (costoso)
│   ├─ Invalidar dependencias: si cambia saldo, invalida límite
│   └─ Background refresh antes de expirar
│
├─ Fallback
│   ├─ Si Redis cae: recalcular on-demand
│   ├─ Si muy lento: usar valor cached viejo
│   └─ Log y alerta
│
└─ Monitoreo
    ├─ Hit rate: ¿cuántas Facts vienen de caché?
    ├─ Staleness: ¿cuán viejos son los datos?
    └─ Dashboard Redis: memory, keys, TTLs
```

**Impacto:** Sin caché, con 10,000 usuarios simultáneos y hechos complejos = timeout de solicitudes.

---

### 4️⃣ **Auditoría de Acceso a Datos** (Importante)

```
PROBLEMA: No sabemos quién accedió a qué datos.
Hoy: Sin log de acceso a Facts.

FALTA:
├─ Registro de cada acceso a datos
│   ├─ Quién: usuarioId
│   ├─ Cuándo: timestamp
│   ├─ Qué: fact name (cuenta_activa, saldo, etc.)
│   ├─ Resultado: sí/no por permiso
│   └─ Sesión/contexto de la acción
│
├─ Filtrado según rol
│   ├─ Gerente ve: todas las cuentas de su sucursal
│   ├─ Operador ve: solo su propia cuenta
│   ├─ Auditor ve: todas (con anotación)
│   └─ Aplicado en FactProvider, no retroactivo
│
├─ Almacenamiento
│   ├─ Tabla: audit_fact_access (tenant, actor, fact, timestamp)
│   ├─ Retención: 7 años (legal)
│   └─ Índices: por tenant, por fecha
│
└─ Queries
    ├─ "Quién accedió a saldo de cliente X en mes Y?"
    ├─ "Qué datos leyó usuario Z?"
    └─ Exportar para auditor externo
```

**Impacto:** GDPR exige auditoría. Pen test requiere demostrar data access controls.

---

### 5️⃣ **Versionado de Datos Externos** (Importante)

```
PROBLEMA: Si el cliente actualiza su BD externa, ¿qué pasa con nuestras decisiones?
Hoy: Sin seguimiento de versión.

FALTA:
├─ Snapshot versionado
│   ├─ Cuando Facts se usan en una transición, guardar su versión
│   ├─ Si cliente cambia saldo 1h después, nosotros seguimos con versión vieja
│   ├─ Evento contiene: fact_name, version, value_at_time
│   └─ Reproducibilidad: re-evaluar decisión con datos de entonces
│
├─ Cambio de política
│   ├─ Si sube límite de crédito mañana:
│   │   ├─ Transacciones hoy: con límite viejo
│   │   └─ Transacciones mañana: con límite nuevo
│   ├─ Auditoría: timestamp exacto del cambio de regla
│   └─ No es retroactivo
│
├─ Migraciones de datos
│   ├─ Si cambia schema de cliente (ej. código cliente 5→6 dígitos)
│   ├─ Mapeo de IDs antiguos a nuevos
│   ├─ Window de transición: ambos formatos aceptados
│   └─ Evento: incluye ambas versiones
│
└─ Testing
    ├─ Reproducir transición con datos de hace 6 meses
    ├─ Verificar decisión sigue siendo válida
    └─ Debugging: "¿por qué se aprobó en junio?"
```

**Impacto:** Para auditoría y resolución de disputas (cliente: "ese pago no debería haberse aprobado").

---

## 🟠 EXTRACT KERNEL — Intérprete: De solicitudes a transiciones

### ¿Qué es?
Capa que convierte solicitudes del usuario (botón, formulario, mensaje) en `TransitionRequest` estructurado que el Juez ejecuta.

### ¿Para qué sirve?
- El usuario dice "quiero transferir 500€" en lenguaje natural
- Intérprete lo entiende → extrae intent, monto, destinatario
- Valida confianza (¿100% seguro?)
- Si baja 0.85 → pide confirmación
- Si pasa → Juez ejecuta transición

---

## ✅ Hoy existe:

```
├─ Text Extractor (`text-extractor.ts`)
│   ├─ Heurísticas offline (regex, parseo)
│   ├─ Extrae: monto, fecha, actor, descripción
│   └─ Offline = rápido, no depende de LLM
│
├─ LLM Extractor (`llm-extractor.ts`)
│   ├─ Claude para textos complejos
│   ├─ Intent detection (qué transición quiere)
│   ├─ Entity extraction (quién, cuánto, cuándo)
│   └─ Confianza calculada (0-1)
│
├─ Intérprete (`interpret.ts`)
│   ├─ Elige heurística vs LLM según entrada
│   ├─ Usa Fact Bag para contexto (saldo actual, límite)
│   ├─ Valida: monto <= límite, fecha plausible
│   └─ Genera TransitionRequest
│
├─ Idempotencia (`idempotency.ts`)
│   ├─ clientRequestId: evita duplicados si user reenvía 2x
│   ├─ Ledger: guarda qué ya procesamos
│   └─ Responde con resultado anterior si es reenvío
│
└─ Intent Schema (`intent-schema.ts`)
    ├─ Schema de solicitud estructurada
    ├─ Validación de tipos
    └─ Conversión a TransitionRequest
```

---

## 🔴 Falta para producción:

### 1️⃣ **Multi-canal (Entrada desde múltiples fuentes)** (Crítico)

```
PROBLEMA: Solo web UI. Usuario no puede solicitar por email/SMS/API/Slack.
Hoy: Solo `/action` form POST desde web.

FALTA:
├─ Email como canal
│   ├─ Recibir email a noreply@abs.example.com
│   ├─ Parse: "Transferir 500€ a Inés" en asunto/body
│   ├─ Attachments: facturas, recibos como Evidencia
│   ├─ Responder por email: "Solicitud aceptada" / "Error"
│   └─ Seguridad: verificar sender es usuario conocido
│
├─ SMS/Telegram
│   ├─ Recibir: "+34600123456: trf 500 a Inés"
│   ├─ Mensaje corto → intérprete inteligente
│   ├─ Respuesta por SMS: "✓ Transferencia aprobada"
│   ├─ Confirmación: "¿Confirmas? Responde SI/NO"
│   └─ Seguridad: PIN / OTP
│
├─ API (para partners)
│   ├─ POST /api/v1/requests
│   ├─ Body: { intent, data: { monto, beneficiary } }
│   ├─ Respuesta: TransitionRequest con ID
│   ├─ Autenticación: JWT token
│   └─ Webhook de confirmación cuando procesa
│
├─ Webhooks entrantes
│   ├─ Sistema externo: POST /webhooks/request
│   ├─ Payload: transición + datos
│   ├─ Firma HMAC para validación
│   └─ Retry automático si recibidor falla
│
├─ Slack / Teams
│   ├─ Comando: /abs transferir 500 a Inés
│   ├─ Bot responde: form modal o confirmación inline
│   ├─ Integración con identidad Slack
│   └─ Notificaciones de estado en thread
│
└─ Voice (futuro)
    ├─ Asistente de voz: "Transferir quinientos euros"
    ├─ Speech-to-text
    ├─ Intent extraction
    └─ Confirmación: "¿Confirmas?"
```

**Impacto:** Usuario en la calle sin app = sin poder hacer transacciones. Es una vía de ingresos crítica.

---

### 2️⃣ **Contexto Histórico Mejorado** (Importante)

```
PROBLEMA: Intérprete no ve el historial de solicitudes del usuario.
Hoy: Cada solicitud aislada, sin contexto histórico.

FALTA:
├─ Memoria de usuario
│   ├─ Últimas 10 transiciones: monto, beneficiario, fecha
│   ├─ Patrones: "usuario siempre transfiere a estos 5 contactos"
│   ├─ Anomalías: "monto 100x lo habitual" → baja confianza
│   └─ Tiempo: "última acción hace 1 año" → sospecha
│
├─ Learning Bayesiano
│   ├─ Priors de confianza por tipo (transferencia doméstica = high, intl = low)
│   ├─ Update con cada aceptación/rechazo
│   ├─ Modelos por usuario/rol/beneficiary
│   └─ Agregado privado: nunca expone datos de 1 usuario
│
├─ Detección de anomalías
│   ├─ Si monto es outlier (3σ arriba de media)
│   ├─ Si beneficiario es nuevo (nunca visto)
│   ├─ Si horario inusual (3am para agricultor)
│   ├─ Si frecuencia anormal (5 transiciones en 5 min)
│   └─ Score de riesgo: 0-100 → ajusta confianza
│
├─ Contexto de Parte (cliente)
│   ├─ Score de solvencia (datos del banco + historial)
│   ├─ Industria: "cliente es clínica, transferencias a proveedores médicos"
│   ├─ Ciclo: "ingresos los días 10 y 25"
│   └─ Límites personalizados según solvencia
│
└─ Privacy-preserving learning
    ├─ Modelo aprende de agregados, no de usuario individual
    ├─ Difusión diferencial: ruido matemático para anonimizar
    └─ Sin exponer información de otros usuarios
```

**Impacto:** Más precisión en detección de fraude. Menos falsos positivos.

---

### 3️⃣ **Validación en Tiempo Real + Predicción** (Importante)

```
PROBLEMA: No sabemos si solicitud será aceptada hasta ejecutar Juez.
Hoy: Intérprete no predice rechazo.

FALTA:
├─ Early rejection
│   ├─ Intérprete pre-valida antes de enviar a Juez
│   ├─ "Monto > límite: rechazaré de todas formas"
│   ├─ Respuesta inmediata sin latencia de BD
│   └─ Caching de reglas vivas para fast-check
│
├─ Predicción de aprobación
│   ├─ Puntuación: 0-100 de probabilidad de aprobación
│   ├─ Si 90+: "Será aprobado en <2s"
│   ├─ Si 50-70: "Requiere aprobación manual, 2h"
│   ├─ Si <50: "Será rechazado, necesitas X"
│   └─ Machine learning: modelos por industria/cliente
│
├─ Feedback real-time
│   ├─ Usuario ve: "Será aprobado, tasa 95%"
│   ├─ Si no: "Faltan 2 documentos para aprobar"
│   ├─ Guiar: "Sube recibo para aumentar confianza"
│   └─ UX mejorada: no sorpresas
│
├─ Validación de datos
│   ├─ Antes de Juez: verificar que monto es número
│   ├─ Beneficiario existe en sistema
│   ├─ Fecha es plausible (no futura)
│   ├─ Campos requeridos presentes
│   └─ Longitud/formato según tipo
│
└─ Normalización
    ├─ "transferir $500 a Juan" → { type: trf, amount: 500, beneficiary: Juan }
    ├─ Moneda: detectar si es local o extranjera
    ├─ Cuenta de destino: IBAN vs número local
    └─ Fecha: parseo flexible (hoy, mañana, 2024-12-31)
```

**Impacto:** UX: Usuario sabe el resultado antes de enviar. Menos rechazos sorpresa.

---

### 4️⃣ **Gestión de Attachments y OCR** (Importante)

```
PROBLEMA: Usuario no puede enviar recibos/facturas como Evidencia.
Hoy: Sin manejo de archivos en Intérprete.

FALTA:
├─ Attachment handling
│   ├─ Recibir: PDF, imagen, ZIP en solicitud
│   ├─ Validación: tamaño (<10MB), tipo (PDF/JPG/PNG)
│   ├─ Almacenamiento: S3 / Google Cloud con versioning
│   ├─ Referencia: attachment_id en solicitud
│   └─ Virus scan: ClamAV antes de guardar
│
├─ OCR (Optical Character Recognition)
│   ├─ Foto de factura → extrae monto, fecha, IBAN
│   ├─ Cheque escaneado → extrae número, monto, librador
│   ├─ DNI/Pasaporte → extrae nombre, NIF, fecha validez
│   ├─ Engine: Tesseract o AWS Textract
│   └─ Confianza: ocr_confidence_score
│
├─ Vinculación a Evidencia
│   ├─ OCR result → crea objeto Evidence
│   ├─ Si confianza alta (>95%): auto-acepta como evidencia
│   ├─ Si media (70-95%): requiere validación manual
│   ├─ Si baja: rechaza, pide reenvío
│   └─ Traza: qué OCR vio, timestamps
│
├─ Archivos múltiples
│   ├─ Transferencia de 3 cheques: enviar 3 imágenes
│   ├─ Procesar batch: OCR cada uno
│   ├─ Correlacionar: cheques suman monto total?
│   └─ Reportar: lista de evidencias extraídas
│
└─ Privacidad
    ├─ No loguear datos sensibles extraídos (NIF)
    ├─ Encriptar attachments en reposo
    ├─ Acceso auditado: quién descargó archivo
    └─ Retención: borrar archivo tras X días si transición rechazada
```

**Impacto:** Documentación = evidencia = más transacciones aprobadas automáticamente.

---

### 5️⃣ **Confirmación Inteligente y Escalada** (Importante)

```
PROBLEMA: ¿Cuándo pedir confirmación al usuario?
Hoy: Umbrales simples (confianza < 0.85).

FALTA:
├─ Estrategia de confirmación adaptativa
│   ├─ Bajo riesgo (transferencia doméstica <500): sin confirmación
│   ├─ Riesgo medio (monto grande): "¿Confirmas? Sí/No"
│   ├─ Alto riesgo (internacional, nueva cuenta): 2FA + confirmación
│   └─ Score: monto + destino + histórico + anomalías
│
├─ Canales de confirmación
│   ├─ SMS: "Confirma trf a Inés? Responde SI"
│   ├─ Email: botón "Confirmar" con token de 1 uso
│   ├─ App push: notificación + prompt en app
│   ├─ Llamada: IVR "Presiona 1 para confirmar"
│   └─ Seguridad: 1 token, TTL 5 min, 1 intento
│
├─ Timeout y escalada
│   ├─ Usuario no confirma en 5 min: auto-rechaza
│   ├─ Usuario rechaza: log para análisis (¿por qué cambió idea?)
│   ├─ Si 3 rechazos: enviar a gerente para revisar política
│   └─ Humano puede forzar si hay causa válida
│
├─ Contexto en confirmación
│   ├─ "Transferir €500 a Juan García? [Sí/No]"
│   ├─ Mostrar: monto, beneficiario, fecha estimada de valor
│   ├─ Si SMS: usar alias corto ("Trf €500?" si confían en número)
│   └─ Si nuevo beneficiario: "Primera vez a Juan"
│
└─ Automatización (sin intervención humana)
    ├─ Si confianza >98%: aprobar directamente
    ├─ Requisitos: usuario con historial limpio, monto bajo, beneficiario conocido
    ├─ Log: "Auto-aprobada por puntuación 98"
    └─ Cadena de auditoría intacta
```

**Impacto:** UX fluida (no pedir confirmación para cosas obvias). Seguridad (pedir para riesgosas).

---

### 6️⃣ **Intégración con políticas de empresa** (Importante)

```
PROBLEMA: Intérprete no valida contra reglas de negocio de la empresa.
Hoy: Sin validación de políticas en intérprete.

FALTA:
├─ Carga dinámica de reglas
│   ├─ Al procesar solicitud: fetch CompiledRuleSet del tenant
│   ├─ Evaluar "¿está permitido por mis políticas?"
│   ├─ Ej: empresa prohibe transferencias internacionales
│   ├─ Pre-rechazo: "No permitido por política"
│   └─ Sin latencia: caché + watch de cambios
│
├─ Validación de campos requeridos
│   ├─ Empresa requiere descripción en cada transacción
│   ├─ Usuario no envía → Intérprete pide
│   ├─ Ej: "¿Por qué este pago? (obligatorio)"
│   └─ Enriquecimiento: texto → Evidencia narrativa
│
├─ Límites dinámicos
│   ├─ Cliente tiene límite diario: €10k
│   ├─ Si solicita €15k: rechaza con mensaje
│   ├─ Si es gerente: límite diferente
│   └─ Fallback si BD está lenta: último límite conocido
│
├─ Documentación requerida
│   ├─ Empresa requiere factura para >€1k
│   ├─ Usuario sin factura → Intérprete pide
│   ├─ OCR extrae monto → lo compara con solicitud
│   ├─ Si no coinciden: "Monto en factura no coincide"
│   └─ Confianza baja si hay discrepancia
│
└─ Escalada según regla
    ├─ Transacción cumple política pero necesita aprobación
    ├─ Intérprete asigna: { requiresApproval: true, roleRequired: 'gerente' }
    ├─ Genera Task para gerente
    ├─ Si pasa 2h: escalada automática a director
    └─ Evento: "escalada_por_timeout"
```

**Impacto:** Intérprete no es "naive" sino "policy-aware". Rechaza lo prohibido antes de Juez.

---

## 🎯 PLAN DE IMPLEMENTACIÓN

### FASE 1: Básico para Producción (30 días)

```
Semana 1:
  ├─ Multi-canal: Email + SMS basics
  ├─ Webhook entrantes (1 adaptador: Odoo)
  └─ Attachment handling (sin OCR)

Semana 2:
  ├─ Auditoría de acceso a Facts
  ├─ Caché Redis para Facts
  └─ Testing de concurrencia

Semana 3:
  ├─ Contexto histórico básico (últimas 10 transiciones)
  ├─ Detección de anomalías simple (3σ)
  └─ Early rejection validation

Semana 4:
  ├─ Integración: intérprete ↔ políticas
  ├─ Confirmación adaptativa (SMS/Email)
  └─ Load testing con múltiples canales
```

### FASE 2: Inteligencia (30 días)

```
Semana 5-6:
  ├─ OCR básico (Tesseract)
  ├─ Learning Bayesiano mejorado
  └─ Predicción de aprobación

Semana 7:
  ├─ Multi-canal avanzada (Slack, Teams)
  ├─ Voice (transcripción basada en Whisper)
  └─ Webhook de más sistemas (Salesforce, SAP)

Semana 8:
  ├─ Anomaly detection mejorada (drift, clustering)
  ├─ Context enrichment (datos de Parte)
  └─ Testing A/B de estrategias de confirmación
```

### FASE 3: Escala (60 días)

```
Mes 3:
  ├─ Polling automático de 10+ sistemas
  ├─ Analytics de canales: cuál convierte más
  ├─ Webhook de auditoría: cada cambio se notifica
  └─ Voice assistant maduro (Dialogflow + Whisper)
```

---

## 📊 SUCCESS CRITERIA

| Requisito | Fase 1 | Fase 2 | Fase 3 |
|-----------|--------|--------|--------|
| Web UI | ✅ | ✅ | ✅ |
| Email | ✅ | ✅ | ✅ |
| SMS | ✅ | ✅ | ✅ |
| API | ✅ | ✅ | ✅ |
| Webhooks | ✅ | ✅ | ✅ |
| Slack/Teams | ❌ | ✅ | ✅ |
| Voice | ❌ | ✅ | ✅ |
| OCR | ❌ | ✅ | ✅ |
| Caché Redis | ✅ | ✅ | ✅ |
| Auditoría datos | ✅ | ✅ | ✅ |
| Learning ML | ❌ | ✅ | ✅ |
| Multi-sistema sync | ❌ | ✅ | ✅ |

**Fase 1 + 2 = plataforma inteligente multi-canal.**

---

## 🔗 Relación con otros módulos

```
DATASOURCES INPUT ← Facts Provider, BusinessProfile, Adapters
         ↓
    [Fact Bag]
         ↓
EXTRACT KERNEL (Intérprete) ← Reglas de empresa, Learning
         ↓
  [TransitionRequest]
         ↓
   Judge (Capa 0) → EventStore
```

**Mejoras en DATASOURCES** = Facts más precisos = Judge toma mejores decisiones.  
**Mejoras en EXTRACT KERNEL** = Solicitudes mejor entendidas = menos rechazos por malinterpretación.

---

*Documento generado: 2026-09-29*  
*Versión: 1.0*
