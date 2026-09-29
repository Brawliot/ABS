/**
 * Análisis solo-lectura de samples → v1.1 (NO forma parte del contrato).
 * Ejecutar: npx tsx contracts/business-profile/samples/analyze-10.mts
 * o: node --experimental-strip-types ...
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateBusinessProfile,
  materializeBusinessProfileDetailed,
  UNKNOWN_FIELD_POLICY,
  BusinessProfileError,
} from "../index.js";
import { generateUiSpec } from "../../../generator/generate.js";
import { deduceModules } from "../../../generator/rules/modules.js";
import type { ArchetypeId } from "../../../archetypes/types.js";
import type { PresentationChannel } from "../../../presentation/types.js";
import type { PaymentMode } from "../../../generator/types.js";
import type { NaturalezaBien } from "../types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const samples = JSON.parse(
  readFileSync(join(HERE, "business-profiles-10.json"), "utf8"),
) as {
  perfiles: SampleProfile[];
};

interface SampleField {
  estado: string;
  valor?: unknown;
  confianza?: number;
}

interface SampleProfile {
  id: string;
  nombre: string;
  descripcion: string;
  organizacion: {
    sedes: SampleField;
    roles: SampleField;
  };
  naturalezaBienes: SampleField;
  calendario: {
    tieneCitas: SampleField;
    horario: SampleField;
    festivosRegion: SampleField;
    turnosPersonal?: SampleField;
    temporadas?: SampleField;
  };
  procesos: string[];
  cobros: Record<string, SampleField>;
  portalCliente: { autoservicio: SampleField };
  permissionFallback: SampleField;
  excepcionesPermiso: string[];
  politicas: { plantilla: string; parametros: Record<string, unknown> }[];
  cumplimiento: string[];
  datosSensibles: SampleField;
  modulosEsperados: string[];
  modulosNoEsperados: string[];
  bloqueos: string[];
  necesidadesNoExpresables: string[];
  queEstresa: string[];
}

export type { SampleProfile };

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

function mapRoles(f: SampleField): { id: string; label: string }[] {
  if (f.estado !== "known" || !Array.isArray(f.valor)) return [{ id: "gerente", label: "Gerente" }];
  return (f.valor as { rol: string; n: number }[]).map((r) => ({
    id: r.rol,
    label: r.rol.replace(/_/g, " "),
  }));
}

function inferDominant(procesos: string[], cobros: SampleProfile["cobros"]): ArchetypeId {
  const blob = procesos.join(" ").toLowerCase();
  if (cobros.cuotasRecurrentes?.estado === "known" && cobros.cuotasRecurrentes.valor) {
    if (typeof cobros.cuotasRecurrentes.valor === "string" && /cuota|mensual|suscrip/i.test(String(cobros.cuotasRecurrentes.valor))) {
      return "suscripcion";
    }
    if (cobros.cuotasRecurrentes.valor === true) return "suscripcion";
  }
  if (/alquiler|reserva de maquina|prorroga/.test(blob)) return "uso_temporal";
  if (/tratamiento|sesiones|obra|proyecto|reparacion|presupuesto/.test(blob) && !/mostrador|pedido online/.test(blob)) {
    if (/obra|reforma|fase/.test(blob)) return "servicio_proyecto";
    if (/reparacion|diagnostico/.test(blob)) return "servicio_proyecto";
    if (/tratamiento|presupuesto de tratamiento/.test(blob)) return "servicio_proyecto";
  }
  if (/financiera|plazos|credito/.test(blob + JSON.stringify(cobros))) {
    // venta dominante típica
  }
  if (/gestoria|expediente|modelo/.test(blob)) return "servicio_proyecto";
  if (/matricula|clase|curso/.test(blob)) return "suscripcion";
  return "venta";
}

function inferProcesses(
  id: string,
  procesos: string[],
  dominant: ArchetypeId,
): { id: string; archetypeId: ArchetypeId; label: string }[] {
  const out: { id: string; archetypeId: ArchetypeId; label: string }[] = [
    { id: `lc.${dominant}`, archetypeId: dominant, label: procesos[0] ?? dominant },
  ];
  const blob = procesos.join(" ").toLowerCase();
  if (/financiera|plazos|credito|cuenta mensual/.test(blob) && dominant !== "financiera") {
    out.push({ id: "lc.financiera", archetypeId: "financiera", label: "crédito/plazos" });
  }
  if (/taller|reparacion|obra|tratamiento/.test(blob) && dominant === "venta") {
    out.push({
      id: "lc.servicio",
      archetypeId: "servicio_proyecto",
      label: "servicio",
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
  const c = p.cobros;
  if (c.aCredito?.estado === "known" && c.aCredito.valor && c.aCredito.valor !== false) {
    return "financiado";
  }
  if (c.aPlazos?.estado === "known" && c.aPlazos.valor && c.aPlazos.valor !== false) {
    return "financiado";
  }
  if (c.aCredito?.estado === "known" && c.aCredito.valor === false) {
    return "inmediato";
  }
  return "mixto";
}

function inferHasCitas(f: SampleField): boolean {
  if (f.estado !== "known") return false;
  if (f.valor === true) return true;
  if (f.valor === false) return false;
  if (typeof f.valor === "string") {
    if (/ocasionales|false|no/i.test(f.valor) && !/reserva|cita|turno|visita|clase|entrega/.test(f.valor)) {
      return /ocasionales/.test(f.valor); // ocasionales → true light
    }
    return true; // "reservas por turno", "clases...", etc.
  }
  return Boolean(f.valor);
}

function mapLocation(f: SampleField): Record<string, unknown> {
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

function mapNaturaleza(f: SampleField): Record<string, unknown> {
  if (f.estado === "unknown") return pf("unknown", undefined, f.confianza);
  if (f.estado === "not_applicable") return pf("not_applicable");
  const vals = (f.valor as string[]).filter((x) =>
    ["propios_por_cantidad", "propios_unitarios", "del_cliente"].includes(x),
  ) as NaturalezaBien[];
  return pf("known", vals, f.confianza);
}

function fallbackRoleId(p: SampleProfile): string {
  const roles = mapRoles(p.organizacion.roles);
  const text = String(p.permissionFallback.valor ?? "");
  const hit = roles.find((r) => text.toLowerCase().includes(r.id.replace(/_/g, " ")) || text.toLowerCase().includes(r.id));
  // "el resto" → dueño/gerente/director/socio/fundadora/directora
  const rest = roles.find((r) =>
    /duen|gerente|director|socio|fundador|directora/i.test(r.id),
  );
  return rest?.id ?? hit?.id ?? roles[0]!.id;
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

/** Campos del sample sin equivalente 1:1 en v1.1 */
function unmappedFields(p: SampleProfile): string[] {
  const gaps: string[] = [
    "nombre",
    "descripcion",
    "procesos[] (texto libre → solo se infiere archetype)",
    "cobros.aCredito",
    "cobros.aPlazos",
    "cobros.fianzas",
    "cobros.cuotasRecurrentes",
    "cobros.pagosPorHitos",
    "portalCliente.autoservicio (detalle semántico; solo canal sí/no)",
    "permissionFallback (prosa → solo roleId)",
    "excepcionesPermiso (prosa)",
    "politicas[].plantilla (no implementadas)",
    "cumplimiento[] (prosa)",
    "datosSensibles",
    "calendario.horario (string libre ≠ CalendarDef estructurado)",
    "calendario.turnosPersonal",
    "calendario.temporadas (texto)",
    "organizacion.roles[].n (cardinalidad)",
    "bloqueos",
    "modulosEsperados/NoEsperados (análisis)",
  ];
  return gaps;
}

