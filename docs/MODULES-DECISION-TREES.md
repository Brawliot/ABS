# Árboles de Decisión de Módulos en ABS

Guía práctica para entender y predecir qué módulos se generarán para un perfil de negocio.

---

## 1. Árbol de Decisión: Módulos Funcionales

```
MÓDULOS FUNCIONALES
├─ TPV (Punto de Venta)
│  ├─ ¿El negocio tiene canal presencial?
│  │  └─ ✅ Sí
│  │     └─ ¿El pago es inmediato?
│  │        └─ ✅ Sí
│  │           └─ ¿Tiene ciclo de vida tipo "venta"?
│  │              └─ ✅ Sí → ACTIVA TPV
│  │              └─ ❌ No → Sin TPV
│  │        └─ ❌ No → Sin TPV (es crédito/diferido)
│  └─ ❌ No → Sin TPV
│
├─ CRM (Relación con Partes)
│  ├─ ¿El negocio tiene Partes (clientes/proveedores)?
│  │  └─ ✅ Sí
│  │     └─ ¿Hay estados de pipeline (propuesta, solicitud, prospecto)?
│  │        └─ ✅ Sí → ACTIVA CRM
│  │        └─ ❌ No → Sin CRM
│  └─ ❌ No → Sin CRM
│
├─ INVENTARIO (Stock)
│  └─ ¿naturalezaBienes.includes("propios_por_cantidad")?
│     └─ ✅ Sí → ACTIVA INVENTARIO
│     └─ ❌ No → Sin Inventario
│
├─ AGENDA (Calendario de Capacidad)
│  ├─ ¿Hay recursos de capacidad temporal?
│  │  └─ ✅ Sí
│  │     └─ ¿El negocio tiene calendario (horario + citas)?
│  │        └─ ✅ Sí → ACTIVA AGENDA
│  │        └─ ❌ No → Sin Agenda
│  └─ ❌ No → Sin Agenda
│
├─ FACTURACIÓN (Documentos)
│  ├─ ¿Tiene movimientos de dinero?
│  │  └─ ✅ Sí
│  │     ├─ ¿Tiene documentos formales (presupuestos, contratos)?
│  │     │  └─ ✅ Sí
│  │     │     ├─ ¿Tiene cumplimiento fiscal?
│  │     │     │  └─ ✅ Sí → ACTIVA FACTURACIÓN
│  │     │     │  └─ ❌ No → Sin Facturación
│  │     │     └─ ❌ No → Sin Facturación
│  │     └─ ❌ No → Sin Facturación
│  └─ ❌ No → Sin Facturación
│
└─ PORTAL CLIENTE (Autoservicio)
   ├─ ¿Tiene canal autoservicio?
   │  └─ ✅ Sí
   │     └─ ¿Hay reglas de visibility para Cliente/Parte?
   │        └─ ✅ Sí → ACTIVA PORTAL
   │        └─ ❌ No → Sin Portal
   └─ ❌ No → Sin Portal
```

---

## 2. Árbol de Decisión: Módulos de Presentación

```
MÓDULOS DE PRESENTACIÓN
├─ CLIENTES (siempre)
│  └─ Todos los negocios intercambian con alguien
│
├─ CATÁLOGO (siempre)
│  └─ Todos los negocios ofrecen algo con un precio
│
├─ DINERO (siempre)
│  └─ Todos los negocios cobran y pagan
│
├─ FACTURAS
│  └─ hasFiscalCompliance || hasFormalDocuments?
│     └─ ✅ Sí → ACTIVA FACTURAS
│     └─ ❌ No → Sin Facturas
│
├─ STOCK
│  ├─ ¿Vende bienes propios por cantidad?
│  │  └─ ✅ Sí
│  │     └─ ¿Los arquitectos "venta" o "servicio_proyecto" mueven mercancia?
│  │        └─ ✅ Sí → ACTIVA STOCK
│  │        └─ ❌ No (alquiler, suscripción, intermediación) → Sin Stock
│  └─ ❌ No → Sin Stock
│
├─ AGENDA
│  └─ ¿Se derivó panel_agenda en presentation-rules?
│     └─ ✅ Sí (recurso capacidad temporal) → ACTIVA AGENDA
│     └─ ❌ No → Sin Agenda
│
├─ CUOTAS (Suscripción)
│  └─ ¿Se derivó panel_periodos?
│     └─ ✅ Sí (archetype="suscripcion") → ACTIVA CUOTAS
│     └─ ❌ No → Sin Cuotas
│
├─ FIANZAS (Retención)
│  └─ ¿Se derivó panel_retencion?
│     └─ ✅ Sí (intermediacion OR uso_temporal+fianza) → ACTIVA FIANZAS
│     └─ ❌ No → Sin Fianzas
│
├─ CRÉDITO (Plazos)
│  ├─ ¿Se derivó panel_credito?
│  │  └─ ✅ Sí (archetype="financiera") → ACTIVA CRÉDITO
│  └─ ¿O paymentMode="diferido"?
│     └─ ✅ Sí → ACTIVA CRÉDITO
│     └─ ❌ No → Sin Crédito
│
└─ PORTAL
   └─ ¿Se derivó portal_filtro en presentation-rules?
      └─ ✅ Sí (autoservicio + portalVisibilityRoles > 0) → ACTIVA PORTAL
      └─ ❌ No → Sin Portal
```

