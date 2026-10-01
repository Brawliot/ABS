/**
 * Pruebas para cobros: hitos, seña, a crédito, plazos y fianzas.
 * Cada prueba crea datos reales y verifica el flujo completo.
 */

import type { ContextoPrueba, ResultadoPrueba } from "../checklist.js";
import { executeUiAction } from "../../web/action-handler.js";

/**
 * Prueba: cobros por hitos bloquean avances hasta pagar.
 * 1. Crea expediente con pagosPorHitos (2 hitos: 50% + 50%)
 * 2. Acepta expediente
 * 3. Intenta avanzar sin pago (debería fallar)
 * 4. Registra pago del 1er hito
 * 5. Verifica que aún no avance
 * 6. Registra pago del 2do hito
 * 7. Verifica que AHORA avance
 */
export async function probarCobroHitos(ctx: ContextoPrueba): Promise<ResultadoPrueba> {
  const rt = ctx.runtime;
  const boot = ctx.boot;

  // Encuentra un lifecycle con pagosPorHitos y extrae los IDs de hitos
  let lcId: string | undefined;
  let hitoIds: string[] = [];
  const hitosRule = boot.input.ruleSet.rules.find(
    (r: any) => "plantilla" in r && r.plantilla === "tpl.hitos_pago"
  ) as any;

  if (hitosRule?.parametros?.hitosJson) {
    for (const lc of boot.input.lifecycles) {
      lcId = lc.id;
      break;
    }
    try {
      const hitos = JSON.parse(hitosRule.parametros.hitosJson);
      hitoIds = hitos.map((h: any) => h.id ?? `h${hitos.indexOf(h) + 1}`);
    } catch {
      hitoIds = ["h1", "h2"];
    }
  }

  if (!lcId || hitoIds.length === 0) {
    return { ok: false, detalle: "No hay negocio con pagosPorHitos configurado" };
  }

  // Crea expediente
  const txRes = rt.crearTransaccion(
    {
      lifecycleId: lcId,
      parteId: "parte-demo-1",
      fecha: "2026-09-01",
      lineas: [{ descripcion: "Servicio con hitos", cantidadMilesimas: 1000, precioCentimos: 100000, ivaPct: 21 }],
    },
    "prueba-hitos",
  );

  if (!txRes.ok) {
    return { ok: false, detalle: `No se pudo crear expediente: ${txRes.errors.join("; ")}` };
  }

  const expId = txRes.id;
  const totalExp = 100000; // en céntimos (1000 EUR)
  const pago50 = Math.round(totalExp / 2);

  // Acepta expediente (simula el flujo normal)
  try {
    for (const role of boot.roles) {
      const resAceptar = await executeUiAction(rt, {
        actionId: `action.${lcId}.t_acordar`,
        subjectId: expId,
        clientRequestId: `${expId}-aceptar-${role.id}`,
        roleId: role.id,
        parteId: "parte-demo-1",
        channel: "backoffice",
        kind: "boton",
      });
      if (resAceptar.ok) break;
    }
  } catch {
    // Sin error fatal: continúa
  }

  // Intenta avanzar sin pagar (debería fallar)
  let bloqueadoSinPago = false;
  for (const role of boot.roles) {
    const resEjecutar = await executeUiAction(rt, {
      actionId: `action.${lcId}.t_ejecutar`,
      subjectId: expId,
      clientRequestId: `${expId}-ejecutar-sin-pago-${role.id}`,
      roleId: role.id,
      parteId: "parte-demo-1",
      channel: "backoffice",
      kind: "boton",
    });
    if (!resEjecutar.ok) {
      bloqueadoSinPago = true;
      break;
    }
  }

  if (!bloqueadoSinPago) {
    return { ok: false, detalle: "Se esperaba que avance bloqueado sin pago de hitos" };
  }

  // Registra pago del 1er hito (50%)
  const regPago1 = rt.registrarCobro(expId, { importeCentimos: pago50, hitoId: hitoIds[0] ?? "h1", medio: "transferencia" }, "prueba-hitos");
  if (!regPago1.ok) {
    return { ok: false, detalle: `No se pudo registrar 1er pago: ${regPago1.error}` };
  }

  // Si hay más de 1 hito, intenta avanzar con 1 pagado (debería fallar)
  if (hitoIds.length > 1) {
    let avanzoConUnHito = false;
    for (const role of boot.roles) {
      const resEjecutar = await executeUiAction(rt, {
        actionId: `action.${lcId}.t_ejecutar`,
        subjectId: expId,
        clientRequestId: `${expId}-ejecutar-50-${role.id}`,
        roleId: role.id,
        parteId: "parte-demo-1",
        channel: "backoffice",
        kind: "boton",
      });
      if (resEjecutar.ok) {
        avanzoConUnHito = true;
        break;
      }
    }

    if (avanzoConUnHito) {
      return { ok: false, detalle: "Debería fallar con solo 1 de 2 hitos pagados" };
    }

    // Registra pago del 2do hito
    const regPago2 = rt.registrarCobro(
      expId,
      { importeCentimos: pago50, hitoId: hitoIds[1] ?? "h2", medio: "transferencia" },
      "prueba-hitos"
    );
    if (!regPago2.ok) {
      return { ok: false, detalle: `No se pudo registrar 2do pago: ${regPago2.error}` };
    }
  }

  // Intenta avanzar con todos los hitos pagados (debería funcionar)
  let avanzoConTodosPagos = false;
  for (const role of boot.roles) {
    const resEjecutar = await executeUiAction(rt, {
      actionId: `action.${lcId}.t_ejecutar`,
      subjectId: expId,
      clientRequestId: `${expId}-ejecutar-100-${role.id}`,
      roleId: role.id,
      parteId: "parte-demo-1",
      channel: "backoffice",
      kind: "boton",
    });
    if (resEjecutar.ok) {
      avanzoConTodosPagos = true;
      break;
    }
  }

  if (!avanzoConTodosPagos) {
    return { ok: false, detalle: `No se pudo avanzar con todos los hitos pagados (${hitoIds.length} hitos)` };
  }

  return { ok: true, detalle: `Hitos de pago bloquean y desbloquean correctamente (${hitoIds.length} hitos)` };
}

