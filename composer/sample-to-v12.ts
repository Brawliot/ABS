/**
 * Sample sintético → BusinessProfile v1.2 (entrada del compositor).
 * Sustituye el adaptador heurístico mapToV11+inferComposition.
 */

import type { ArchetypeId } from "../archetypes/types.js";
import { requireArchetype } from "../archetypes/catalog.js";
import type { PresentationChannel } from "../presentation/types.js";
import type { PaymentMode } from "../generator/types.js";
import type { NaturalezaBien } from "../contracts/business-profile/types.js";
import type { SampleProfile } from "../contracts/business-profile/samples/sample-types.js";
import { resolveSamplePlantilla } from "./compose.js";
import type { PolicyTemplateInvocation } from "../contracts/policy-templates/types.js";
import { parseScheduleText } from "./schedule-parser.js";
import type { ComposerQuestion } from "./types.js";

function pf(
  estado: string,
  valor?: unknown,
  confianza?: number,
): Record<string, unknown> {
  if (estado === "known") {
    return confianza !== undefined
      ? { status: "known", value: valor, confidence: confianza }
      : { status: "known", value: valor };
  }
  if (estado === "unknown") {
    return confianza !== undefined
      ? { status: "unknown", confidence: confianza }
      : { status: "unknown" };
  }
  return { status: "not_applicable" };
}

function mapRoles(f: SampleProfile["organizacion"]["roles"]): {
  id: string;
  label: string;
}[] {
  if (f.estado !== "known" || !Array.isArray(f.valor)) {
    return [{ id: "gerente", label: "Gerente" }];
  }
  return (f.valor as { rol: string; n: number }[]).map((r) => ({
    id: r.rol,
    label: r.rol.replace(/_/g, " "),
  }));
}

function inferDominant(p: SampleProfile): ArchetypeId {
  const blob = p.procesos.join(" ").toLowerCase();
  const desc = p.descripcion.toLowerCase();
  // Tienda / e-commerce: venta dominante aunque haya "devolucion"
  if (/pedido online|tienda|ecommerce|e-commerce|envio/.test(blob + desc)) {
    return "venta";
  }
  const cuotas = p.cobros.cuotasRecurrentes;
  if (cuotas?.estado === "known" && cuotas.valor && cuotas.valor !== false) {
    if (/matricula|clase|curso|cuota|mensual|suscrip/i.test(String(cuotas.valor))) {
      // Academia / gestoría con cuota: suscripcion si no es solo "caja"
      if (/tienda|online|pedido/.test(blob + desc)) {
        // cuotas unknown handled elsewhere; known string in shop → still venta
      } else if (!/gestoria|expediente/.test(blob)) {
        return "suscripcion";
      }
    }
    if (cuotas.valor === true) return "suscripcion";
  }
  if (/alquiler|reserva de maquina|prorroga/.test(blob)) {
    return "uso_temporal";
  }
  if (/reserva de mesa|restaurante|comensal/.test(blob + desc)) {
    return "uso_temporal";
  }
  if (/obra|reforma|fase|hito/.test(blob)) return "servicio_proyecto";
  if (/reparacion|diagnostico|taller/.test(blob)) return "servicio_proyecto";
  if (/tratamiento|presupuesto de tratamiento/.test(blob)) return "servicio_proyecto";
  if (/gestoria|expediente|modelo/.test(blob)) return "servicio_proyecto";
  if (/cita|servicio en el momento|peluquer/.test(blob + desc)) {
    return "servicio_proyecto";
  }
  if (/matricula|clase|curso/.test(blob)) return "suscripcion";
  return "venta";
}

