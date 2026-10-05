/**
 * Reglas declarativas de deducción de módulos.
 * Añadir un módulo nuevo = añadir una regla aquí (y registrarla en index).
 */

import type { GeneratorInput, ModuleMatch, ModuleRule } from "../types.js";
import { derivePresentationPanels } from "../presentation-rules.js";

function rolesByHint(
  ctx: GeneratorInput,
  hints: readonly string[],
): string[] {
  const ids = ctx.roles.map((r) => r.id);
  const hit = ids.filter((id) =>
    hints.some((h) => id.toLowerCase().includes(h)),
  );
  return hit.length > 0 ? hit : ids.slice(0, 2);
}

function lifecycleIds(ctx: GeneratorInput): string[] {
  return ctx.lifecycles.map((l) => l.id);
}

function tallerLifecycleIds(ctx: GeneratorInput): string[] {
  return ctx.lifecycles
    .filter(
      (l) =>
        l.archetypeId.includes("servicio") ||
        (l.label ?? "").toLowerCase().includes("taller"),
    )
    .map((l) => l.id);
}

/** TPV: canal presencial + venta con pago inmediato. */
export const ruleTpv: ModuleRule = {
  id: "rule.tpv",
  moduleId: "mod.tpv",
  labelKey: "module.tpv",
  match: (ctx) =>
    ctx.channels.includes("presencial") &&
    ctx.paymentMode === "inmediato" &&
    ctx.lifecycles.some((l) => l.archetypeId === "venta"),
  resolve: (ctx) => {
    if (!ruleTpv.match(ctx)) return null;
    return {
      ruleId: ruleTpv.id,
      moduleId: ruleTpv.moduleId,
      labelKey: ruleTpv.labelKey,
      channel: "presencial",
      roleIds: rolesByHint(ctx, ["cajero", "vendedor", "tpv"]),
      lifecycleIds: ctx.lifecycles
        .filter((l) => l.archetypeId === "venta")
        .map((l) => l.id),
    };
  },
};

function isPipelineState(stateId: string, kind: string): boolean {
  if (kind === "inicial") return true;
  return /propuesta|solicitud|prospecto|borrador/i.test(stateId);
}

/** CRM: Partes + transacciones en solicitud/propuesta. */
export const ruleCrm: ModuleRule = {
  id: "rule.crm",
  moduleId: "mod.crm",
  labelKey: "module.crm",
  match: (ctx) => {
    if (!ctx.hasPartes) return false;
    return ctx.lifecycles.some((l) =>
      l.lifecycle.states.some((s) => isPipelineState(s.id, s.kind)),
    );
  },
  resolve: (ctx) => {
    if (!ruleCrm.match(ctx)) return null;
    return {
      ruleId: ruleCrm.id,
      moduleId: ruleCrm.moduleId,
      labelKey: ruleCrm.labelKey,
      channel: ctx.channels.includes("backoffice")
        ? "backoffice"
        : (ctx.channels[0] ?? "backoffice"),
      roleIds: rolesByHint(ctx, ["comercial", "vendedor", "crm", "gerente"]),
      lifecycleIds: lifecycleIds(ctx).filter((id) => {
        const slice = ctx.lifecycles.find((l) => l.id === id);
        return slice?.lifecycle.states.some((s) =>
          isPipelineState(s.id, s.kind),
        );
      }),
    };
  },
};

/** Inventario: bienes propios por cantidad (naturalezaBienes). */
export const ruleInventario: ModuleRule = {
  id: "rule.inventario",
  moduleId: "mod.inventario",
  labelKey: "module.inventario",
  match: (ctx) =>
    ctx.naturalezaBienes.includes("propios_por_cantidad"),
  resolve: (ctx) => {
    if (!ruleInventario.match(ctx)) return null;
    return {
      ruleId: ruleInventario.id,
      moduleId: ruleInventario.moduleId,
      labelKey: ruleInventario.labelKey,
      channel: "backoffice",
      roleIds: rolesByHint(ctx, ["almacen", "inventario", "operaciones"]),
      lifecycleIds: [],
    };
  },
};

