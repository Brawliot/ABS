# Especificación de Módulos Base en ABS

## Resumen Ejecutivo

ABS (Arquitectura de Negocios Software) define una "lista base" o "especificación de software" que se genera dinámicamente para cada perfil de negocio. No es una lista estática, sino que se deduce mediante **reglas declarativas** basadas en las características del negocio.

Los módulos se generan en dos capas:
1. **Módulos funcionales (6 módulos)**: Etiquetas opcionales derivadas de reglas de deducción (TPV, CRM, Inventario, Agenda, Facturación, Portal Cliente)
2. **Módulos de presentación (10 módulos)**: Decisiones de UI que determinan qué características se activan en la interfaz (clientes, catálogo, dinero, facturas, stock, agenda, cuotas, fianzas, crédito, portal)

---

## 1. ¿Dónde se define QUÉ se genera?

### 1.1 Los Módulos Funcionales

**Archivo**: `/home/user/ABS/generator/rules/modules.ts`

Hay **6 módulos funcionales** definidos como reglas declarativas:

| Módulo | ID | Archivo | Descripción |
|--------|-----|---------|-------------|
| TPV | `mod.tpv` | `rules/modules.ts:35-56` | Punto de venta: canal presencial + pago inmediato |
| CRM | `mod.crm` | `rules/modules.ts:64-92` | Gestión de relación: partes + transacciones en pipeline |
| Inventario | `mod.inventario` | `rules/modules.ts:94-112` | Stock: bienes propios por cantidad |
| Agenda | `mod.agenda` | `rules/modules.ts:114-135` | Calendario: recursos de capacidad temporal |
| Facturación | `mod.facturacion` | `rules/modules.ts:137-167` | Documentos: movimientos + cumplimiento fiscal |
| Portal Cliente | `mod.portal_cliente` | `rules/modules.ts:169-197` | Autoservicio: acceso cliente a sus datos |

**Catálogo de reglas**:
```typescript
export const MODULE_RULES: readonly ModuleRule[] = [
  ruleTpv,
  ruleCrm,
  ruleInventario,
  ruleAgenda,
  ruleFacturacion,
  rulePortalCliente,
];
```

### 1.2 Los Módulos de Presentación

**Archivo**: `/home/user/ABS/generator/rules/modules.ts:225-321`

Hay **10 módulos de presentación** que determinan qué aparece en la UI:

| Módulo | ID | Activo si | Descripción |
|--------|-----|----------|-------------|
| Clientes | `clientes` | Siempre | Todo negocio intercambia con alguien |
| Catálogo | `catalogo` | Siempre | Todo negocio ofrece algo con un precio |
| Dinero | `dinero` | Siempre | Todo negocio cobra y paga |
| Facturas | `facturas` | `hasFiscalCompliance \|\| hasFormalDocuments` | Obligaciones fiscales o documentos formales |
| Stock | `stock` | `vendePorCantidad AND mueveMercancia` | Vende productos propios que se cuentan |
| Agenda | `agenda` | `panel_agenda` presente | Trabaja con citas o capacidad por horas |
| Cuotas | `cuotas` | `panel_periodos` presente | Cobra suscripciones o cuotas periódicas |
| Fianzas | `fianzas` | `panel_retencion` presente | Retiene fianzas o dinero de terceros |
| Crédito | `credito` | `panel_credito \|\| paymentMode=diferido` | Vende a crédito o a plazos |
| Portal | `portal` | `portal_filtro` presente | Sus clientes consultan sus pedidos |

---

## 2. ¿Cómo se DECIDE qué generar?

### 2.1 Flujo General de Decisión

```
BusinessProfile (JSON)
        ↓
[COMPOSITOR] normalizeBusinessProfile + composeBusinessProfile
        ↓
BusinessProfile normalizado (con arquetipos y composición)
        ↓
[DESIGNER] businessProfileToGeneratorInput
        ↓
GeneratorInput (datos tipados para el generador)
        ↓
[GENERATOR] deduceModules(input) + decidirModulos(input)
        ↓
Módulos seleccionados → UiSpec (especificación de UI)
```

### 2.2 Entrada: GeneratorInput