function mapCobrosField(
  key: string,
  f: { estado: string; valor?: unknown; confianza?: number },
): Record<string, unknown> {
  if (f.estado === "unknown") return pf("unknown", undefined, f.confianza);
  if (f.estado === "not_applicable") return pf("not_applicable");

  if (key === "aCredito") {
    if (f.valor === false) return pf("known", false);
    if (f.valor === true) {
      // Crédito financiero tipado vía plazos/proceso; no cuenta_parte
      return pf("known", false);
    }
    if (typeof f.valor === "string") {
      if (/cuenta/i.test(f.valor)) {
        const limite = /1500|limite/i.test(f.valor) ? 1500 : 1500;
        return pf("known", {
          kind: "cuenta_parte",
          limitePorDefectoEur: limite,
          bloqueoImpagoDias: 45,
        });
      }
      // Crédito a plazo (constructoras…) → no cuenta; señal externa
      return pf("known", false);
    }
    return pf("known", false);
  }

  if (key === "aPlazos") {
    if (f.valor === false) return pf("known", false);
    if (f.valor === true) return pf("known", { enabled: true });
    if (typeof f.valor === "string" && f.valor.length > 0) {
      return pf("known", { enabled: true, viaFinanciera: /financiera|externa/i.test(f.valor) });
    }
    return pf("known", false);
  }

  if (key === "fianzas") {
    if (f.valor === false) return pf("known", false);
    if (f.valor === true || typeof f.valor === "string") {
      const s = String(f.valor);
      const umbral = /10|comensal|grupo/i.test(s) ? 10 : undefined;
      return pf("known", {
        kind: "retencion",
        ...(umbral !== undefined ? { umbralComensales: umbral } : {}),
        noReembolsable: /no reembolsable|matricula/i.test(s),
      });
    }
    return pf("known", false);
  }

  if (key === "cuotasRecurrentes") {
    if (f.valor === false) return pf("known", false);
    if (f.valor === true || typeof f.valor === "string") {
      return pf("known", {
        periodicidad: "mensual" as const,
        domiciliada: /domicili/i.test(String(f.valor)),
      });
    }
    return pf("known", false);
  }

  if (key === "pagosPorHitos") {
    if (f.valor === false) return pf("known", false);
    if (typeof f.valor === "string") {
      // Parse "30% inicio, 40% mitad, 30% fin" or señal
      const pcts = [...String(f.valor).matchAll(/(\d+)\s*%/g)].map((m) =>
        Number(m[1]),
      );
      if (pcts.length >= 2 && pcts.reduce((a, b) => a + b, 0) === 100) {
        const fases = ["inicio", "mitad", "fin"];
        const states = ["acordado", "en_ejecucion", "en_espera"];
        const bloquea = ["en_ejecucion", "en_espera", "cerrada"];
        return pf("known", {
          hitos: pcts.map((pct, i) => ({
            id: `h${i + 1}`,
            fase: fases[i] ?? `f${i}`,
            pct,
            bornInDominantState: states[i] ?? "acordado",
            bloqueaStateId: bloquea[i] ?? "cerrada",
          })),
        });
      }
      // Señal simple
      return pf("known", {
        hitos: [
          {
            id: "h_senal",
            fase: "senal",
            pct: 100,
            bornInDominantState: "acordado",
            bloqueaStateId: "en_ejecucion",
          },
        ],
      });
    }
    return pf("known", false);
  }

  return pf("not_applicable");
}

function needsFinancieraProcess(p: SampleProfile): boolean {
  const ac = p.cobros.aCredito;
  const ap = p.cobros.aPlazos;
  if (ap?.estado === "known" && ap.valor && ap.valor !== false) return true;
  if (ac?.estado === "known") {
    if (ac.valor === true) return true;
    if (typeof ac.valor === "string" && !/cuenta/i.test(ac.valor)) return true;
  }
  if (/financiera|plazos|credito a constructoras/.test(p.procesos.join(" ").toLowerCase())) {
    return true;
  }
  return false;
}

function needsCompraProcess(p: SampleProfile): boolean {
  const blob = [
    ...p.procesos,
    ...p.modulosEsperados,
    ...p.excepcionesPermiso,
  ]
    .join(" ")
    .toLowerCase();
  return /proveedor|compra/.test(blob);
}