export function mapToV11(p: SampleProfile): {
  profile: Record<string, unknown>;
  mappingNotes: string[];
  unmapped: string[];
} {
  const notes: string[] = [];
  const dominant = inferDominant(p.procesos, p.cobros);
  notes.push(`dominantArchetypeId inferido: ${dominant}`);
  const processes = inferProcesses(p.id, p.procesos, dominant);
  notes.push(`processes inferidos: ${processes.map((x) => x.archetypeId).join(",")}`);

  const hasCitas = inferHasCitas(p.calendario.tieneCitas);
  notes.push(`hasCalendar(tieneCitas)=${hasCitas}`);

  const channels = inferChannels(p);
  notes.push(`channels inferidos: ${channels.join(",")}`);

  const paymentMode = inferPayment(p);
  notes.push(`paymentMode inferido: ${paymentMode}`);

  let calendar: Record<string, unknown>;
  if (!hasCitas) {
    calendar = pf("not_applicable");
  } else if (p.calendario.horario.estado === "unknown") {
    calendar = pf("unknown");
    notes.push("calendar=unknown → política confirm (default L-V 9-18)");
  } else if (p.calendario.horario.estado === "known") {
    // No podemos parsear el string libre a CalendarDef fielmente → unknown+confirm
    calendar = pf("unknown");
    notes.push(
      `horario known como string ("${String(p.calendario.horario.valor).slice(0, 40)}…") no cabe en CalendarDef → tratado como unknown/confirm`,
    );
  } else {
    calendar = pf("not_applicable");
  }

  const resourceSubtypes =
    hasCitas
      ? pf("known", ["capacidad_temporal"])
      : pf("known", []);
  if (hasCitas) notes.push("resourceSubtypes+=capacidad_temporal (inferido por citas)");

  const roles = mapRoles(p.organizacion.roles);
  const fallbackId = fallbackRoleId(p);

  // Facturación: si cumplimiento menciona factura → ask fields known true
  const wantsFactura = p.cumplimiento.some((c) => /factura/i.test(c));

  const profile = {
    schemaVersion: "1.1.0",
    identity: { companyId: p.id },
    policyMeta: {
      documentVersion: "1.0.0",
      dominantArchetypeId: dominant,
    },
    processes: pf("known", processes),
    channels: pf("known", channels),
    paymentMode: pf("known", paymentMode),
    resourceSubtypes,
    naturalezaBienes: mapNaturaleza(p.naturalezaBienes),
    location: mapLocation(p.calendario.festivosRegion),
    capabilities: {
      hasPartes: pf("known", true),
      hasMovimientos: pf("known", true),
      hasFormalDocuments: wantsFactura ? pf("known", true) : pf("known", false),
      hasFiscalCompliance: wantsFactura ? pf("known", true) : pf("known", false),
      hasCalendar: pf("known", hasCitas),
    },
    roles: pf("known", roles),
    calendar,
    permissions: pf("known", []),
    permissionFallback: pf("known", { roleId: fallbackId }),
    compliance: pf("known", []),
    catalogFields: pf("known", ["importe", "parte_id"]),
    organization: mapOrganization(p),
    businessPolicies: pf("not_applicable"),
    pipelineStateIds: pf("not_applicable"),
  };

  // portal unknown → channels may still have been inferred without autoservicio
  if (p.portalCliente.autoservicio.estado === "unknown") {
    notes.push(
      "portalCliente.autoservicio unknown: no hay campo v1.1; channels no incluyen autoservicio (política ask no aplicable al portal)",
    );
  }

  if (p.naturalezaBienes.estado === "unknown") {
    notes.push(
      `naturalezaBienes unknown → política ${UNKNOWN_FIELD_POLICY.naturalezaBienes} ([])`,
    );
  }

  return { profile, mappingNotes: notes, unmapped: unmappedFields(p) };
}