**Archivo**: `/home/user/ABS/generator/types.ts:44-71`

El `GeneratorInput` contiene:

```typescript
interface GeneratorInput {
  readonly caseId: string;
  readonly lifecycles: readonly LifecycleSlice[];
  readonly composition?: ComposedArchetypeSpec;
  readonly ruleSet: CompiledRuleSet;
  readonly roles: readonly RoleDef[];
  readonly channels: readonly PresentationChannel[];
  readonly resourceSubtypes: readonly RecursoSubtype[];
  readonly naturalezaBienes: readonly NaturalezaBien[];
  readonly paymentMode: PaymentMode;
  readonly hasPartes: boolean;
  readonly hasMovimientos: boolean;
  readonly hasFormalDocuments: boolean;
  readonly hasFiscalCompliance: boolean;
  readonly hasCalendar: boolean;
  // ...
}
```

### 2.3 Reglas de Deducción (Módulos Funcionales)

Cada regla tiene una función `match()` que verifica si aplica:

#### Regla TPV (Punto de Venta)
```typescript
match: (ctx) =>
  ctx.channels.includes("presencial") &&
  ctx.paymentMode === "inmediato" &&
  ctx.lifecycles.some((l) => l.archetypeId === "venta")
```
**Se activa si**: El negocio vende en presencial Y cobra al momento Y tiene un ciclo de venta.

#### Regla CRM
```typescript
match: (ctx) => {
  if (!ctx.hasPartes) return false;
  return ctx.lifecycles.some((l) =>
    l.lifecycle.states.some((s) => isPipelineState(s.id, s.kind))
  );
}
```
**Se activa si**: El negocio tiene Partes (clientes/proveedores) Y tiene estados de pipeline (propuesta, solicitud, prospecto).

#### Regla Inventario
```typescript
match: (ctx) =>
  ctx.naturalezaBienes.includes("propios_por_cantidad")
```
**Se activa si**: El negocio vende bienes propios que se cuentan por cantidad.

#### Regla Agenda
```typescript
match: (ctx) =>
  ctx.resourceSubtypes.includes("capacidad_temporal") && ctx.hasCalendar
```
**Se activa si**: El negocio trabaja con recursos de capacidad temporal (horas) Y tiene calendario.

#### Regla Facturación
```typescript
match: (ctx) =>
  ctx.hasMovimientos &&
  ctx.hasFormalDocuments &&
  ctx.hasFiscalCompliance
```
**Se activa si**: El negocio tiene movimientos, documentos formales Y cumplimiento fiscal.

#### Regla Portal Cliente
```typescript
match: (ctx) => {
  if (!ctx.channels.includes("autoservicio")) return false;
  return ctx.ruleSet.rules.some(
    (r) =>
      r.kind === "visibility" &&
      r.allowedRoles.some(
        (role) =>
          role.toLowerCase().includes("cliente") ||
          role.toLowerCase().includes("parte")
      )
  );
}
```
**Se activa si**: El negocio tiene canal autoservicio Y hay reglas que permiten a clientes ver datos.

### 2.4 Paneles de Presentación

**Archivo**: `/home/user/ABS/generator/presentation-rules.ts:66-226`

Los paneles se derivan de "señales" tipadas del núcleo:

| Panel | Condición | Módulo de UI resultante |
|-------|-----------|------------------------|
| `panel_agenda` | `resourceSubtypes.includes("capacidad_temporal")` | `agenda` |
| `panel_retencion` | `hasRetencion (intermediacion or (uso_temporal + pideFianza))` | `fianzas` |
| `panel_periodos` | `lifecycles.some(l => l.archetypeId === "suscripcion")` | `cuotas` |
| `panel_credito` | `lifecycles.some(l => l.archetypeId === "financiera")` | `credito` |
| `panel_bloqueo` | `composition.secondaries` | (bloqueos) |
| `portal_filtro` | `hasAutoservicio AND portalVisibilityRoles().length > 0` | `portal` |

### 2.5 Decisión de Módulos de Presentación

**Archivo**: `/home/user/ABS/generator/rules/modules.ts:247-317`

La función `decidirModulos()` evalúa cada módulo:

