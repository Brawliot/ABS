# Runtime Architecture (Phase 2)

## Visión General

AppRuntime es la capa de orquestación central del servidor que gestiona la lógica de negocio. Phase 2 refactorizó sus ~2269 líneas en **8 módulos especializados** siguiendo un patrón factory function consistente.

```
AppRuntime (orquestador)
├── StockRuntimeFunctions (stock control)
├── ComprasRuntimeFunctions (purchase orders)
├── LogisticaRuntimeFunctions (shipments)
├── FacturasRuntimeFunctions (invoicing)
├── CobrosRuntimeFunctions (payments & financing)
├── TransaccionesRuntimeFunctions (transaction lifecycle)
├── CrmRuntimeFunctions (customer relations)
└── ContabilidadRuntimeFunctions (accounting)
```

## Módulos Extraídos

### 1. Stock Module (`runtime-stock.ts`)
**Responsabilidad**: Gestión de inventario de productos controlados

**Interface**: `StockRuntimeFunctions`
- `stock()` - Resumen de existencias y movimientos
- `configurarStock()` - Habilitar/deshabilitar control por producto
- `ajustarStock()` - Registrar entrada/salida/recuento
- `resumenStock()` - Productos con control activo
- `movimientosStockRecientes()` - Historial reciente
- `faltasStock()` - Productos insuficientes para expediente
- `obtenerProductosControlados()` - Catálogo controlado
- `marcarComoPerdido()` - Registrar pérdida
- `deshacerMovimiento()` - Revertir ajuste
- `actualizarMinimo()` - Cambiar umbral mínimo

**Almacenamiento**: `stockStore` (persistencia especializada)

**Validaciones**:
- Cantidad en milésimas (precisión)
- Control habilitado en producto
- Existencias disponibles

---

### 2. Compras Module (`runtime-compras.ts`)
**Responsabilidad**: Ciclo de vida de órdenes de compra

**Interface**: `ComprasRuntimeFunctions`
- `crearCompra()` - Registrar PO con líneas
- `recibirCompra()` - Confirmar recepción, ajustar stock
- `listarCompras()` - Órdenes filtradas por proveedor/estado
- `deudaConProveedor()` - Total pendiente de pago

**Integración**:
- Llama a `stockFunctions.ajustarStock()` al recibir
- Valida existencia de proveedor
- Verifica totales de líneas

**Validaciones**:
- Proveedor válido y no eliminado
- Cantidad > 0
- Total = suma de líneas

---

### 3. Logística Module (`runtime-logistica.ts`)
**Responsabilidad**: Gestión de envíos y entregas

**Interface**: `LogisticaRuntimeFunctions`
- `crearEnvio()` - Registrar nuevo envío
- `actualizarEnvio()` - Cambiar estado (preparado → enviado → entregado)
- `marcarEntregado()` - Confirmar recepción con firma
- `obtenerEnvio()` - Detalles de envío
- `historialEnvio()` - Eventos de un envío
- `pendientesDeEnviar()` - Expedientes sin confirmación

**Estado**: preparado → enviado → en_transito → entregado → devuelto

**Metadatos**: Proveedor logístico, número de seguimiento, fecha firma

---

### 4. Facturas Module (`runtime-facturas.ts`)
**Responsabilidad**: Facturación fiscal cumplida

**Interface**: `FacturasRuntimeFunctions`
- `facturacionDe()` - Estado de facturación de expediente
- `expedirFactura()` - Crear factura (completa/simplificada)
- `rectificarFactura()` - Rectificativa con motivo

**Decisión automática**: Tipo de factura según:
- Monto del expediente
- Datos del cliente (NIF, domicilio)
- Simplificada si < 300€ o datos incompletos

**Validaciones**:
- Emisor configurado (razón social, NIF, domicilio)
- Receptor válido (para facturas completas)
- Una factura vigente por expediente
- No duplicar rectificaciones

