# Módulo Dashboard: Especificación Generada

## Resumen

El **módulo dashboard** es un módulo de presentación que genera **inteligencia de negocio** dividida en dos categorías:

1. **KPIs Operacionales**: Dinero, stock, compras que mueven el negocio hoy
2. **KPIs Empresariales**: Documentos, SLA, reputación, procesos que son meta-información

El dashboard se genera **dinámicamente** basándose en el perfil del negocio (GeneratorInput), decidiendo qué KPIs mostrar según los módulos activos y las características operacionales.

---

## Arquitectura

### Capa 0: Deducción (generator/rules/modules.ts)

```typescript
export const ruleDashboard: ModuleRule = {
  id: "rule.dashboard",
  moduleId: "mod.dashboard",
  labelKey: "module.dashboard",
  match: () => true, // Todo negocio necesita visibility
  resolve: (ctx) => {
    // Devuelve el módulo con roles (gerente, director, admin)
    // y canales (backoffice)
  },
};
```

**Regla**: El dashboard se activa **siempre**. Todo negocio necesita una vista consolidada de operación + empresa.

**Roles asignados**: Gerente, director, admin, analista.

**Canal**: Backoffice (o primer canal disponible).

---

### Capa 1: Especificación (generator/dashboard-generator.ts)

Define **qué KPIs** debería mostrar cada negocio según su perfil.

#### KPIs Operacionales (deducidos automáticamente)

Se activan según los módulos activos:

**Dinero** (módulo "dinero"):
- `op.ingresos_hoy`: Ingresos diarios
- `op.clientes_nuevos`: Nuevos clientes
- `op.pedidos_pendientes`: Flujo operacional

**Stock** (módulo "stock"):
- `op.stock_critico`: Alertas de abastecimiento
- `op.rotacion_inventario`: Eficiencia
- `op.valor_almacen`: Capital inmovilizado

**Compras** (hay mercancía propia):
- `op.ordenes_compra_abiertas`: Control de abastecimiento
- `op.llegadas_esperadas`: Planificación
- `op.variacion_precios_proveedores`: Control de costos

**Crédito** (módulo "credito"):
- `op.cuentas_por_cobrar`: Efectivo diferido
- `op.morosidad`: Riesgo crediticio

**Cuotas** (módulo "cuotas"):
- `op.mrr`: Ingresos recurrentes (predecibles)
- `op.churn_clientes`: Retención

---

#### KPIs Empresariales (deducidos automáticamente)

Se activan según características y módulos:

**Documentos** (si `hasFiscalCompliance` o `hasFormalDocuments`):
- `emp.documentos_vencidos`: Obligaciones legales
- `emp.pendientes_registro`: Cumplimiento

**SLA y Procesos** (si hay múltiples lifecycles o recursos):
- `emp.sla_incumplidos`: Calidad de servicio
- `emp.tareas_abiertas`: Trabajo en curso
- `emp.cambios_sin_documentar`: Trazabilidad

**Reputación - Cliente** (módulo "portal"):
- `emp.resenas_promedio`: Percepción
- `emp.nps_score`: Lealtad

**Reputación - Web** (canales públicos):
- `emp.posicion_seo`: Visibilidad orgánica
- `emp.trafico_web`: Interés de mercado
- `emp.conversion_rate`: Efectividad landing

---

### Capa 2: Presentación (presenter/dashboard-integrador.ts)

Orquesta:
1. **Generación de especificación** desde el perfil
2. **Generación de datos** (KPIs, gráficos, alertas)
3. **Renderización** en formato UI

```typescript
const spec = generateDashboardSpec(input);      // ← Qué mostrar
const generated = generarDashboardPara(ctx);    // ← Datos
const presentation = renderizarDashboard(generated); // ← Cómo mostrarlo
```

---

### Capa 3: UI (web/dashboard-estadisticas.ts)

**Reutiliza la estructura existente**:
- Gráficos de línea, pastel, barras
- Alertas activas
- Predicciones (forecast)

**Se parametriza con**:
- `DashboardSpec`: Lista de KPIs activos
- `KPIPeriodo`: Datos actuales
- `Alerta[]`: Alertas activas

---

## Flujo Completo

```
GeneratorInput (perfil del negocio)
        ↓
[ruleDashboard] → Deducir que existe mod.dashboard
        ↓
[generateDashboardSpec] → Listar KPIs activos
        ↓
[generarDashboardPara] → Calcular valores + gráficos
        ↓
[renderizarDashboard] → Estructura presentable
        ↓
UI (pestaña Dashboard, dos secciones: Operación | Empresa)
```

---

## Ejemplo: Tienda de Ropa

**Perfil**:
- Vende ropa (stock, cantidad)
- Tiene fiscal compliance (facturas)
- Vende presencial (TPV) + online
- No tiene cuotas ni portal

**Decisión de módulos**:
- `dashboard`: ✓ Activo
- `stock`: ✓ Activo (vende por cantidad)
- `dinero`: ✓ Activo
- `facturas`: ✓ Activo

**KPIs generados**:

**Operación** (4 KPIs):
- `op.ingresos_hoy`
- `op.clientes_nuevos`
- `op.stock_critico` ← Activo porque tiene stock
- `op.rotacion_inventario` ← Activo porque tiene stock

**Empresa** (3 KPIs):
- `emp.documentos_vencidos` ← Activo porque tiene fiscal
- `emp.pendientes_registro` ← Activo porque tiene fiscal
- `emp.trafico_web` ← Si tiene canal online

---

## Ejemplo: Asesoría Fiscal

**Perfil**:
- Vende servicios (consultoría)
- Tiene fiscal compliance + documentos formales
- Solo backoffice (sin público)
- Sin stock

**Decisión de módulos**:
- `dashboard`: ✓ Activo
- `stock`: ✗ Inactivo (no hay mercancía)
- `dinero`: ✓ Activo

**KPIs generados**:

**Operación** (3 KPIs):
- `op.ingresos_hoy`
- `op.clientes_nuevos`
- `op.pedidos_pendientes`

**Empresa** (5 KPIs):
- `emp.documentos_vencidos`
- `emp.pendientes_registro`
- `emp.sla_incumplidos` ← Activo (hay procesos)
- `emp.tareas_abiertas` ← Activo
- `emp.cambios_sin_documentar` ← Activo

---

## Integración en Presenter

El presenter debe:

1. **Recibir GeneratorInput** (decisiones ya tomadas)
2. **Llamar a generateDashboardSpec()** para deducir KPIs
3. **Pasar al GeneradorDashboard** con la especificación
4. **Renderizar** según `DashboardPresentation`

```typescript
// En el presenter, al renderizar un caso:
const spec = generateDashboardSpec(input);
const dashboard = generarDashboardPara({
  generatorInput: input,
  periodo: "2024-10",
  kpisPeriodo: metrics,
  historicoPeriodos: history,
  alertas: activeAlerts,
  datosSeries: timeseries,
});
const presentation = renderizarDashboard(dashboard);
// → presentation.tablas.operacion y presentation.tablas.empresa
```

---

## Próximos Pasos

- [ ] Integrar en la ruta `/dashboard` del presenter
- [ ] Tests para la deducción de KPIs
- [ ] Datos reales conectados a políticas (KPI engine, predicciones)
- [ ] Customización de orden/agrupación en UI según rol
- [ ] Exportación/descarga del dashboard