```typescript
const vendePorCantidad = input.naturalezaBienes.includes("propios_por_cantidad");
const mueveMercancia = [...arquetipos].some((a) => 
  ARQUETIPOS_CON_MERCANCIA.has(a)
);

return [
  d("clientes", "Clientes y proveedores", true, 
    "Todo negocio intercambia con alguien.", ""),
  d("catalogo", "Catálogo", true, 
    "Todo negocio ofrece algo con un precio.", ""),
  d("dinero", "Dinero", true, 
    "Todo negocio cobra y paga.", ""),
  d("facturas", "Facturas", 
    input.hasFiscalCompliance || input.hasFormalDocuments, ...),
  d("stock", "Stock", 
    vendePorCantidad && mueveMercancia, ...),
  // ... etc
];
```

---

## 3. ¿Dónde está esa lógica de decisión?

### 3.1 Stack de Decisión

| Componente | Archivo | Responsabilidad |
|------------|---------|-----------------|
| **Compositor** | `composer/` | Convierte BusinessProfile a datos tipados (arquetipos, ciclos de vida, reglas) |
| **Designer** | `design/` | Mapea BusinessProfile a GeneratorInput |
| **Generator** | `generator/` | Aplica reglas de deducción para seleccionar módulos |
| **Presentation** | `presentation/` | Define estructura de paneles y vistas |

### 3.2 Generador: El Corazón de la Decisión

**Archivo principal**: `/home/user/ABS/generator/generate.ts:330-358`

La función `generateUiSpec()` es el punto de entrada:

```typescript
export function generateUiSpec(
  input: GeneratorInput,
  options: GenerateOptions = {}
): ValidatedUiSpec {
  const matches = deduceModules(input);              // Aplica reglas
  const { views, actions } = buildActionsAndViews(input);
  const panels = derivePresentationPanels(input);    // Deriva paneles
  const { modules, moduleRecorridos } = buildModuleTags(
    matches, views, actions                          // Etiqueta módulos
  );
  // ... rest
}
```

La función `deduceModules()` itera sobre todas las reglas:

```typescript
export function deduceModules(ctx: GeneratorInput): ModuleMatch[] {
  const out: ModuleMatch[] = [];
  for (const rule of MODULE_RULES) {
    const m = rule.resolve(ctx);
    if (m) out.push(m);
  }
  return out.sort((a, b) => a.moduleId.localeCompare(b.moduleId));
}
```

---

## 4. ¿Se puede PERSONALIZAR/CONFIGURAR?

### 4.1 Personalización Estática (Reglas de Negocio)

Sí, mediante **políticas** (`RuleSet`) que se compilan y afectan las decisiones:

```typescript
// El ruleSet contiene reglas de visibility, guard, etc.
const ruleSet = compilePolicies(businessProfile);

// Se pasan al GeneratorInput
const input = businessProfileToGeneratorInput(profile, ruleSet);

// Las reglas de presentation verifican ruleSet.rules
const portalRoles = portalVisibilityRoles(input);
// Si hay reglas visibility para "cliente" → se activa Portal
```

### 4.2 Personalización Dinámica (Overlay)

Sí, mediante `PresentationOverlay`:

```typescript
export function generateUiSpec(
  input: GeneratorInput,
  options: GenerateOptions = {}
): ValidatedUiSpec {
  // ...
  const merged = applyOverlay(
    { /* UiSpec generada */ },
    options.overlay  // Puede modificar módulos, vistas, acciones
  );
}
```

### 4.3 Extensibilidad: Plugin System

**Archivo**: `/home/user/ABS/generator/plugin-system.ts`

Permite registrar handlers personalizados:

```typescript
const pluginManager = new PluginManager();
// Los plugins pueden interceptar decisiones
```

### 4.4 Cambio de Reglas

**Para agregar un nuevo módulo**:

1. Crear la regla en `/home/user/ABS/generator/rules/modules.ts`
2. Registrar en `MODULE_RULES`
3. Opcionalmente, agregar un panel en `presentation-rules.ts`