/** Mapeo etiquetas sample → moduleIds reales del Generador */
function expectedToModuleIds(labels: string[]): {
  matched: string[];
  unmatchedLabels: string[];
} {
  const matched = new Set<string>();
  const unmatched: string[] = [];
  for (const lab of labels) {
    const l = lab.toLowerCase();
    let hit = false;
    if (/agenda|cita|reserva|horario|grupo/.test(l) && !/personal|cita personal/.test(l)) {
      // agenda de citas personales vs aforo — still map to mod.agenda if "agenda"
      if (/agenda|cita|reserva/.test(l) && !/aforo/.test(l)) {
        matched.add("mod.agenda");
        hit = true;
      }
    }
    if (/inventario|stock|pieza|lote|material/.test(l)) {
      matched.add("mod.inventario");
      hit = true;
    }
    if (/cliente|crm|paciente|alumno|expediente/.test(l)) {
      matched.add("mod.crm");
      hit = true;
    }
    if (/portal/.test(l)) {
      matched.add("mod.portal_cliente");
      hit = true;
    }
    if (/factura|cobro|caja|tpv|venta/.test(l) && !/credito|cuenta/.test(l)) {
      if (/tpv|caja/.test(l)) {
        matched.add("mod.tpv");
        hit = true;
      }
      if (/factura/.test(l) || (/cobro/.test(l) && !/hito|fase|plazo|credito/.test(l))) {
        matched.add("mod.facturacion");
        hit = true;
      }
      if (/venta|pedido/.test(l)) {
        matched.add("mod.crm");
        hit = true;
      }
    }
    if (!hit) unmatched.push(lab);
  }
  return { matched: [...matched], unmatchedLabels: unmatched };
}