---

## 3. Matriz de Condiciones por Perfil

### Peluquería (p01)

```
ENTRADA:
  channels: ["presencial", "backoffice"]
  naturalezaBienes: ["propios_por_cantidad"]
  paymentMode: "inmediato"
  hasCalendar: true
  hasFiscalCompliance: true
  hasPartes: true
  hasMovimientos: true
  hasFormalDocuments: false (solo tickets)

DECISIONES:
  TPV:
    - presencial? ✅ SÍ
    - paymentMode="inmediato"? ✅ SÍ
    - archetype="venta"? ✅ SÍ (venta de servicios + productos)
    → ACTIVA TPV ✅

  CRM:
    - hasPartes? ✅ SÍ
    - isPipeline? ❌ NO (sin presupuestos)
    → Sin CRM ❌

  INVENTARIO:
    - propios_por_cantidad? ✅ SÍ (champús, tintes)
    → ACTIVA INVENTARIO ✅

  AGENDA:
    - capacidad_temporal? ✅ SÍ (citas)
    - hasCalendar? ✅ SÍ
    → ACTIVA AGENDA ✅

  FACTURACIÓN:
    - hasMovimientos? ✅ SÍ
    - hasFormalDocuments? ❌ NO (solo tickets)
    - hasFiscalCompliance? ✅ SÍ (facturación simplificada)
    → ACTIVA FACTURACIÓN ✅

  PORTAL:
    - autoservicio? ✅ SÍ (reserva de cita)
    - portalVisibilityRoles? ✅ SÍ (cliente)
    → ACTIVA PORTAL ✅

RESULTADO: TPV ✅, CRM ❌, Inventario ✅, Agenda ✅, Facturación ✅, Portal ✅
```

### Clínica Dental (p02)

```
ENTRADA:
  channels: ["presencial", "backoffice"]
  naturalezaBienes: ["propios_por_cantidad"]
  paymentMode: "diferido" (plazos propios + financiera)
  hasCalendar: true
  composition: MULTISEDE
  hasFiscalCompliance: true
  datosSensibles: ["salud"]

DECISIONES:
  TPV:
    - presencial? ✅ SÍ
    - paymentMode="inmediato"? ❌ NO (es "diferido")
    → Sin TPV ❌

  CRM:
    - hasPartes? ✅ SÍ
    - isPipeline? ✅ SÍ (presupuesto = propuesta)
    → ACTIVA CRM ✅

  INVENTARIO:
    - propios_por_cantidad? ✅ SÍ (material)
    → ACTIVA INVENTARIO ✅

  AGENDA:
    - capacidad_temporal? ✅ SÍ (citas por profesional y sede)
    - hasCalendar? ✅ SÍ
    → ACTIVA AGENDA ✅

  FACTURACIÓN:
    - hasMovimientos? ✅ SÍ
    - hasFormalDocuments? ✅ SÍ (presupuestos, consentimientos)
    - hasFiscalCompliance? ✅ SÍ
    → ACTIVA FACTURACIÓN ✅

  PORTAL:
    - autoservicio? ✅ SÍ
    - portalVisibilityRoles? ✅ SÍ (pero restringido: no historia clínica)
    → ACTIVA PORTAL ✅

PANELES:
  - panel_credito: ✅ SÍ (archetype="financiera")
    → ACTIVA CRÉDITO ✅

RESULTADO: TPV ❌, CRM ✅, Inventario ✅, Agenda ✅, Facturación ✅, Portal ✅
MÓDULOS UI: Clientes ✅, Catálogo ✅, Dinero ✅, Facturas ✅, Stock ✅, Agenda ✅, Crédito ✅, Portal ✅
```