Ejemplo (hipotético):
```typescript
export const ruleLogistica: ModuleRule = {
  id: "rule.logistica",
  moduleId: "mod.logistica",
  labelKey: "module.logistica",
  match: (ctx) =>
    ctx.channels.includes("ecommerce") &&
    ctx.naturalezaBienes.includes("propios_por_cantidad"),
  resolve: (ctx) => {
    if (!ruleLogistica.match(ctx)) return null;
    return {
      ruleId: ruleLogistica.id,
      moduleId: ruleLogistica.moduleId,
      labelKey: ruleLogistica.labelKey,
      channel: "backoffice",
      roleIds: rolesByHint(ctx, ["logistica", "almacen"]),
      lifecycleIds: [],
    };
  },
};

MODULE_RULES.push(ruleLogistica);
```

---

## 5. ¿Qué módulos existen actualmente?

### 5.1 Módulos Funcionales Completos

| Módulo | Cuándo | Roles | Ciclos de Vida |
|--------|--------|-------|----------------|
| **TPV** | Venta presencial + pago inmediato | cajero, vendedor, tpv | ciclos de venta |
| **CRM** | Partes + pipeline (propuesta/solicitud/prospecto) | comercial, vendedor, crm, gerente | ciclos con pipeline |
| **Inventario** | Bienes propios por cantidad | almacen, inventario, operaciones | (no vinculado a ciclo específico) |
| **Agenda** | Recursos capacidad temporal + calendario | taller, agenda, servicio, operaciones | ciclos tipo servicio o taller |
| **Facturación** | Movimientos + documentos formales + cumplimiento fiscal | finanzas, factura, contabilidad, gerente | ciclos venta + financiera |
| **Portal Cliente** | Canal autoservicio + visibilidad para cliente | cliente, parte | todos los ciclos |

### 5.2 Módulos de Presentación Completos

| Módulo | Usuarios | Qué ven |
|--------|----------|---------|
| **Clientes** | Todos | Partes (clientes, proveedores) |
| **Catálogo** | Todos | Precios y ofertas |
| **Dinero** | Finanzas, gerente | Movimientos, tesorería |
| **Facturas** | Finanzas, gerente | Documentos fiscales |
| **Stock** | Almacen, operaciones | Inventario, movimientos |
| **Agenda** | Taller, agenda | Citas, disponibilidad |
| **Cuotas** | Finanzas, comercial, gerente | Períodos de suscripción |
| **Fianzas** | Finanzas, gerente, operaciones | Dinero retenido de terceros |
| **Crédito** | Finanzas, gerente, comercial | Créditos y plazos |
| **Portal** | Cliente, parte | Su información (pedidos, presupuestos) |

---

## 6. Ejemplos: Qué se genera para cada Perfil

### 6.1 Perfiles de Muestra

**Archivo**: `/home/user/ABS/contracts/business-profile/samples/business-profiles-10.json`

10 perfiles sintéticos realistas para probar la expresividad del contrato.

### 6.2 Análisis por Perfil

#### **p01 - Peluquería de Barrio**

**Características**:
- 4 personas (1 dueña, 3 peluqueras)
- Trabaja con cita, aunque coge a quien entre
- Vende champus y tintes
- Cobra al momento (tarjeta o efectivo)
- No tiene crédito ni multisede

**GeneratorInput deducido**:
- `channels`: ["presencial", "backoffice"]
- `naturalezaBienes`: ["propios_por_cantidad"] (productos de mostrador)
- `paymentMode`: "inmediato"
- `hasCalendar`: true (tieneCitas)
- `hasPartes`: true (clientes)
- `hasFiscalCompliance`: true (facturación simplificada)

**Módulos generados**:
- ✅ TPV: presencial + inmediato + venta
- ❌ CRM: no tiene pipeline
- ✅ Inventario: propios_por_cantidad
- ✅ Agenda: capacidad temporal (citas)
- ✅ Facturación: hasFiscalCompliance
- ✅ Portal Cliente: citas online

**Módulos de Presentación**:
- ✅ Clientes, Catálogo, Dinero, Facturas, Stock, Agenda, Portal

---

#### **p02 - Clínica Dental**