function inferProcesses(
  p: SampleProfile,
  dominant: ArchetypeId,
): {
  id: string;
  archetypeId: ArchetypeId;
  label: string;
  exchangeDirection?: "empresa_vende" | "empresa_compra";
}[] {
  const out: {
    id: string;
    archetypeId: ArchetypeId;
    label: string;
    exchangeDirection?: "empresa_vende" | "empresa_compra";
  }[] = [];

  const blob = p.procesos.join(" ").toLowerCase();

  out.push({
    id: `lc.${dominant}`,
    archetypeId: dominant,
    label: p.procesos[0] ?? dominant,
    exchangeDirection: "empresa_vende",
  });

  // Venta mostrador adicional (peluquería, restaurante…)
  if (
    dominant !== "venta" &&
    /venta de producto|mostrador|carta|barra/.test(blob)
  ) {
    out.push({
      id: "lc.venta",
      archetypeId: "venta",
      label: "Venta mostrador",
      exchangeDirection: "empresa_vende",
    });
  }

  // Cita como uso_temporal junto a servicio (clínica)
  if (
    dominant === "servicio_proyecto" &&
    /primera visita|cita|sesion/.test(blob) &&
    /tratamiento|presupuesto/.test(blob)
  ) {
    out.push({
      id: "lc.cita",
      archetypeId: "uso_temporal",
      label: "Agenda de citas",
    });
  }

  if (needsFinancieraProcess(p) && dominant !== "financiera") {
    // Cuenta mensual NO es financiera
    const ac = p.cobros.aCredito;
    const isCuenta =
      ac?.estado === "known" &&
      typeof ac.valor === "string" &&
      /cuenta/i.test(ac.valor);
    if (!isCuenta) {
      out.push({
        id: "lc.financiera",
        archetypeId: "financiera",
        label: "crédito/plazos",
      });
    }
  }

  if (needsCompraProcess(p)) {
    out.push({
      id: "lc.compras",
      archetypeId: "venta",
      label: "Compras a proveedor",
      exchangeDirection: "empresa_compra",
    });
  }

  // Subcontrata / obras
  if (/subcontrat/.test(blob)) {
    out.push({
      id: "lc.subcontrata",
      archetypeId: "servicio_proyecto",
      label: "Subcontrata",
      exchangeDirection: "empresa_compra",
    });
  }

  return out;
}

function inferChannels(p: SampleProfile): PresentationChannel[] {
  const ch: PresentationChannel[] = ["backoffice"];
  const auto = p.portalCliente.autoservicio;
  if (auto.estado === "known" && auto.valor && auto.valor !== false) {
    ch.push("autoservicio");
  }
  const blob = (p.descripcion + p.procesos.join(" ")).toLowerCase();
  if (/mostrador|efectivo|tarjeta|cobramos al momento|restaurante|peluquer/.test(blob)) {
    ch.push("presencial");
  }
  if (/taller|mecanico|reparacion/.test(blob)) ch.push("taller");
  if (/internet|online|web/.test(blob)) ch.push("web");
  return [...new Set(ch)];
}

function inferPayment(p: SampleProfile): PaymentMode {
  if (needsFinancieraProcess(p)) return "financiado";
  const ac = p.cobros.aCredito;
  if (ac?.estado === "known" && typeof ac.valor === "string" && /cuenta/i.test(ac.valor)) {
    return "diferido";
  }
  if (ac?.estado === "known" && ac.valor === false) return "inmediato";
  return "mixto";
}

function inferHasCitas(f: SampleProfile["calendario"]["tieneCitas"]): boolean {
  if (f.estado !== "known") return false;
  if (f.valor === true) return true;
  if (f.valor === false) return false;
  if (typeof f.valor === "string") return true;
  return Boolean(f.valor);
}

function mapNaturaleza(f: SampleProfile["naturalezaBienes"]): Record<string, unknown> {
  if (f.estado === "unknown") return pf("unknown", undefined, f.confianza);
  if (f.estado === "not_applicable") return pf("not_applicable");
  // Confianza ≤ 0.5 ⇒ tratar como unknown (MUST_ASK inventario)
  if (typeof f.confianza === "number" && f.confianza <= 0.5) {
    return pf("unknown", undefined, f.confianza);
  }
  const vals = (f.valor as string[]).filter((x) =>
    ["propios_por_cantidad", "propios_unitarios", "del_cliente"].includes(x),
  ) as NaturalezaBien[];
  return pf("known", vals, f.confianza);
}

function mapLocation(f: SampleProfile["calendario"]["festivosRegion"]): Record<string, unknown> {
  if (f.estado !== "known" || typeof f.valor !== "string") {
    return pf(f.estado === "unknown" ? "unknown" : "not_applicable");
  }
  const v = f.valor;
  if (v.startsWith("ES-")) {
    return pf("known", { countryCode: "ES", regionCode: v.slice(3) });
  }
  if (v === "ES") return pf("known", { countryCode: "ES" });
  return pf("known", { countryCode: v.slice(0, 2) });
}