### Gestoría (p06)

```
ENTRADA:
  channels: ["backoffice", "web"]
  naturalezaBienes: [] (no tiene bienes)
  paymentMode: "diferido" (cuota mensual domiciliada)
  composition: Archetype="suscripcion"
  hasFiscalCompliance: true (plazos de presentación)
  datosSensibles: ["economicos"]
  hasCalendar: true (temporadas, picos)

DECISIONES:
  TPV:
    - presencial? ❌ NO (es servicios de back office)
    → Sin TPV ❌

  CRM:
    - hasPartes? ✅ SÍ (clientes)
    - isPipeline? ❌ NO (sin propuestas, solo gestión)
    → Sin CRM ❌

  INVENTARIO:
    - propios_por_cantidad? ❌ NO
    → Sin Inventario ❌

  AGENDA:
    - capacidad_temporal? ❌ NO (citas ocasionales, no recurso)
    → Sin Agenda ❌

  FACTURACIÓN:
    - hasMovimientos? ✅ SÍ
    - hasFormalDocuments? ✅ SÍ (modelos, presentaciones)
    - hasFiscalCompliance? ✅ SÍ (plazos)
    → ACTIVA FACTURACIÓN ✅

  PORTAL:
    - autoservicio? ✅ SÍ
    - portalVisibilityRoles? ✅ SÍ (cliente ve documentos, estado)
    → ACTIVA PORTAL ✅

PANELES:
  - panel_periodos: ✅ SÍ (archetype="suscripcion")
    → ACTIVA CUOTAS ✅

RESULTADO: TPV ❌, CRM ❌, Inventario ❌, Agenda ❌, Facturación ✅, Portal ✅
MÓDULOS UI: Clientes ✅, Catálogo ✅, Dinero ✅, Facturas ✅, Cuotas ✅, Portal ✅
```

### Taller Mecánico (p04)

```
ENTRADA:
  channels: ["taller", "backoffice"]
  naturalezaBienes: ["propios_por_cantidad", "del_cliente"]
  paymentMode: "inmediato" (pago al recoger)
  composition: Servicio de reparación
  hasCalendar: true (citas para recepción)
  hasFormalDocuments: true (presupuesto escrito, garantía)
  resourceSubtypes: ["capacidad_temporal"] (horas en taller)

DECISIONES:
  TPV:
    - presencial? ✅ SÍ (taller es presencial)
    - paymentMode="inmediato"? ✅ SÍ
    - archetype="venta"? ❌ NO (es "servicio_proyecto")
    → Sin TPV ❌

  CRM:
    - hasPartes? ✅ SÍ
    - isPipeline? ✅ SÍ (presupuesto = propuesta)
    → ACTIVA CRM ✅

  INVENTARIO:
    - propios_por_cantidad? ✅ SÍ (piezas de repuesto)
    → ACTIVA INVENTARIO ✅

  AGENDA:
    - capacidad_temporal? ✅ SÍ (horas de taller)
    - hasCalendar? ✅ SÍ
    → ACTIVA AGENDA ✅

  FACTURACIÓN:
    - hasMovimientos? ✅ SÍ
    - hasFormalDocuments? ✅ SÍ
    - hasFiscalCompliance? ✅ SÍ
    → ACTIVA FACTURACIÓN ✅

  PORTAL:
    - autoservicio? ✅ SÍ (ver estado reparación)
    - portalVisibilityRoles? ✅ SÍ
    → ACTIVA PORTAL ✅

BLOQUEOS (composition):
  - "no se repara sin presupuesto aceptado"
  → panel_bloqueo ✅

RESULTADO: TPV ❌, CRM ✅, Inventario ✅, Agenda ✅, Facturación ✅, Portal ✅
MÓDULOS UI: Clientes ✅, Catálogo ✅, Dinero ✅, Facturas ✅, Stock ✅, Agenda ✅, Portal ✅
```

### Alquiler de Maquinaria (p08)