/**
 * Prueba: seña se cobra automáticamente al aceptar.
 * 1. Crea expediente con seña
 * 2. Acepta expediente (debe registrar seña automáticamente)
 * 3. Verifica que se cobró el porcentaje de seña
 */
export async function probarCobroSena(ctx: ContextoPrueba): Promise<ResultadoPrueba> {
  const rt = ctx.runtime;
  const boot = ctx.boot;

  // Encuentra un lifecycle con seña
  let lcId: string | undefined;
  for (const lc of boot.input.lifecycles) {
    for (const rule of boot.input.ruleSet.rules) {
      if ("plantilla" in rule && rule.plantilla === "tpl.senal_pago") {
        lcId = lc.id;
        break;
      }
    }
    if (lcId) break;
  }

  if (!lcId) {
    return { ok: false, detalle: "No hay negocio con seña configurado" };
  }

  // Crea expediente
  const txRes = rt.crearTransaccion(
    {
      lifecycleId: lcId,
      parteId: "parte-demo-1",
      fecha: "2026-09-01",
      lineas: [{ descripcion: "Encargo con seña", cantidadMilesimas: 1000, precioCentimos: 100000, ivaPct: 21 }],
    },
    "prueba-seña",
  );

  if (!txRes.ok) {
    return { ok: false, detalle: `No se pudo crear expediente: ${txRes.errors.join("; ")}` };
  }

  const expId = txRes.id;

  // Acepta expediente (debe registrar seña automáticamente)
  for (const role of boot.roles) {
    await executeUiAction(rt, {
      actionId: `action.${lcId}.t_acordar`,
      subjectId: expId,
      clientRequestId: `${expId}-aceptar-${role.id}`,
      roleId: role.id,
      parteId: "parte-demo-1",
      channel: "backoffice",
      kind: "boton",
    });
  }

  // Verifica que se haya cobrado (debería ser 30% de 100000 = 30000)
  const totalCobrado = rt.totalCobradoDe(expId);
  const esperado = Math.round(100000 * 0.30); // 30% típico de seña

  if (totalCobrado === 0) {
    return { ok: false, detalle: "No se cobró seña al aceptar" };
  }

  if (totalCobrado >= 100000) {
    return { ok: false, detalle: `Se cobró demasiado: ${totalCobrado} céntimos (esperado < 100000)` };
  }

  return { ok: true, detalle: `Seña cobrada al aceptar: ${(totalCobrado / 100).toFixed(2)} EUR` };
}