**Características**:
- 9 personas, 2 sedes
- Presupuestos de tratamiento + pagos a plazos
- Historias clínicas (RGPD)
- Multisede

**GeneratorInput deducido**:
- `channels`: ["presencial", "backoffice"]
- `naturalezaBienes`: ["propios_por_cantidad"]
- `paymentMode`: "diferido" (plazos propios + financiera)
- `hasCalendar`: true
- `composition`: MULTISEDE
- `datosSensibles`: ["salud"]
- `hasFiscalCompliance`: true

**Módulos generados**:
- ✅ TPV: venta presencial inmediata (cuando hay pago al contado)
- ✅ CRM: presupuestos = pipeline (propuesta)
- ✅ Inventario: material de consulta
- ✅ Agenda: por sede y profesional
- ✅ Facturación: documentos + cumplimiento
- ✅ Portal Cliente: citas, presupuestos (no historia clínica completa)

**Módulos de Presentación**:
- ✅ Clientes, Catálogo, Dinero, Facturas, Stock, Agenda, Crédito, Portal
- 🎯 Nota: RGPD restringe roles a "profesional sanitario" para historia clínica

---

#### **p04 - Taller Mecánico**

**Características**:
- Diagnóstico → presupuesto → aceptación → reparación → cobro
- Servicios (reparación en talleres)
- Bienes propios (piezas) + bienes del cliente (vehículos)
- Presupuestos + bloqueos de composición
- Cobro a la entrega (fianza de depósito)

**GeneratorInput deducido**:
- `channels`: ["taller", "backoffice"]
- `naturalezaBienes`: ["propios_por_cantidad", "del_cliente"]
- `paymentMode`: "inmediato" (pago al recoger)
- `hasCalendar`: true (citas para recepción)
- `composition`: Secundario = "servicio_proyecto" (reparación)
  - Dominante = "venta" (no, es servicio)
- `hasFormalDocuments`: true (presupuesto por escrito)
- `resourceSubtypes`: ["capacidad_temporal"] (horas en taller)

**Módulos generados**:
- ✅ Agenda: taller (capacidad temporal)
- ✅ Inventario: piezas (propios_por_cantidad)
- ✅ Facturación: presupuestos + reparaciones
- ❌ TPV: no es canal presencial puro
- ✅ CRM: presupuesto = propuesta

**Módulos de Presentación**:
- ✅ Clientes, Catálogo, Dinero, Facturas, Stock, Agenda
- ✅ Cuotas: (si hay plazos)
- 🎯 Bloqueo de composición: "no se repara sin presupuesto aceptado"

---

#### **p06 - Gestoría**

**Características**:
- Servicio puro (sin bienes)
- 200 clientes, cobro cuota mensual (domiciliada)
- Procesos recurrentes (trimestrales, renta)
- Plazos legales críticos
- Datos económicos (RGPD)

**GeneratorInput deducido**:
- `channels`: ["backoffice", "web"] (portal cliente)
- `naturalezaBienes`: [] (no tiene bienes)
- `paymentMode`: "diferido" (cuota mensual domiciliada)
- `composition`: Archetipo dominante = "suscripcion"
- `hasCalendar`: true (temporadas, picos)
- `hasFiscalCompliance`: true (plazos de presentación)
- `datosSensibles`: ["economicos"]

**Módulos generados**:
- ✅ Agenda: (si hay citas ocasionales)
- ✅ Facturación: presentaciones + cumplimiento
- ✅ Portal Cliente: documentos, estado de presentaciones
- ✅ Panel Cuotas: suscripción (cuota mensual)
- ❌ Inventario: no tiene bienes

**Módulos de Presentación**:
- ✅ Clientes, Catálogo, Dinero, Facturas, Cuotas, Portal
- 🎯 Nota: Calendario fiscal (plazos externos) es crítico

---

#### **p07 - Tienda Online de Cosmética**

**Características**:
- Ecommerce puro
- Venden en todo España con envíos
- Devoluciones en 14 días
- Fabricación por lotes (propios + comprados)
- Cobro online antes de envío