```
ENTRADA:
  channels: ["backoffice", "web"]
  naturalezaBienes: ["propios_unitarios", "propios_por_cantidad"]
  paymentMode: "mixto" (contado + crédito 30 días)
  composition: Multisede (Getafe, Alcobendas)
  resourceSubtypes: ["retornable"]
  hasFiscalCompliance: true

DECISIONES:
  TPV:
    - presencial? ❌ NO (es gestión de alquileres, no venta presencial)
    → Sin TPV ❌

  CRM:
    - hasPartes? ✅ SÍ (constructoras)
    - isPipeline? ❌ NO (son alquileres, no propuestas)
    → Sin CRM ❌

  INVENTARIO:
    - propios_por_cantidad? ✅ SÍ (maquinaria)
    → ACTIVA INVENTARIO ✅

  AGENDA:
    - capacidad_temporal? ✅ SÍ (entregas/recogidas programadas)
    - hasCalendar? ✅ SÍ
    → ACTIVA AGENDA ✅

  FACTURACIÓN:
    - hasMovimientos? ✅ SÍ
    - hasFormalDocuments? ✅ SÍ (contrato alquiler)
    - hasFiscalCompliance? ✅ SÍ
    → ACTIVA FACTURACIÓN ✅

  PORTAL:
    - autoservicio? ✅ SÍ (ver alquileres activos, pedir prórroga)
    - portalVisibilityRoles? ✅ SÍ
    → ACTIVA PORTAL ✅

PANELES:
  - panel_retencion: ✅ SÍ (uso_temporal + pideFianza → fianzas)
    → ACTIVA FIANZAS ✅
  
  - panel_credito: ✅ SÍ (paymentMode="mixto")
    → ACTIVA CRÉDITO ✅

BLOQUEOS:
  - "no se entrega sin contrato + fianza"
  - "no se vuelve a alquilar sin revisión"
  → panel_bloqueo ✅

RESULTADO: TPV ❌, CRM ❌, Inventario ✅, Agenda ✅, Facturación ✅, Portal ✅
MÓDULOS UI: Clientes ✅, Catálogo ✅, Dinero ✅, Facturas ✅, Stock ✅, Agenda ✅, Fianzas ✅, Crédito ✅, Portal ✅
```

---

## 4. Guía de Troubleshooting: "¿Por qué mi módulo no se activa?"

### Problema: No aparece TPV

**Checklist**:
1. ¿El negocio tiene canal presencial?
   - Busca en `channels`: debe incluir `"presencial"`
2. ¿El pago es inmediato?
   - Busca en `paymentMode`: debe ser `"inmediato"`
3. ¿Hay un ciclo de vida tipo venta?
   - Busca en `lifecycles`: debe haber uno con `archetypeId="venta"`

**Si no se activa**: Es probable que sea crédito/diferido (paymentMode) o que no sea venta pura.

---

### Problema: No aparece CRM

**Checklist**:
1. ¿El negocio tiene Partes?
   - Busca `hasPartes: true` en GeneratorInput
2. ¿Hay estados de pipeline?
   - Busca en el ciclo de vida: debe haber estados con `kind="inicial"` o que coincidan con `propuesta|solicitud|prospecto|borrador`
3. ¿Hay presupuestos o propuestas?
   - Si no, probablemente no hay pipeline.

**Si no se activa**: El negocio vende directamente (sin propuestas) o solo compra.

---

### Problema: No aparece Inventario

**Checklist**:
1. ¿naturalezaBienes incluye `"propios_por_cantidad"`?
   - Busca en el BusinessProfile: `naturalezaBienes.valor` debe tener `"propios_por_cantidad"`

**Si no se activa**: El negocio no maneja bienes por cantidad (alquila unidades, intermedia, o es puro servicio).

---

### Problema: No aparece Agenda

**Checklist**:
1. ¿Hay recursos de capacidad temporal?
   - Busca en `resourceSubtypes`: debe incluir `"capacidad_temporal"`
2. ¿El negocio tiene calendario?
   - Busca en `hasCalendar: true`

**Si no se activa**: El negocio no trabaja con citas ni horarios (venta pura, intermediación, alquiler de unidades).

---

### Problema: No aparece Facturación

**Checklist**:
1. ¿Hay movimientos de dinero?
   - Busca `hasMovimientos: true`
2. ¿Hay documentos formales?
   - Busca `hasFormalDocuments: true` (presupuestos, contratos, etc.)
3. ¿Hay cumplimiento fiscal?
   - Busca `hasFiscalCompliance: true` (facturación, retención IRPF, etc.)