function mapOrganization(p: SampleProfile): Record<string, unknown> {
  const sedes = p.organizacion.sedes;
  if (sedes.estado === "not_applicable") return pf("not_applicable");
  if (sedes.estado === "unknown") return pf("unknown");
  if (!Array.isArray(sedes.valor)) return pf("not_applicable");
  const roles = mapRoles(p.organizacion.roles);
  const sedeObjs = (sedes.valor as string[]).map((label, i) => ({
    id: `sede-${i + 1}`,
    label,
  }));
  const equipos = sedeObjs.map((s) => ({
    id: `eq-${s.id}`,
    label: `Equipo ${s.label}`,
    sedeId: s.id,
  }));
  const assignments = roles.map((r, i) => ({
    actorId: `u-${r.id}`,
    sedeId: sedeObjs[i % sedeObjs.length]!.id,
    equipoId: equipos[i % equipos.length]!.id,
    roleId: r.id,
  }));
  return pf("known", { sedes: sedeObjs, equipos, assignments });
}

function fallbackRoleId(p: SampleProfile): string {
  const roles = mapRoles(p.organizacion.roles);
  const rest = roles.find((r) =>
    /duen|gerente|director|socio|fundador|directora/i.test(r.id),
  );
  return rest?.id ?? roles[0]!.id;
}

function defaultTransitionForDominant(dominant: ArchetypeId): string {
  switch (dominant) {
    case "venta":
      return "t_aceptar";
    case "servicio_proyecto":
      return "t_acordar";
    case "uso_temporal":
      return "t_reservar";
    case "suscripcion":
      return "t_activar";
    case "intermediacion":
      return "t_emparejar";
    case "financiera":
      return "t_aprobar";
    default: {
      const _e: never = dominant;
      return _e;
    }
  }
}

/** El paso de anular que existe en el proceso dominante (cada ciclo lo llama distinto). */
function pasoDeCancelar(dominant: ArchetypeId): string | undefined {
  const ids = requireArchetype(dominant).lifecycle.transitions.map((t) => t.id);
  return ["t_cancelar", "t_cancelar_aceptada"].find((t) => ids.includes(t)) ?? ids.find((t) => t.startsWith("t_cancelar"));
}

function pushInv(
  invs: PolicyTemplateInvocation[],
  inv: PolicyTemplateInvocation,
): void {
  if (invs.some((x) => x.plantilla === inv.plantilla && x.id === inv.id)) return;
  if (
    invs.some(
      (x) =>
        x.plantilla === inv.plantilla &&
        JSON.stringify(x.parametros) === JSON.stringify(inv.parametros),
    )
  ) {
    return;
  }
  invs.push(inv);
}