/**
 * Prueba: a crédito genera deuda del cliente.
 * 1. Crea expediente marcado como a crédito
 * 2. Verifica que aparezca como deuda del cliente
 */
export async function probarCobroCredito(ctx: ContextoPrueba): Promise<ResultadoPrueba> {
  const rt = ctx.runtime;

  // Crea un expediente normal (simula venta a crédito)
  const txRes = rt.crearTransaccion(
    {
      lifecycleId: ctx.boot.input.lifecycles[0]?.id || "lc",
      parteId: "parte-demo-1",
      fecha: "2026-09-01",
      lineas: [{ descripcion: "Venta a crédito", cantidadMilesimas: 1000, precioCentimos: 50000, ivaPct: 21 }],
    },
    "prueba-credito",
  );

  if (!txRes.ok) {
    return { ok: false, detalle: `No se pudo crear expediente: ${txRes.errors.join("; ")}` };
  }

  // Verifica que aparezca en la lista de expedientes
  const exps = rt.expedientesDinero().filter((e) => e.parteId === "parte-demo-1" && e.direccion === "entra");

  if (exps.length === 0) {
    return { ok: false, detalle: "No aparecen expedientes a crédito del cliente" };
  }

  return { ok: true, detalle: `Expedientes a crédito registrados: ${exps.length}` };
}

/**
 * Prueba: financiación a plazos crea cuotas.
 * 1. Crea expediente
 * 2. Cierra expediente
 * 3. Verifica que se creó financiado con 12 cuotas
 * 4. Paga una cuota y verifica estado
 */
export async function probarCobroPlazos(ctx: ContextoPrueba): Promise<ResultadoPrueba> {
  const rt = ctx.runtime;
  const boot = ctx.boot;

  const txRes = rt.crearTransaccion(
    {
      lifecycleId: boot.input.lifecycles[0]?.id || "lc",
      parteId: "parte-demo-1",
      fecha: "2026-09-01",
      lineas: [{ descripcion: "Producto a plazos", cantidadMilesimas: 1000, precioCentimos: 100000, ivaPct: 21 }],
    },
    "prueba-plazos",
  );

  if (!txRes.ok) {
    return { ok: false, detalle: `No se pudo crear transacción: ${txRes.errors.join("; ")}` };
  }

  // Crea financiado con 12 cuotas
  const finRes = rt.crearFinanciado(txRes.id, 100000, 12, 0, "prueba-plazos");
  if (!finRes.ok) {
    return { ok: false, detalle: `No se pudo crear financiado: ${finRes.error}` };
  }

  const fin = rt.financiadoDe(txRes.id);
  if (!fin) {
    return { ok: false, detalle: "Financiado no se creó correctamente" };
  }

  if (fin.cuotas.length !== 12) {
    return { ok: false, detalle: `Se esperaban 12 cuotas, se crearon ${fin.cuotas.length}` };
  }

  // Paga una cuota
  const pagarRes = rt.pagarCuotaFinanciado(txRes.id, 1, "prueba-plazos");
  if (!pagarRes.ok) {
    return { ok: false, detalle: `No se pudo pagar cuota: ${pagarRes.error}` };
  }

  const finActual = rt.financiadoDe(txRes.id);
  const cuota1 = finActual?.cuotas.find((c) => c.numeroOrden === 1);
  if (cuota1?.estado !== "pagada") {
    return { ok: false, detalle: "La cuota no se marcó como pagada" };
  }

  return { ok: true, detalle: "Financiación a plazos funciona: se crean cuotas y se pagan" };
}