**Si no se activa**: El negocio no genera documentos o cumplimiento (aunque es raro).

---

### Problema: No aparece Portal Cliente

**Checklist**:
1. ¿Hay canal autoservicio?
   - Busca en `channels`: debe incluir `"autoservicio"`
2. ¿Hay roles de cliente/parte con visibility?
   - Busca en `ruleSet.rules`: debe haber al menos una con `kind="visibility"` y `allowedRoles` que incluya `"cliente"` o `"parte"`

**Si no se activa**: El negocio no permite que clientes accedan a sus datos.

---

### Problema: No aparece Stock (módulo de UI)

**Checklist**:
1. ¿Vende bienes por cantidad?
   - Busca `naturalezaBienes.includes("propios_por_cantidad")`
2. ¿Los arquitectos mueven mercancia?
   - Busca `lifecycles`: debe haber uno con `archetypeId` en `["venta", "servicio_proyecto"]`

**Si no se activa**: 
- El negocio no vende bienes (servicios puros, alquiler, intermediación)
- O vende bienes unitarios (propios_unitarios), no por cantidad

---

### Problema: No aparece Cuotas

**Checklist**:
1. ¿Hay un ciclo de vida tipo suscripción?
   - Busca en `lifecycles`: debe haber uno con `archetypeId="suscripcion"`

**Si no se activa**: El negocio no cobra cuotas periódicas (pago único, crédito, etc.).

---

### Problema: No aparece Fianzas

**Checklist**:
1. ¿Hay intermediación?
   - Busca `lifecycles`: ¿hay `archetypeId="intermediacion"`?
2. ¿O hay alquiler con fianza?
   - Busca `lifecycles`: ¿hay `archetypeId="uso_temporal"`?
   - Y además: ¿`pideFianza(input) == true`? (una regla de negocio lo declara)

**Si no se activa**: El negocio no retiene dinero de terceros.

---

### Problema: No aparece Crédito

**Checklist**:
1. ¿Hay un ciclo financiera?
   - Busca en `lifecycles`: debe haber uno con `archetypeId="financiera"`
2. ¿O el paymentMode es diferido?
   - Busca `paymentMode`: debe ser `"diferido"` o `"mixto"`

**Si no se activa**: El negocio cobra siempre al momento.

---

## 5. Casos Especiales y Excepciones

### Caso: Negocio Híbrido (Varias naturalezaBienes)

```
naturalezaBienes: ["propios_por_cantidad", "del_cliente"]
Ejemplo: Taller mecánico (piezas propias + vehículos del cliente)

RESULTADO:
  - Inventario: ✅ SÍ (propios_por_cantidad)
  - Pero: El módulo solo gestiona las piezas, no los vehículos
  - Bloqueo: "el vehículo no se lleva hasta cobrar" (regla manual)
```

### Caso: paymentMode "mixto"

```
paymentMode: "mixto" (algunas ventas al contado, otras a crédito)

RESULTADO:
  - TPV: ✅ SÍ (tiene presencial + casos inmediatos)
  - Crédito: ✅ SÍ (tiene casos diferidos)
  - Ambos módulos conviven en la misma aplicación
```

### Caso: Composición Multisede

```
composition.kind: "multisede"
sedes: ["Centro", "Norte"]

RESULTADO:
  - Agenda: Las citas se filtran por sede
  - Inventario: El stock es compartido o por sede (configurable)
  - Panel: Visibilidad restringida por sede (coordinador solo su sede)
```

### Caso: Datos Sensibles (RGPD)

```
datosSensibles: ["salud", "menores"]

RESULTADO:
  - Portal: ✅ SÍ (pero con acceso restringido)
  - Roles: Solo ciertos roles pueden ver datos sensibles
  - Bloqueo: No se inicia tratamiento sin consentimiento
```

---

## 6. Diagrama de Flujo Completo