**GeneratorInput deducido**:
- `channels`: ["web", "backoffice"]
- `naturalezaBienes`: ["propios_por_cantidad"]
- `paymentMode`: "inmediato" (pago previo al envío)
- `resourceSubtypes`: ["capacidad_temporal"] (lotes de producción)
- `hasCalendar`: true (horario de envíos)
- `composition`: Archetipo dominante = "venta" (online)
- `hasFormalDocuments`: true (desistimiento 14 días)

**Módulos generados**:
- ✅ TPV: canal web + pago inmediato + venta
- ✅ Inventario: propios_por_cantidad + lotes
- ✅ Facturación: cumplimiento (desistimiento, etiquetado)
- ✅ Portal Cliente: pedidos, seguimiento, devoluciones
- ❌ Agenda: no trabaja con citas

**Módulos de Presentación**:
- ✅ Clientes, Catálogo, Dinero, Facturas, Stock, Portal
- 🎯 Nota: Lotes y caducidades requieren trazabilidad

---

#### **p08 - Alquiler de Maquinaria**

**Características**:
- Alquiler por días/semanas de maquinaria
- Multisede (2 naves)
- Fianzas retidas y liquidadas
- Crédito a constructoras (plazo 30 días)
- Revisión de máquinas tras devolución

**GeneratorInput deducido**:
- `channels`: ["backoffice", "web"]
- `naturalezaBienes`: ["propios_unitarios", "propios_por_cantidad"]
- `paymentMode`: "mixto" (al contado + crédito a 30 días)
- `composition`: Archetipo dominante = "uso_temporal"
- `hasRetencion`: true (fianzas por alquiler)
- `resourceSubtypes`: ["retornable"] (máquinas que se devuelven)

**Módulos generados**:
- ✅ Inventario: maquinaria
- ✅ Agenda: entregas/recogidas programadas
- ✅ Facturación: contratos
- ✅ Panel Fianzas: retención y liquidación
- ✅ Panel Crédito: límite de crédito a clientes
- ✅ Portal Cliente: alquileres activos, prórroga

**Módulos de Presentación**:
- ✅ Clientes, Catálogo, Dinero, Facturas, Stock, Agenda, Fianzas, Crédito, Portal
- 🎯 Bloqueo: "no se vuelve a alquilar sin revisión"
- 🎯 Nota: Multisede con traspasos de unidades

---

#### **p09 - Academia de Idiomas**

**Características**:
- 3 centros con cursos
- Matrícula + cuota mensual domiciliada
- Padres ven datos de hijos (menor + tutor)
- Grupos por nivel y horario fijo
- Curso académico como temporada

**GeneratorInput deducido**:
- `channels`: ["backoffice", "web"]
- `composition`: Archetipo dominante = "suscripcion"
- `paymentMode`: "diferido" (cuota mensual)
- `hasCalendar`: true (curso académico, turnos)
- `datosSensibles`: ["menores"]
- `resourceSubtypes`: ["capacidad_temporal"] (grupos en horario)

**Módulos generados**:
- ✅ Agenda: horarios de clases por centro
- ✅ Panel Cuotas: cuota mensual
- ✅ Facturación: recibos
- ✅ Portal Cliente: padres ven asistencia, notas de sus hijos
- ❌ Inventario: material didáctico marginal

**Módulos de Presentación**:
- ✅ Clientes, Catálogo, Dinero, Facturas, Agenda, Cuotas, Portal
- 🎯 Nota: Visibilidad delegada (padre → hijo)
- 🎯 Restricción por rol: profesor solo ve sus grupos, coordinador solo su centro

---

#### **p10 - Empresa de Reformas**

**Características**:
- Obras a medida con presupuesto + contrato
- Cobro por fases (30% inicio, 40% mitad, 30% fin)
- Subcontratación (fontanería, electricidad)
- Varias obras en paralelo
- Garantía post-entrega

**GeneratorInput deducido**:
- `channels`: ["backoffice"]
- `paymentMode`: "diferido" (por hitos)
- `composition`: Archetipo dominante = "servicio_proyecto"
- `hasFormalDocuments`: true (contrato, certificaciones)
- `hasFiscalCompliance`: true (gestion de residuos)
- `resourceSubtypes`: ["proyecto"] (obra como recurso)