**Integración fiscal**: NIF normalizados, IVA desglosado, referencias expediente

---

### 5. Cobros Module (`runtime-cobros.ts`)
**Responsabilidad**: Pagos, financiación, gestión de crédito

**Interface**: `CobrosRuntimeFunctions`
- `registrarCobro()` - Pago contra expediente
- `cobrosDelExpediente()` - Historial de pagos
- `impagosDe()` - Días/recibos impagos de cliente
- `crearFinanciado()` - Plan de financiación con cuotas
- `financiadoDe()` - Estado de financiación
- `pagarCuotaFinanciado()` - Marcar cuota como pagada
- `creditoDelCliente()` - Límite/activo/disponible/bloqueo
- `establecerLimiteCredito()` - Asignar límite

**Amortización francesa**: Cálculo de cuota mensual con interés
```
cuota = (importe/100) * (tasaMensual * (1+tasaMensual)^n) / ((1+tasaMensual)^n - 1)
```

**Bloqueo de crédito**: Si existen impagos o cuotas vencidas

**Estados**: pendiente, pagada, cancelada

---

### 6. Transacciones Module (`runtime-transacciones.ts`)
**Responsabilidad**: Ciclo de vida de expedientes (ventas/servicios/compras)

**Interface**: `TransaccionesRuntimeFunctions`
- `datosDe()` - Proyección actual de expediente
- `estadoDe()` - Estado actual + tipo + label
- `puedeEditarDatos()` - ¿En estado inicial?
- `crearTransaccion()` - Alta con datos
- `editarTransaccion()` - Modificar datos en inicial

**Resolución de líneas**:
- Oferta referenciada → adopta precio/versión actual
- Sin oferta → precio manual (campo custom)
- IVA por defecto 21%

**Asignaciones automáticas**:
- `cliente_id` para archetype venta/servicio
- `proveedor_id` para compra

**Stock**: Auto-reserva de productos controlados al crear

**PII**: `assertNoPiiInEventData` antes de store

**Validaciones**:
- Parte existe y no está borrada
- Catálogo válido (si usa oferta)
- Cambios detectados antes de evento

---

### 7. CRM Module (`runtime-crm.ts`)
**Responsabilidad**: Relaciones con clientes, colaboración interna, auditoría

**Interface**: `CrmRuntimeFunctions`

**Notas**:
- `agregarNotaEnCliente()` - Só internos (rechazo si role="cliente")
- `notasDelCliente()` - Notas internas/externas filtradas
- `contarNotasDelCliente()` - Contador

**Contactos**:
- `registrarContacto()` - Nombre, teléfono, email, cargo
- `contactosDelCliente()` - Lista de contactos
- `establecerContactoPrincipal()` - Marcar preferente

**Tareas**:
- `crearTarea()` - Texto, vencimiento, prioridad, asignado
- `tareasDelCliente()` - Filtro: pendientes/todas
- `completarTarea()` - Marcar completada
- `contarTareas()` - Por estado

**Auditoría**:
- `registrarCambioAuditoria()` - Campo, valor anterior, nuevo, actor
- `auditoriaDe()` - Trail completo de cambios

---

### 8. Contabilidad Module (`runtime-contabilidad.ts`)
**Responsabilidad**: Asientos, balances, P&L, exportaciones fiscales

**Interface**: `ContabilidadRuntimeFunctions`

**Asientos** (doble entrada):
- `registrarAsiento()` - Débito/crédito con concepto
- `obtenerMayor()` - Movimientos de una cuenta
- `verificarCuadre()` - ¿Débitos = Créditos?

**Reportes**:
- `obtenerBalance()` - Activo (1xxx), Pasivo (2xxx), Capital (3xxx)
- `obtenerResultado()` - Ingresos (4xxx) - Gastos (5xxx)

**Exportaciones**:
- `exportarAsientosCSV()` - Formato Sage/Contaplus
- `exportarAsientosJSON()` - Backup estructurado

