# Capa 0 - Completitud para MVP

## 4 Items Faltantes Identificados en Auditoría

### 1. E2E Happy Path + Exception por Arquetipo

**Estado Actual:** PARCIAL  
**Que Falta:** Walk completo de flujo feliz (happy path) + manejo de excepciones por cada uno de los 6 arquetipos

**Implementación Requerida:**
```typescript
// Para cada arquetipo (venta, compra, servicio, servicio_proyecto, financiera, suscripcion):
// 1. Happy Path: propuesta → ... → estado terminal
// 2. Exception: intento de transición inválida → rechazada → re-intento desde mismo estado

describe("venta: happy path + exception", () => {
  it("happy path: propuesta → aceptada → en_entrega → cerrada", () => {
    // Simula secuencia completa de eventos hasta cierre
    const events = [
      crearVentaEvent(...),
      aceptarVentaEvent(...),
      entregarVentaEvent(...),
      cerrarVentaEvent(...)
    ];
    
    const derived = deriveState(ventaLifecycle, events);
    expect(derived.currentStateId).toBe("cerrada");
  });
  
  it("exception: rechazo en t_aceptar → venta sigue en propuesta", () => {
    // Intento de aceptar sin cumplir condición → debe fallar
    // Máquina permanece en propuesta, permitiendo re-intento
  });
});
```

### 2. Las 7 Rupturas del Audit

**Estado Actual:** PARCIAL (5/7 son solo checks de forma, no walks)  
**Definición:** Escenarios de ruptura = casos límite donde el modelo debe soportar complejidad de negocio real

**Las 7 Rupturas Documentadas:**

| # | Escenario | Descripción | Modelo de Capa 0 |
|---|-----------|-------------|------------------|
| 1 | Entregas parciales | Pedido con múltiples entregas (tramos/hitos) | `t_entrega_parcial` + compromiso por tramo |
| 2 | Renegociación de precio | Cambio de precio tras aceptación | Nueva `oferta_version` + `t_aceptar_nueva_version` |
| 3 | Devolución después del cierre | TX terminada, se crea devolución vinculada | Terminal no reabre; `createDevolucionVinculada` crea TX nueva |
| 4 | Pago dividido entre 3 partes | Múltiples proveedores/clientes en una TX | `Movimiento.parte_id` multiparte + cierre exige saldo 0 por parte |
| 5 | Suscripción pausada | Pausa temporal de servicio | Estado `en_espera` + `t_pausar` / `t_reanudar` |
| 6 | Marketplace con disputa | Retención de fondos en disputa | Estado `en_disputa` + retención liberable/reembolsable |
| 7 | Sin arquetipo | Negocio no encaja en modelo | `NoArchetypeMatchError` con 2 arquetipos cercanos |

**Diferencia Crítica:**
- **Cobertura Estructural (actual):** "¿Existen transiciones/estados que modelan esto?" → STRING SEARCH
- **Walk de Eventos (requerido):** "¿Puedo completar una TX real que pase por este escenario?" → EJECUCIÓN

### 3. Test Dedicado a "Forzado del Núcleo"

**Estado Actual:** IMPLEMENTADO pero SIN PRUEBA  
**Código Existente:** `judge.ts:1018-1022` 

```typescript
// Núcleo nunca es forzado:
if (actorKind === "sistema") {
  // Sistema no puede forzar derivación del núcleo
  throw ForceNotAllowedError("Sistema no puede forzar");
}
```

**Test Requerido:**
```typescript
it("núcleo nunca es forzado: derivación es determinista", () => {
  // Verificar que máquina de Capa 0 NUNCA cambia por intent de fuerzo
  
  for (const archetype of ARCHETYPES) {
    // 1. Sin fuerzo: venta en propuesta → solo outgoing válidas
    const derived1 = deriveState(vendaLifecycle, events);
    const possibleTransitions1 = outgoing(vendaLifecycle, "propuesta");
    
    // 2. "Simulando fuerzo": número de transiciones NO cambia
    // (porque Capa 0 no conoce Capa 1)
    const possibleTransitions2 = outgoing(vendaLifecycle, "propuesta");
    
    expect(possibleTransitions1.length).toBe(possibleTransitions2.length);
  }
});
```

### 4. Walk de Flujos Reales por Escenario

**¿Qué es?**

Un "walk de flujos reales" es una **ejecución completa del sistema** (no solo checks de código) que demuestra que un escenario funciona de principio a fin.

**Componentes de un Walk:**

```
Walk = Evento1 → Derivación → Evento2 → Derivación → ... → Estado Terminal
```

**Ejemplo Concreto: Walk de "Pago dividido entre 3 partes"**