**Módulos generados**:
- ✅ Facturación: certificaciones por fase
- ✅ Panel Pagos por Hitos: 30%-40%-30%
- ❌ Inventario: no, material por obra (no stock)
- ❌ Agenda: no, visitación esporádica
- ✅ Portal Cliente: (si lo hay) estado de la obra

**Módulos de Presentación**:
- ✅ Clientes, Catálogo, Dinero, Facturas
- 🎯 Bloqueo: "no se empieza sin contrato + primer pago"
- 🎯 Bloqueo: "no se certifica siguiente fase sin cobrar anterior"

---

## 7. Tabla Comparativa de Módulos por Perfil

| Perfil | TPV | CRM | Inv | Agen | Fact | Portal | Stock | Cuota | Fianza | Crédito |
|--------|-----|-----|-----|------|------|--------|-------|-------|--------|---------|
| p01 - Peluquería | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| p02 - Clínica | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| p03 - Ferretería | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| p04 - Taller | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| p05 - Restaurante | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| p06 - Gestoría | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| p07 - Tienda Online | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| p08 - Alquiler | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| p09 - Academia | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| p10 - Reformas | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 8. Reglas que Determinan qué se Incluye

### 8.1 Matriz de Decisión

```
Pregunta al perfil          → Resultado en GeneratorInput      → Módulos activados
──────────────────────────────────────────────────────────────────────────────────
¿Vende algo?                 → naturalezaBienes != empty       → Catálogo, Dinero, Stock
¿Cobra al momento?           → paymentMode="inmediato"         → TPV (si presencial)
¿Cobra a plazos?             → paymentMode="diferido"          → Crédito
¿Cobra cuotas periódicas?    → hasCuotasRecurrentes=true       → Cuotas
¿Trabaja con citas?          → hasCalendar=true                → Agenda
¿Retiene fianzas?            → pideFianza=true                 → Fianzas
¿Tiene documentos formales?  → hasFormalDocuments=true         → Facturas
¿Tiene carga fiscal?         → hasFiscalCompliance=true        → Facturas
¿Tiene clientes públicos?    → channels.includes("autoservicio") → Portal
¿Tiene partes en pipeline?   → hasPartes && isPipeline         → CRM
```

### 8.2 Prioridad y Exclusiones

Algunas decisiones son excluyentes:

```typescript
// Si no tiene naturalezaBienes propios_por_cantidad, NO se activa Stock
vendePorCantidad = input.naturalezaBienes.includes("propios_por_cantidad");

// Si arquitectura no incluye "venta" o "servicio_proyecto", NO hay mercancia
mueveMercancia = [...arquetipos].some((a) => 
  ["venta", "servicio_proyecto"].has(a)
);

// Stock = vendePorCantidad AND mueveMercancia
```

---

## 9. Flujo Completo: De Perfil a Módulos