function mapPolicyTemplates(
  p: SampleProfile,
  dominant: ArchetypeId,
): Record<string, unknown> {
  const invs: PolicyTemplateInvocation[] = [];
  const transitionId = defaultTransitionForDominant(dominant);
  for (let i = 0; i < p.politicas.length; i++) {
    const pol = p.politicas[i]!;
    const tpl = resolveSamplePlantilla(pol.plantilla);
    if (!tpl) continue;
    const params: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(pol.parametros)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        params[k] = v;
      }
    }
    // Normalizar claves de plantillas nuevas
    if (tpl === "tpl.limite_plazos_financiacion" && params.meses_max_sin_aprobacion === undefined) {
      if (typeof params.meses === "number") params.meses_max_sin_aprobacion = params.meses;
    }
    pushInv(invs, {
      id: `sample-pol-${i}`,
      plantilla: tpl,
      parametros: params,
      transitionId:
        typeof params.transitionId === "string" ? params.transitionId : transitionId,
    });
  }

  // Inferir plantillas desde cumplimiento / bloqueos / excepciones (expected ≥2 perfiles)
  const cumplimiento = p.cumplimiento.join(" ").toLowerCase();
  const bloqueos = p.bloqueos.join(" ").toLowerCase();
  const excepciones = p.excepcionesPermiso.join(" ").toLowerCase();

  if (
    /consentimiento|presupuesto previo por escrito|contrato por escrito|contrato firmado|documentacion completa/.test(
      cumplimiento + " " + bloqueos,
    )
  ) {
    let evidence = "documento";
    let kind: "consentimiento" | "documentacion" | "contrato" | "presupuesto" | "otro" =
      "otro";
    if (/consentimiento/.test(cumplimiento + bloqueos)) {
      kind = "consentimiento";
      evidence = "consentimiento_informado";
    } else if (/documentacion completa/.test(bloqueos)) {
      kind = "documentacion";
      evidence = "documentacion_completa";
    } else if (/contrato/.test(cumplimiento + bloqueos)) {
      kind = "contrato";
      evidence = "contrato_firmado";
    } else if (/presupuesto/.test(cumplimiento + bloqueos)) {
      kind = "presupuesto";
      evidence = "presupuesto_escrito";
    }
    const evTransition = (() => {
      switch (dominant) {
        case "venta":
          return kind === "contrato" ? "t_aceptar" : "t_aceptar";
        case "uso_temporal":
          return "t_reservar";
        case "suscripcion":
          return kind === "documentacion" ? "t_periodo" : "t_activar";
        case "financiera":
          return "t_aprobar";
        case "intermediacion":
          return "t_emparejar";
        case "servicio_proyecto":
        default:
          if (kind === "documentacion") return "t_presentar";
          if (kind === "consentimiento" || kind === "contrato") return "t_ejecutar";
          return "t_acordar";
      }
    })();
    const evidenceKindParam =
      evTransition === "t_ejecutar"
        ? "sistema"
        : evTransition === "t_presentar"
          ? "fisica"
          : "aceptacion";
    pushInv(invs, {
      id: "inferred-evidencia",
      plantilla: "tpl.evidencia_requerida",
      parametros: {
        evidence,
        kind: evidenceKindParam,
      },
      transitionId: evTransition,
    });
  }

  if (/plazos.*12|12 meses|meses_max/.test(excepciones) || /plazos propios/.test(excepciones)) {
    pushInv(invs, {
      id: "inferred-limite-plazos",
      plantilla: "tpl.limite_plazos_financiacion",
      parametros: { meses_max_sin_aprobacion: 12 },
      transitionId: "t_aprobar",
    });
  }

  const anulaMatch = excepciones.match(
    /solo\s+(?:la\s+|el\s+)?(\w+)\s+anul/i,
  );
  const cancelar = pasoDeCancelar(dominant);
  if (anulaMatch && cancelar) {
    pushInv(invs, {
      id: "inferred-permiso-excepcion",
      plantilla: "tpl.permiso_excepcion",
      parametros: {
        rol: anulaMatch[1]!.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
      },
      transitionId: cancelar,
    });
  }

  const fianzaVal = p.cobros.fianzas?.valor;
  if (
    p.cobros.fianzas?.estado === "known" &&
    typeof fianzaVal === "string" &&
    /grupo|comensal|>\s*10|mas de 10/i.test(fianzaVal)
  ) {
    pushInv(invs, {
      id: "inferred-fianza-grupo",
      plantilla: "tpl.fianza_condicional",
      parametros: { umbral_comensales: 10 },
      transitionId: "t_reservar",
    });
  } else if (
    p.cobros.fianzas?.estado === "known" &&
    fianzaVal &&
    fianzaVal !== false &&
    !(typeof fianzaVal === "string" && /matricula|no reembolsable/i.test(fianzaVal))
  ) {
    // Retención tipada (alquiler valor=true u otro texto); no matrícula
    pushInv(invs, {
      id: "inferred-fianza-retencion",
      plantilla: "tpl.fianza_condicional",
      parametros: { umbral_comensales: 1, campo: "retencion_abierta" },
      transitionId:
        dominant === "uso_temporal"
          ? "t_cerrar"
          : defaultTransitionForDominant(dominant),
    });
  }

  return invs.length > 0 ? pf("known", invs) : pf("not_applicable");
}

function mapPortal(p: SampleProfile): Record<string, unknown> {
  const auto = p.portalCliente.autoservicio;
  if (auto.estado === "unknown") return pf("unknown", undefined, auto.confianza);
  if (auto.estado === "not_applicable") return pf("not_applicable");
  const on = Boolean(auto.valor) && auto.valor !== false;
  return pf("known", { autoservicio: on });
}

function capacityFromSample(p: SampleProfile): Record<string, unknown> {
  const needs = p.necesidadesNoExpresables.join(" ").toLowerCase();
  const mods = p.modulosEsperados.join(" ").toLowerCase();
  if (/plaza|aforo|hueco|grupo|comensal|clase/.test(needs + mods + p.descripcion.toLowerCase())) {
    return pf("known", "plazas");
  }
  if (inferHasCitas(p.calendario.tieneCitas)) {
    return pf("known", "cita_individual");
  }
  return pf("not_applicable");
}

/**
 * Convierte un sample del banco de 10 en perfil v1.2 listo para el compositor.
 */
