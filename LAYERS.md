# Capas del Repo ABS

## CAPA 0: Elementos Core
**Función**: Definir tipos base, eventos, estructura del dominio del negocio

**Directorios**:
- `elements/` — Definiciones de dominio: Parte, Actor, Oferta, Movimiento, Factura, Evento, etc.
- `core/` — Grammar, especificación central, tipos fundamentales
- `facts/` — Hechos base del sistema
- `spec/` — Especificación de comportamiento

**Ejemplos**:
- `elements/movimientos.ts` — define Movimiento
- `core/events.ts` — tipos de evento
- `facts/` — hechos inmutables

**Usa**: Nadie. Todos lo usan.
**Usado por**: Capas 1, 2, 3, 4

---

## CAPA 1: Almacenamiento
**Función**: Persistir datos en BD (append-only, queries, transacciones)

**Directorios**:
- `adapters/` — sqlite-stock-store, sqlite-cobros-store, etc. (persistencia especializada)
- `db/` — Configuración base de datos, migraciones

**Ejemplos**:
- `adapters/sqlite-stock-store.ts` — guardar movimientos de inventario
- `adapters/sqlite-notificaciones-envios-store.ts` — log de notificaciones
- `db/` — esquema y conexiones

**Usa**: Capa 0
**Usado por**: Capa 2

---

## CAPA 2: Lógica de Negocio
**Función**: Procesar eventos, validar reglas, ejecutar acciones, orquestar flujos

**Directorios**:
- `web/` — runtime.ts, action-handler.ts, runtime de negocio
- `policies/` — juez, validaciones, reglas de negocio
- `interpreter/` — intérprete de eventos/acciones
- `observer/` — observador de cambios
- `accounts/` — lógica de cuentas/expedientes
- `filter/` — filtros de datos

**Ejemplos**:
- `web/runtime.ts` — expedientesDinero(), registrarCobro()
- `policies/judge.ts` — aplica reglas de validación
- `interpreter/` — procesa eventos del dominio
- `accounts/` — lógica de gestión de expedientes

**Usa**: Capas 0, 1
**Usado por**: Capas 3, 4

---

## CAPA 3: Generación & Composición
**Función**: Compilar perfil de negocio → AppBootResult funcional, planificación

**Directorios**:
- `composer/` — Detectar arquetipo, mapear perfil a entrada
- `generator/` — Checklist, medición, reglas de generación
- `contracts/` — Templates de políticas, especificaciones de contratos
- `archetypes/` — Arquetipos predefinidos de negocio
- `diagnosis/` — Diagnóstico y análisis de perfil
- `learning/` — Aprendizaje de patrones

**Ejemplos**:
- `composer/sample-to-v12.ts` — mapear perfil a GeneratorInput
- `generator/checklist.ts` — generar puntos a revisar
- `contracts/` — templates de políticas por arquetipo
- `archetypes/` — modelos de negocio estándar

**Usa**: Capas 0, 1, 2
**Usado por**: Capas 2, 4

---

## CAPA 4: Presentación & Comunicación
**Función**: Mostrar datos, aceptar acciones del usuario, comunicación externa

**Directorios**:
- `web/` — Handlers web (maestros, crm, portal, hoy, dinero, facturas, permisos, etc.)
- `presentation/` — Componentes de interfaz, vistas
- `presenter/` — Lógica de presentación
- `consultant/` — Consultor/asistente
- `communication/` — Notificaciones, emails, SMS (si existe)
- `bridges/` — Puentes a sistemas externos (inteligencia, terceros)

**Ejemplos**:
- `web/maestros.ts` — lista de clientes/expedientes
- `web/hoy.ts` — dashboard diario
- `web/dinero.ts` — gestión de ingresos/cobros
- `presentation/` — componentes UI
- `communication/` — motor de notificaciones

**Usa**: Todas
**Usado por**: Usuario final (navegador/cliente)

---

## Servicios Transversales (Cortan todas las capas)
**No son capas, pero afectan todas**:

- `auth/` — Autenticación y autorización
- `tenancy/` — Multi-tenancy, aislamiento de datos
- `audit/` — Auditoría y trazabilidad
- `gdpr/` — Compliance y privacidad
- `observability/` — Logs, métricas, trazas
- `llm/` — Integraciones con LLM
- `response-registrar/` — Registro de respuestas
- `prioritizer/` — Priorización de tareas

---

## Flujo típico (cómo interactúan)

```
1. Usuario en Capa 4 (web) hace clic en botón
   ↓
2. Va a Capa 2 (action-handler) que ejecuta la acción
   ↓
3. Capa 2 consulta reglas (judge, policies)
   ↓
4. Capa 2 lee/escribe en Capa 1 (adapters, db)
   ↓
5. Capa 1 usa tipos de Capa 0
   ↓
6. Capa 4 lee datos de Capa 1 y muestra al usuario
```

---

## Dónde estudiar cada cosa

- **Quiero entender el modelo de datos**: Capa 0 (`elements/`, `core/`, `facts/`)
- **Quiero entender cómo se guarda**: Capa 1 (`adapters/`, `db/`)
- **Quiero entender cómo se valida y ejecuta**: Capa 2 (`policies/`, `web/runtime.ts`, `interpreter/`)
- **Quiero entender cómo se genera un negocio**: Capa 3 (`composer/`, `generator/`, `contracts/`, `archetypes/`)
- **Quiero entender qué ve el usuario**: Capa 4 (`web/`, `presentation/`, `consultant/`)
- **Quiero entender autenticación/seguridad**: `auth/`, `policies/`
- **Quiero entender quién accede qué**: `tenancy/`, `audit/`

---

## Dependencias Visuales

```
┌─────────────────────────────────────┐
│  CAPA 4: Presentación              │
│  (web/, presentation/)             │
└────────────┬────────────────────────┘
             │
┌────────────┴────────────────────────┐
│  CAPA 3: Generación                 │
│  (composer/, generator/)            │
└────────────┬────────────────────────┘
             │
┌────────────┴────────────────────────┐
│  CAPA 2: Lógica                     │
│  (policies/, web/runtime/)          │
└────────────┬────────────────────────┘
             │
┌────────────┴────────────────────────┐
│  CAPA 1: Almacenamiento             │
│  (adapters/, db/)                   │
└────────────┬────────────────────────┘
             │
┌────────────┴────────────────────────┐
│  CAPA 0: Elementos Core             │
│  (elements/, core/, facts/)         │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  TRANSVERSALES                      │
│  (auth/, tenancy/, audit/)          │
│  (Permean todas las capas)          │
└─────────────────────────────────────┘
```

---

## Crecimiento y Cambios

- **Agregar tipo nuevo**: Empieza en Capa 0 (elements/)
- **Agregar validación**: Capa 2 (policies/)
- **Agregar pantalla**: Capa 4 (web/, presentation/)
- **Agregar almacenamiento**: Capa 1 (adapters/)
- **Agregar flujo de generación**: Capa 3 (generator/, composer/)

---

## Notas

- Las capas son direccionales: Capa N depende de N-1, no al revés
- Capa 0 es estable, cambios aquí afectan a todas
- Capa 4 es la más volátil (cambios UI no impactan lógica)
- Servicios transversales (auth, tenancy, audit) atraviesan todas las capas
- Cada capa tiene responsabilidad clara y acoplamiento bajo