function forbiddenHits(labels: string[], generated: string[]): string[] {
  const hits: string[] = [];
  for (const lab of labels) {
    const l = lab.toLowerCase();
    if (/agenda/.test(l) && generated.includes("mod.agenda")) hits.push(lab);
    if (/credito/.test(l)) {
      // no mod.credito exists — can't falsely generate; skip
    }
    if (/portal/.test(l) && generated.includes("mod.portal_cliente")) hits.push(lab);
    if (/tpv|caja/.test(l) && generated.includes("mod.tpv")) hits.push(lab);
    if (/inventario/.test(l) && generated.includes("mod.inventario")) hits.push(lab);
  }
  return hits;
}

const results: unknown[] = [];

function main(): void {
for (const p of samples.perfiles) {
  const { profile, mappingNotes, unmapped } = mapToV11(p);
  const entry: Record<string, unknown> = {
    id: p.id,
    nombre: p.nombre,
    mappingNotes,
    unmappedSampleFields: unmapped,
    necesidadesNoExpresables: p.necesidadesNoExpresables,
    bloqueosSample: p.bloqueos,
    unknownStress: [] as string[],
  };

  // Track sample-level unknowns vs policy
  if (p.calendario.horario.estado === "unknown") {
    (entry.unknownStress as string[]).push(
      `calendario.horario unknown → v1.1 calendar confirm (${UNKNOWN_FIELD_POLICY.calendar})`,
    );
  }
  if (p.cobros.aPlazos?.estado === "unknown") {
    (entry.unknownStress as string[]).push(
      "cobros.aPlazos unknown → SIN campo v1.1 (no activa política)",
    );
  }
  if (p.cobros.cuotasRecurrentes?.estado === "unknown") {
    (entry.unknownStress as string[]).push(
      "cobros.cuotasRecurrentes unknown → SIN campo v1.1",
    );
  }
  if (p.naturalezaBienes.estado === "unknown") {
    (entry.unknownStress as string[]).push(
      `naturalezaBienes unknown → ${UNKNOWN_FIELD_POLICY.naturalezaBienes}`,
    );
  }
  if (p.portalCliente.autoservicio.estado === "unknown") {
    (entry.unknownStress as string[]).push(
      "portalCliente.autoservicio unknown → SIN campo v1.1 (channels.ask no cubre el detalle)",
    );
  }

  try {
    const validated = validateBusinessProfile(profile);
    entry.validate = "ok";
    const mat = materializeBusinessProfileDetailed(validated, {
      systemIds: {
        caseId: `case-${p.id}`,
        caseVersion: "1.0.0",
        documentId: `pol-${p.id}`,
        compiledVersion: `compiled:1.0.0`,
        activationAt: "2026-01-01T00:00:00.000Z",
      },
    });
    entry.confirmations = mat.confirmations;
    entry.naturalezaMaterializada = mat.input.naturalezaBienes;
    entry.channelsMaterializados = mat.input.channels;
    entry.paymentMode = mat.input.paymentMode;
    entry.hasCalendar = mat.input.hasCalendar;

    const mods = deduceModules(mat.input).map((m) => m.moduleId);
    entry.modulosGenerados = mods;
    const spec = generateUiSpec(mat.input);
    entry.uiSpecModuleIds = spec.modules.map((m) => m.id);

    const exp = expectedToModuleIds(p.modulosEsperados);
    entry.modulosEsperadosMapeables = exp.matched;
    entry.modulosEsperadosSinModuloGenerador = exp.unmatchedLabels;
    entry.esperadosPresentes = exp.matched.filter((m) => mods.includes(m));
    entry.esperadosAusentes = exp.matched.filter((m) => !mods.includes(m));
    entry.prohibidosViolados = forbiddenHits(p.modulosNoEsperados, mods);
    entry.modulosExtraNoPedidos = mods.filter(
      (m) => !exp.matched.includes(m),
    );
  } catch (err) {
    entry.validate = "fail";
    entry.error =
      err instanceof BusinessProfileError
        ? { code: err.code, message: err.message, details: err.details }
        : { message: err instanceof Error ? err.message : String(err) };
  }

  results.push(entry);
}

  const outPath = join(HERE, "_analysis-raw.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2), "utf8");
  console.log("Wrote", outPath);
  console.log(JSON.stringify(results, null, 2));
}

const cliName = process.argv[1]?.replace(/\\/g, "/") ?? "";
if (cliName.endsWith("analyze-10.mts")) {
  main();
}