/** Agenda: Recursos de capacidad temporal + Calendario. */
export const ruleAgenda: ModuleRule = {
  id: "rule.agenda",
  moduleId: "mod.agenda",
  labelKey: "module.agenda",
  match: (ctx) =>
    ctx.resourceSubtypes.includes("capacidad_temporal") && ctx.hasCalendar,
  resolve: (ctx) => {
    if (!ruleAgenda.match(ctx)) return null;
    const taller = tallerLifecycleIds(ctx);
    const labelKey =
      taller.length > 0 ? "module.agenda_taller" : ruleAgenda.labelKey;
    return {
      ruleId: ruleAgenda.id,
      moduleId: ruleAgenda.moduleId,
      labelKey,
      channel: ctx.channels.includes("taller") ? "taller" : "backoffice",
      roleIds: rolesByHint(ctx, ["taller", "agenda", "servicio", "operaciones"]),
      lifecycleIds: taller.length > 0 ? taller : lifecycleIds(ctx),
    };
  },
};

/** Facturación: Movimientos + documentos formales + cumplimiento fiscal. */
export const ruleFacturacion: ModuleRule = {
  id: "rule.facturacion",
  moduleId: "mod.facturacion",
  labelKey: "module.facturacion",
  match: (ctx) =>
    ctx.hasMovimientos &&
    ctx.hasFormalDocuments &&
    ctx.hasFiscalCompliance,
  resolve: (ctx) => {
    if (!ruleFacturacion.match(ctx)) return null;
    return {
      ruleId: ruleFacturacion.id,
      moduleId: ruleFacturacion.moduleId,
      labelKey: ruleFacturacion.labelKey,
      channel: "backoffice",
      roleIds: rolesByHint(ctx, [
        "finanzas",
        "factura",
        "contabilidad",
        "gerente",
      ]),
      lifecycleIds: ctx.lifecycles
        .filter(
          (l) =>
            l.archetypeId === "venta" || l.archetypeId === "financiera",
        )
        .map((l) => l.id),
    };
  },
};

/** Portal del cliente: canal autoservicio + permiso consultar para Parte. */
export const rulePortalCliente: ModuleRule = {
  id: "rule.portal_cliente",
  moduleId: "mod.portal_cliente",
  labelKey: "module.portal_cliente",
  match: (ctx) => {
    if (!ctx.channels.includes("autoservicio")) return false;
    return ctx.ruleSet.rules.some(
      (r) =>
        r.kind === "visibility" &&
        r.allowedRoles.some(
          (role) =>
            role.toLowerCase().includes("cliente") ||
            role.toLowerCase().includes("parte"),
        ),
    );
  },
  resolve: (ctx) => {
    if (!rulePortalCliente.match(ctx)) return null;
    return {
      ruleId: rulePortalCliente.id,
      moduleId: rulePortalCliente.moduleId,
      labelKey: rulePortalCliente.labelKey,
      channel: "autoservicio",
      roleIds: rolesByHint(ctx, ["cliente", "parte"]),
      lifecycleIds: lifecycleIds(ctx),
    };
  },
};

/** Dashboard: Inteligencia de negocio para todos. */
export const ruleDashboard: ModuleRule = {
  id: "rule.dashboard",
  moduleId: "mod.dashboard",
  labelKey: "module.dashboard",
  match: () => true, // Todo negocio necesita visibility de operación + empresa
  resolve: (ctx) => {
    return {
      ruleId: ruleDashboard.id,
      moduleId: ruleDashboard.moduleId,
      labelKey: ruleDashboard.labelKey,
      channel: ctx.channels.includes("backoffice") ? "backoffice" : (ctx.channels[0] ?? "backoffice"),
      roleIds: rolesByHint(ctx, ["gerente", "director", "admin", "analista"]),
      lifecycleIds: lifecycleIds(ctx),
    };
  },
};

/** Catálogo ordenado: añadir módulo = push de una regla. */
export const MODULE_RULES: readonly ModuleRule[] = [
  ruleTpv,
  ruleCrm,
  ruleInventario,
  ruleAgenda,
  ruleFacturacion,
  rulePortalCliente,
  ruleDashboard,
];