export function mapSampleToV12(p: SampleProfile): {
  profile: Record<string, unknown>;
  mappingNotes: string[];
  scheduleQuestions: ComposerQuestion[];
} {
  const notes: string[] = [];
  const scheduleQuestions: ComposerQuestion[] = [];
  const dominant = inferDominant(p);
  notes.push(`dominant=${dominant}`);
  const processes = inferProcesses(p, dominant);
  notes.push(`processes=${processes.map((x) => x.archetypeId).join(",")}`);

  const hasCitas = inferHasCitas(p.calendario.tieneCitas);
  const wantsFactura = p.cumplimiento.some((c) => /factura/i.test(c));

  const cobros = {
    aCredito: mapCobrosField("aCredito", p.cobros.aCredito ?? { estado: "not_applicable" }),
    aPlazos: mapCobrosField("aPlazos", p.cobros.aPlazos ?? { estado: "not_applicable" }),
    fianzas: mapCobrosField("fianzas", p.cobros.fianzas ?? { estado: "not_applicable" }),
    cuotasRecurrentes: mapCobrosField(
      "cuotasRecurrentes",
      p.cobros.cuotasRecurrentes ?? { estado: "not_applicable" },
    ),
    pagosPorHitos: mapCobrosField(
      "pagosPorHitos",
      p.cobros.pagosPorHitos ?? { estado: "not_applicable" },
    ),
  };

  // aCredito true en sample + aPlazos → asegurar aPlazos enabled
  if (
    p.cobros.aCredito?.estado === "known" &&
    p.cobros.aCredito.valor === true &&
    p.cobros.aPlazos?.estado === "known" &&
    p.cobros.aPlazos.valor
  ) {
    cobros.aPlazos = mapCobrosField("aPlazos", p.cobros.aPlazos);
  }

  let calendar: Record<string, unknown>;
  if (!hasCitas) {
    calendar = pf("not_applicable");
  } else {
    const hor = p.calendario.horario;
    if (hor.estado === "known" && typeof hor.valor === "string") {
      const parsed = parseScheduleText(hor.valor, { calendarId: `cal-${p.id}` });
      for (const q of parsed.questions) {
        scheduleQuestions.push({
          id: q.id,
          field: q.field,
          question: q.question,
          ruleId: "R_SCHEDULE_PARSER",
          kind: "confirm",
        });
      }
      if (parsed.calendar && Object.keys(parsed.calendar.weeklyHours).length > 0) {
        calendar = pf("known", parsed.calendar);
        notes.push(`horario parseado (${parsed.parsed.join("; ")})`);
      } else {
        calendar = pf("unknown");
        notes.push("horario no parseable → unknown/confirm");
      }
    } else if (hor.estado === "unknown") {
      calendar = pf("unknown");
      scheduleQuestions.push({
        id: "confirm.horario.unknown",
        field: "calendar",
        question:
          "Horario desconocido: se aplicará L-V 09:00-18:00; confirme o indique el horario real",
        ruleId: "R_SCHEDULE_PARSER",
        kind: "confirm",
      });
    } else {
      calendar = pf("unknown");
    }
  }

  const profile = {
    schemaVersion: "1.2.0",
    identity: { companyId: p.id },
    policyMeta: {
      documentVersion: "1.0.0",
      dominantArchetypeId: dominant,
    },
    processes: pf("known", processes),
    channels: pf("known", inferChannels(p)),
    paymentMode: pf("known", inferPayment(p)),
    cobros,
    resourceSubtypes: hasCitas
      ? pf("known", ["capacidad_temporal"])
      : pf("known", []),
    capacityMode: capacityFromSample(p),
    naturalezaBienes: mapNaturaleza(p.naturalezaBienes),
    location: mapLocation(p.calendario.festivosRegion),
    capabilities: {
      hasPartes: pf("known", true),
      hasMovimientos: pf("known", true),
      hasFormalDocuments: pf("known", wantsFactura),
      hasFiscalCompliance: pf("known", wantsFactura),
      hasCalendar: pf("known", hasCitas),
    },
    roles: pf("known", mapRoles(p.organizacion.roles)),
    calendar,
    permissions: pf("known", []),
    permissionFallback: pf("known", { roleId: fallbackRoleId(p) }),
    compliance: pf("known", []),
    catalogFields: pf("known", [
      "importe",
      "parte_id",
      "descuento_pct",
      "compra_at",
      "dias_impago",
      "recibos_pendientes",
    ]),
    organization: mapOrganization(p),
    businessPolicies: pf("not_applicable"),
    policyTemplates: mapPolicyTemplates(p, dominant),
    portalCliente: mapPortal(p),
    pipelineStateIds: pf("not_applicable"),
  };

  return { profile, mappingNotes: notes, scheduleQuestions };
}