```typescript
it("walk: pago dividido entre 3 partes → cierre correcto", () => {
  // Setup: venta de 1000€ entre 3 partes
  const venta = crearVenta({
    total_centimos: 100000,
    clientes: ["parte-A", "parte-B", "parte-C"]
  });
  
  // FASE 1: Creación
  let events: DomainEvent[] = [
    { kind: "alta", datos: { ... } }
  ];
  let derived = deriveState(ventaLifecycle, events);
  expect(derived.currentStateId).toBe("propuesta");
  
  // FASE 2: Aceptación
  events.push({
    kind: "transicion",
    from: "propuesta",
    to: "aceptada",
    ...
  });
  derived = deriveState(ventaLifecycle, events);
  expect(derived.currentStateId).toBe("aceptada");
  
  // FASE 3: Registro de movimientos (división de pago)
  events.push({
    kind: "datos",
    cambios: {
      movimientos: [
        { parte_id: "parte-A", importe_centimos: 33333 },
        { parte_id: "parte-B", importe_centimos: 33333 },
        { parte_id: "parte-C", importe_centimos: 33334 }
      ]
    }
  });
  
  // FASE 4: Cierre
  events.push({
    kind: "transicion",
    from: "aceptada",
    to: "cerrada",
    ...
  });
  derived = deriveState(ventaLifecycle, events);
  expect(derived.currentStateId).toBe("cerrada");
  
  // VERIFICACIÓN: cada parte debe tener saldo = 0
  const computeBalanceByParty = (movimientos, parte_id) => {
    return movimientos
      .filter(m => m.parte_id === parte_id)
      .reduce((sum, m) => sum + m.importe_centimos, 0);
  };
  
  expect(computeBalanceByParty(movimientos, "parte-A")).toBe(33333);
  expect(computeBalanceByParty(movimientos, "parte-B")).toBe(33333);
  expect(computeBalanceByParty(movimientos, "parte-C")).toBe(33334);
  expect(sum).toBe(100000);
});
```

**Diferencia: Structural Check vs. Walk**

```typescript
// ❌ STRUCTURAL CHECK (actual)
it("soporta pago multiparte: ¿existe Movimiento.parte_id?", () => {
  // Solo verifica: schema tiene parte_id
  const hasParteId = MovimientoSchema.fields.some(f => f.name === "parte_id");
  expect(hasParteId).toBe(true);
});

// ✅ WALK (requerido)
it("walk: 3 partes pagan y se cierran correctamente", () => {
  // Ejecuta transacciones reales, verifica estado a cada paso
  const events = [alta, aceptar, registrarMovimientos, cerrar];
  const derived = deriveState(lifecycle, events);
  expect(derived.currentStateId).toBe("cerrada");
  // + verificaciones de saldos, cierre por parte, etc.
});
```

---

## Resumen de Trabajo Pendiente

| Item | Tipo | Esfuerzo | Impacto MVP |
|------|------|----------|------------|
| E2E arquetipo happy+exc | Test | Medio | Alto (6 arquetipos × 2 flows) |
| Rupturas walks | Test | Alto | Alto (7 escenarios críticos) |
| Forzado del núcleo | Test | Bajo | Medio (garantía teórica) |
| Walks de flujos reales | Test/Docs | Muy Alto | Muy Alto (confianza operacional) |

**Total de walks requeridos:** ~13-15 (6 arquetipos × 2 + 7 rupturas + 1 forzado)

---

## Cómo Se Verifica Esto

1. **Happy Path por Arquetipo:**
   - Venta: propuesta → aceptada → en_entrega → cerrada
   - Compra: propuesta → aceptada → recibida → cerrada
   - Servicio: propuesta → acordada → ejecutada → cerrada
   - (etc.)

2. **Ruptura Walk:**
   - Preparar fixture del escenario
   - Crear eventos en secuencia
   - `deriveState()` a cada paso
   - Verificar estado + invariantes (saldos, compromisos)

3. **Forzado del Núcleo:**
   - Verificar que `derive State()` es determinista
   - Verificar que máquina no cambia por intento de fuerzo

---

## Definición Final: "Walk de Flujos Reales por Escenario"

**Un walk** es una prueba que:
1. Crea una transacción real del escenario
2. Genera eventos en secuencia lógica
3. Ejecuta `deriveState()` después de cada evento
4. Verifica el estado + invariantes de dominio en cada paso
5. Confirma que el escenario llega a cierre correctamente

Es la diferencia entre:
- ❌ "¿Existe un estado llamado 'cerrada'?" (structural)
- ✅ "¿Puedo abrir→aceptar→pagar→entregar→cerrar y terminar sin errores?" (operational)

Sin walks, los arquetipos podrían tener máquinas formalmente válidas pero operacionalmente imposibles de usar.