export function deduceModules(ctx: GeneratorInput): ModuleMatch[] {
  const out: ModuleMatch[] = [];
  for (const rule of MODULE_RULES) {
    const m = rule.resolve(ctx);
    if (m) out.push(m);
  }
  return out.sort((a, b) => a.moduleId.localeCompare(b.moduleId));
}

// ─── Decisor de módulos ─────────────────────────────────────────────────
//
// Decide qué partes lleva la app de cada negocio y por qué, a partir del
// GeneratorInput (perfil materializado). A diferencia de las etiquetas mod.*
// de arriba, estas decisiones SÍ encienden y apagan partes: lo no decidido
// no aparece (menú, pantallas y rutas).

export type ModuloId =
  | "clientes"
  | "catalogo"
  | "dinero"
  | "facturas"
  | "stock"
  | "agenda"
  | "cuotas"
  | "fianzas"
  | "credito"
  | "portal"
  | "dashboard";

export interface DecisionModulo {
  readonly id: ModuloId;
  readonly nombre: string;
  readonly activo: boolean;
  /** Por qué sí o por qué no, en castellano, con los datos del perfil. */
  readonly motivo: string;
}

const ARQUETIPOS_CON_MERCANCIA = new Set(["venta", "servicio_proyecto"]);

export function decidirModulos(input: GeneratorInput): DecisionModulo[] {
  // Los paneles los decide el generador con sus reglas: se reutilizan tal cual.
  const paneles = new Set(derivePresentationPanels(input).map((p) => p.kind));
  const arquetipos = new Set(input.lifecycles.map((l) => l.archetypeId));
  const d = (id: ModuloId, nombre: string, activo: boolean, si: string, no: string): DecisionModulo => ({
    id,
    nombre,
    activo,
    motivo: activo ? si : no,
  });

  const vendePorCantidad = input.naturalezaBienes.includes("propios_por_cantidad");
  const mueveMercancia = [...arquetipos].some((a) => ARQUETIPOS_CON_MERCANCIA.has(a));

  return [
    d("clientes", "Clientes y proveedores", true, "Todo negocio intercambia con alguien.", ""),
    d("catalogo", "Catálogo", true, "Todo negocio ofrece algo con un precio.", ""),
    d("dinero", "Dinero", true, "Todo negocio cobra y paga.", ""),
    d("dashboard", "Dashboard", true, "Inteligencia de operación y empresa.", ""),
    d(
      "facturas",
      "Facturas",
      input.hasFiscalCompliance || input.hasFormalDocuments,
      "Tiene obligaciones fiscales o documentos formales.",
      "El perfil no declara obligaciones fiscales ni documentos formales.",
    ),
    d(
      "stock",
      "Stock",
      vendePorCantidad && mueveMercancia,
      "Vende o usa productos propios que se cuentan.",
      !vendePorCantidad
        ? "No trabaja con productos propios que se cuenten."
        : "Sus procesos no entregan mercancía (alquiler, suscripción, intermediación).",
    ),
    d(
      "agenda",
      "Agenda",
      paneles.has("panel_agenda"),
      "Trabaja con citas o capacidad por horas.",
      "No trabaja con citas ni capacidad por horas.",
    ),
    d(
      "cuotas",
      "Cuotas",
      paneles.has("panel_periodos"),
      "Cobra suscripciones o cuotas periódicas.",
      "No cobra cuotas periódicas.",
    ),
    d(
      "fianzas",
      "Fianzas",
      paneles.has("panel_retencion"),
      "Retiene fianzas o dinero de terceros (alquiler o intermediación).",
      "No retiene fianzas.",
    ),
    d(
      "credito",
      "Crédito a clientes",
      paneles.has("panel_credito") || input.paymentMode === "diferido",
      paneles.has("panel_credito") ? "Vende a crédito o a plazos." : "Vende a cuenta: sus clientes pagan más tarde.",
      "Cobra al momento.",
    ),
    d(
      "portal",
      "Portal del cliente",
      paneles.has("portal_filtro"),
      "Sus clientes consultan sus pedidos por su cuenta.",
      "Sus clientes no tienen acceso propio.",
    ),
  ];
}

export function moduloActivo(input: GeneratorInput, id: ModuloId): boolean {
  return decidirModulos(input).some((m) => m.id === id && m.activo);
}