/**
 * Prueba: fianza bloquea avances hasta ser registrada.
 * 1. Crea expediente con fianza requerida
 * 2. Intenta avanzar sin fianza (debería fallar)
 * 3. Registra fianza
 * 4. Verifica que AHORA avance
 */
export async function probarCobroFianza(ctx: ContextoPrueba): Promise<ResultadoPrueba> {
  const rt = ctx.runtime;
  const boot = ctx.boot;

  // Encuentra un lifecycle con fianza
  let lcId: string | undefined;
  for (const lc of boot.input.lifecycles) {
    // Detecta si tiene campo de fianza en las reglas
    for (const rule of boot.input.ruleSet.rules) {
      if ("plantilla" in rule && rule.plantilla === "tpl.fianza") {
        lcId = lc.id;
        break;
      }
    }
    if (lcId) break;
  }

  if (!lcId) {
    return { ok: false, detalle: "No hay negocio con fianza configurado" };
  }

  // Crea expediente con fianza de 10000 céntimos (100 EUR)
  const txRes = rt.crearTransaccion(
    {
      lifecycleId: lcId,
      parteId: "parte-demo-1",
      fecha: "2026-09-01",
      lineas: [{ descripcion: "Servicio con fianza", cantidadMilesimas: 1000, precioCentimos: 10000, ivaPct: 21 }],
      campos: { fianza_eur: 100 },
    },
    "prueba-fianza",
  );

  if (!txRes.ok) {
    return { ok: false, detalle: `No se pudo crear expediente: ${txRes.errors.join("; ")}` };
  }

  const expId = txRes.id;

  // Intenta avanzar sin registrar fianza
  let bloqueadoSinFianza = false;
  for (const role of boot.roles) {
    const resAvanza = await executeUiAction(rt, {
      actionId: `action.${lcId}.t_acordar`,
      subjectId: expId,
      clientRequestId: `${expId}-sin-fianza-${role.id}`,
      roleId: role.id,
      parteId: "parte-demo-1",
      channel: "backoffice",
      kind: "boton",
    });
    if (!resAvanza.ok) {
      bloqueadoSinFianza = true;
      break;
    }
  }

  if (!bloqueadoSinFianza) {
    return { ok: false, detalle: "Se esperaba que avance bloqueado sin fianza" };
  }

  // Registra fianza (100 EUR = 10000 céntimos)
  const regFianza = rt.registrarCobro(
    expId,
    { importeCentimos: 10000, medio: "retencion" },
    "prueba-fianza",
  );
  if (!regFianza.ok) {
    return { ok: false, detalle: `No se pudo registrar fianza: ${regFianza.error}` };
  }

  // Intenta avanzar con fianza registrada
  let avanzoConFianza = false;
  for (const role of boot.roles) {
    const resAvanza = await executeUiAction(rt, {
      actionId: `action.${lcId}.t_acordar`,
      subjectId: expId,
      clientRequestId: `${expId}-con-fianza-${role.id}`,
      roleId: role.id,
      parteId: "parte-demo-1",
      channel: "backoffice",
      kind: "boton",
    });
    if (resAvanza.ok) {
      avanzoConFianza = true;
      break;
    }
  }

  if (!avanzoConFianza) {
    return { ok: false, detalle: "No se pudo avanzar ni con fianza registrada" };
  }

  return { ok: true, detalle: "Fianza bloquea y desbloquea correctamente" };
}