```
┌─────────────────────────────────────────────────────────────────────┐
│ BusinessProfile JSON (input)                                        │
│ - organizacion, naturalezaBienes, procesos, cobros, calendario, ... │
└────────────────────────────┬────────────────────────────────────────┘
                             ↓
                    ┌────────────────┐
                    │   COMPOSITOR   │
                    │   normalize()  │
                    │   compose()    │
                    └────────┬───────┘
                             ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Normalized BusinessProfile                                          │
│ - arquetipos inferred                                               │
│ - composition (dominante + secundarios)                             │
│ - cobros normalized                                                 │
└────────────────────────────┬────────────────────────────────────────┘
                             ↓
                    ┌────────────────┐
                    │   DESIGNER     │
                    │ materialize()  │
                    │ toGeneratorIn()│
                    └────────┬───────┘
                             ↓
┌─────────────────────────────────────────────────────────────────────┐
│ GeneratorInput (input tipado)                                       │
│ - lifecycles[]                                                      │
│ - channels[], resourceSubtypes[], naturalezaBienes[]               │
│ - paymentMode, hasCalendar, hasPartes, hasMovimientos, ...        │
│ - ruleSet (políticas compiladas)                                   │
└────────────────────────────┬────────────────────────────────────────┘
                             ↓
        ┌────────────────────┴──────────────────────┐
        ↓                                            ↓
┌──────────────────┐                    ┌──────────────────────┐
│  RULES ENGINE    │                    │ PRESENTATION RULES   │
│ (módulos funcional)                   │ (paneles)            │
│                  │                    │                      │
│ FOR rule IN [    │                    │ IF capacidad_temporal│
│   ruleTpv,       │                    │   → panel_agenda     │
│   ruleCrm,       │──── matches ────→  │ IF intermediacion    │
│   ruleInventario,│                    │   → panel_retencion  │
│   ruleAgenda,    │                    │ IF suscripcion       │
│   ruleFacturacion,                    │   → panel_periodos   │
│   rulePortalCliente                   │ ...                  │
│ ]                │                    │                      │
│                  │                    │                      │
│ returns:         │                    │ returns:             │
│ ModuleMatch[]    │                    │ PresentationPanel[]  │
└────────┬─────────┘                    └──────────┬───────────┘
         │                                         │
         └────────────────────┬────────────────────┘
                              ↓
                    ┌──────────────────────┐
                    │ DECISION ENGINE      │
                    │ (módulos de UI)      │
                    │                      │
                    │ FOR each module:     │
                    │   check if panels    │
                    │   check conditions   │
                    │   decide active      │
                    │                      │
                    │ returns:             │
                    │ DecisionModulo[]     │
                    └──────────┬───────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────────┐
│ UiSpec (output)                                                     │
│ - modules[]: TPV, CRM, Inventario, Agenda, Facturación, Portal    │
│ - views[]: ~50-200 vistas según módulos                            │
│ - actions[]: ~100-500 acciones según transiciones                  │
│ - forms[], recorridos[], localization[]                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 7. Tabla de Referencia Rápida

### Qué Activa Cada Módulo

| Módulo | Condición Clave |
|--------|-----------------|
| **TPV** | `channels.presencial && paymentMode="inmediato" && archetype="venta"` |
| **CRM** | `hasPartes && isPipelineState` |
| **Inventario** | `naturalezaBienes.includes("propios_por_cantidad")` |
| **Agenda** | `resourceSubtypes.capacidad_temporal && hasCalendar` |
| **Facturación** | `hasMovimientos && hasFormalDocuments && hasFiscalCompliance` |
| **Portal** | `channels.autoservicio && visibility_para_cliente` |
| **Clientes** | Siempre |
| **Catálogo** | Siempre |
| **Dinero** | Siempre |
| **Facturas** | `hasFiscalCompliance \|\| hasFormalDocuments` |
| **Stock** | `propios_por_cantidad && mueveMercancia` |
| **Agenda (UI)** | `panel_agenda_presente` |
| **Cuotas** | `panel_periodos_presente` |
| **Fianzas** | `panel_retencion_presente` |
| **Crédito** | `panel_credito_presente \|\| paymentMode="diferido"` |
| **Portal (UI)** | `portal_filtro_presente` |

---

## Conclusión

Las decisiones de módulos en ABS siguen patrones claros y predecibles:

1. **Entrada bien definida**: BusinessProfile → GeneratorInput
2. **Reglas declarativas**: Las decisiones son visibles y auditables
3. **Determinista**: El mismo perfil siempre produce los mismos módulos
4. **Composable**: Los módulos se construyen en capas (funcionales → paneles → UI)
5. **Extensible**: Se pueden agregar nuevas reglas sin romper las existentes

Para debugging: Comienza por el GeneratorInput y sigue los árboles de decisión arriba. Si una condición no se cumple, el módulo no se activa.