**Validaciones**:
- Importe > 0
- Cuentas existen
- Saldos actualizados

---

## Patrón Factory Function

Todos los módulos siguen:

```typescript
export interface XyzRuntimeFunctions {
  // Interface con métodos públicos
}

export function createXyzFunctions(runtime: AppRuntime): XyzRuntimeFunctions {
  return {
    // Métodos que usan runtime.* para acceder stores/métodos
  };
}
```

**Ventajas**:
- Encapsulamiento: métodos privados si necesarios
- Testability: inyección de runtime mock
- Independencia: no cross-references entre módulos
- Delegación clara: `AppRuntime.metodo()` → `this.xyzFunctions.metodo()`

---

## Integración en AppRuntime

```typescript
export class AppRuntime {
  // Propiedades
  readonly stockFunctions!: StockRuntimeFunctions;
  readonly comprasFunctions!: ComprasRuntimeFunctions;
  readonly logisticaFunctions!: LogisticaRuntimeFunctions;
  readonly facturasFunctions!: FacturasRuntimeFunctions;
  readonly cobrosFunctions!: CobrosRuntimeFunctions;
  readonly transaccionesFunctions!: TransaccionesRuntimeFunctions;
  readonly crmFunctions!: CrmRuntimeFunctions;
  readonly contabilidadFunctions!: ContabilidadRuntimeFunctions;

  constructor(...) {
    // Inicialización
    this.stockFunctions = createStockFunctions(this);
    this.comprasFunctions = createComprasFunctions(this);
    // ... etc
  }

  // Delegación (ejemplo)
  configurarStock(...): ReturnType {
    return this.stockFunctions.configurarStock(...);
  }
}
```

---

## Dependencias Entre Módulos

```
Transacciones
├─ stock (auto-reserva en alta)
└─ Stock (reservar productos)

Compras
└─ Stock (ajustarStock al recibir)

Cobros
├─ Transacciones (datosDe expediente)
└─ Cobros.registrar (almacenamiento)

Facturas
├─ Transacciones (datosDe expediente)
└─ Partes (receptorDe)

CRM, Logística, Contabilidad
└─ (independientes, low coupling)
```

**Regla**: Los módulos pueden leer de runtime, pero NO crean referencias circulares.

---

## Testing

Archivo: `runtime-modules.test.ts`

Cobertura:
- ✅ Crear funciones (sanity check)
- ✅ Validaciones de entrada
- ✅ Integración básica
- ✅ Mocks de dependencias

**Ejecutar**:
```bash
npm test -- runtime-modules.test.ts
```

---

## Métricas Phase 2

| Módulo | Líneas | Métodos | Interfaces |
|--------|--------|---------|-----------|
| Stock | 166 | 10 | 1 |
| Compras | 76 | 4 | 1 |
| Logística | 51 | 6 | 1 |
| Facturas | 154 | 3 | 1 |
| Cobros | 221 | 8 | 1 |
| Transacciones | 225 | 5 | 1 |
| CRM | 122 | 12 | 1 |
| Contabilidad | 244 | 7 | 1 |
| **TOTAL** | **1,259** | **55** | **8** |

**Reducción AppRuntime**: ~2269 líneas → ~800 líneas (delegación)

---

## Next Steps (Phase 3+)

1. ✅ **Testing** - Cobertura por módulo
2. ✅ **Documentación** - Esta guía
3. 🔄 **Cleanup** - Ver abajo
4. **Phase 4 (futuro)**:
   - Data stores refactoring (similar patrón)
   - Handler layers modularización
   - API routes por dominio

---

## Cleanup Checklist

- ✅ Imports organizados (sin ciclos)
- ✅ Tipos exportados correctamente
- ✅ Factory functions creadas
- ✅ Delegaciones en AppRuntime
- ✅ Tests unitarios
- 🔄 Lint/format pass
- 🔄 Circular dependency audit