```
ENTRADA: BusinessProfile (JSON)
  ├─ organizacion.roles
  ├─ naturalezaBienes
  ├─ calendario.tieneCitas
  ├─ procesos[]
  ├─ cobros.aCredito, aPlazos, fianzas, cuotasRecurrentes
  ├─ portalCliente.autoservicio
  └─ cumplimiento[]

         ↓ [COMPOSITOR]

PASO 1: Normalización
  - Resolver cobros=null, aPlazos/aCredito unknown
  - Mapear procesos a arquetipos (venta, servicio, suscripcion, etc.)
  - Infer dominante archetype

         ↓ [DESIGNER]

PASO 2: Materialización
  - Invocar arquetipos (life cycles)
  - Compilar reglas de negocio (políticas)
  - Construir composition (dominante + secundarios)

         ↓ [DESIGNER → GeneratorInput]

PASO 3: Tipado
  - channels: infer de procesos y canales
  - naturalezaBienes: mantener/validar
  - paymentMode: infer de cobros
  - hasCalendar: de calendario.tieneCitas
  - hasPartes: de roles + procesos
  - lifecycle slices: de procesos

         ↓ [GENERATOR]

PASO 4: Deducción de Módulos
  FOR cada rule EN MODULE_RULES:
    IF rule.match(input):
      modules.push(rule.resolve(input))

         ↓ [GENERATOR]

PASO 5: Derivación de Paneles
  - Detectar panel_agenda si capacidad_temporal
  - Detectar panel_retencion si intermediacion o (uso_temporal + fianza)
  - Detectar panel_credito si financiera
  - Detectar panel_periodos si suscripcion
  - Detectar portal_filtro si autoservicio + visibility

         ↓ [GENERATOR]

PASO 6: Decisión de Módulos de UI
  - clientes, catalogo, dinero: siempre
  - facturas: si hasFiscalCompliance OR hasFormalDocuments
  - stock: si naturalezaBienes="propios_por_cantidad" AND mueveMercancia
  - agenda: si panel_agenda presente
  - cuotas: si panel_periodos presente
  - fianzas: si panel_retencion presente
  - credito: si panel_credito presente OR paymentMode="diferido"
  - portal: si portal_filtro presente

         ↓

SALIDA: UiSpec
  - modules[]: TPV, CRM, Inventario, Agenda, Facturación, Portal
  - views[]: 50-200 vistas según módulos activados
  - actions[]: 100-500 acciones según transiciones permitidas
  - forms[]: Formularios para datos de negocio
  - recorridos[]: Flujos de usuario
  - localization[]: Etiquetas en español
```

---

## 10. Resumen de la Arquitectura de Decisión

### Principios Clave

1. **Declarativo**: Las reglas son datos, no código procedural
2. **Determinista**: El mismo perfil siempre produce los mismos módulos
3. **Acumulativo**: Los módulos se agregan según condiciones; no hay estado
4. **Compuesto**: Las decisiones de módulos dependen de decisiones de paneles
5. **Extensible**: Se pueden agregar nuevas reglas sin modificar existentes

### Capas de Decisión

| Capa | Responsable | Entrada | Salida |
|------|-------------|---------|--------|
| **Normalización** | Compositor | BusinessProfile JSON | BusinessProfile tipado |
| **Materialización** | Designer | BusinessProfile tipado | GeneratorInput |
| **Deducción** | Generator (reglas) | GeneratorInput | ModuleMatch[] |
| **Presentación** | Generator (paneles) | GeneratorInput | PresentationPanelDecl[] |
| **UI** | Generator (decisión) | ModuleMatch[] + Paneles | UiSpec |

### Velocidad de Decisión

```
GeneratorInput creado (O(1))
  → deduceModules() en O(m) donde m = módulos (6 actualmente)
    → cada rule.match() en O(n) donde n = ciclos/roles (10-30)
  → derivePresentationPanels() en O(m) donde m = módulos (10)
  → decidirModulos() en O(10) módulos de UI

Total: O(n) ≈ 10-300ms para un perfil típico
```

---

## 11. Archivos Clave para Consulta

| Archivo | Líneas | Responsabilidad |
|---------|--------|-----------------|
| `/generator/rules/modules.ts` | 322 | Reglas de deducción de módulos |
| `/generator/types.ts` | 90 | Tipo GeneratorInput |
| `/generator/generate.ts` | 500+ | Punto de entrada generateUiSpec |
| `/generator/presentation-rules.ts` | 269 | Derivación de paneles |
| `/composer/compose.ts` | 400+ | Compositor: BusinessProfile → datos tipados |
| `/contracts/business-profile/types.ts` | - | Esquema BusinessProfile |
| `/contracts/business-profile/samples/business-profiles-10.json` | 1437 | 10 perfiles de prueba |

---

## Conclusión

La "lista base" de módulos en ABS **no es estática**, sino que se genera dinámicamente mediante:

1. **6 reglas funcionales** que detectan capacidades (TPV, CRM, Inventario, Agenda, Facturación, Portal)
2. **10 módulos de presentación** que se activan según paneles derivados
3. Una **arquitectura de decisión en 3 capas** (Compositor → Designer → Generator)
4. **Señales tipadas** extraídas del perfil de negocio

Cada perfil define qué módulos se generan mediante sus características (naturaleza de bienes, canales, modelos de pago, ciclos de vida). Las decisiones son **deterministas, auditables y extensibles**.

