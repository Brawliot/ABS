/**
 * Genera el software de uno o varios negocios y cuenta qué ha decidido.
 *
 *   npm run generar                          → los negocios nuevos
 *   npm run generar -- n03-autoescuela       → uno concreto (o varios)
 *   npm run generar -- --archivo mi.json     → desde tu propio JSON
 *   npm run generar -- --todos               → todos los negocios
 *
 * Para cada negocio: procesos, módulos (sí/no y por qué, comparado con lo
 * que el negocio espera), diseño, preguntas pendientes y si cada proceso
 * llega al final.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decidirModulos, type ModuloId } from "../generator/rules/modules.js";
import { detectarSector } from "../design/generative.js";
import { resolveTokenMap } from "../presentation/resolve-tokens.js";
import { AppRuntime } from "../web/runtime.js";
import {
  allBootableIds,
  bootProfile,
  listSampleProfileIds,
  loadSampleProfile,
  readSampleFile,
  registerSampleFile,
} from "../web/boot-profile.js";
import { probarCiclos } from "../web/probar-ciclo.js";

const NUEVOS = join(import.meta.dirname, "../contracts/business-profile/samples/negocios-nuevos.json");

/** Palabras con las que el negocio suele nombrar cada módulo. */
const PISTAS: Record<ModuloId, RegExp> = {
  clientes: /clientes|pacientes|alumnos|propietarios/,
  catalogo: /catalogo|tarifa/,
  dinero: /cobro|pagos/,
  facturas: /factura/,
  stock: /stock|inventario/,
  agenda: /agenda|citas/,
  cuotas: /cuota|suscripci/,
  fianzas: /fianza|arras|retenid/,
  credito: /credito|plazos|con cuenta/,
  portal: /portal/,
};

function sinTildes(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function ids(): string[] {
  const args = process.argv.slice(2);
  const i = args.indexOf("--archivo");
  if (i >= 0 && args[i + 1]) return registerSampleFile(args[i + 1]!);
  if (args.includes("--todos")) return [...allBootableIds()];
  const sueltos = args.filter((a) => !a.startsWith("--"));
  return sueltos.length > 0 ? sueltos : readSampleFile(NUEVOS).map((p) => p.id);
}

async function informe(id: string): Promise<number> {
  let fallos = 0;
  const sample = listSampleProfileIds().includes(id) ? loadSampleProfile(id) : undefined;
  console.log(`\n══════ ${sample?.nombre ?? id}  (${id})`);
  const boot = bootProfile(id);

  console.log("Procesos:");
  for (const l of boot.input.lifecycles) {
    const dir = l.exchangeDirection === "empresa_compra" ? " (compra)" : "";
    console.log(`  · ${l.label ?? l.id}  → ${l.archetypeId}${dir}`);
  }

  console.log("Módulos:");
  const esperados = (sample?.modulosEsperados ?? []).map(sinTildes).join(" | ");
  const noEsperados = (sample?.modulosNoEsperados ?? []).map(sinTildes).join(" | ");
  for (const m of decidirModulos(boot.input)) {
    const quiere = PISTAS[m.id].test(esperados);
    const noQuiere = PISTAS[m.id].test(noEsperados);
    let marca = "  ";
    if (m.activo && noQuiere) marca = "✘ sobra";
    else if (!m.activo && quiere) marca = "✘ falta";
    else if (quiere || noQuiere) marca = "✔";
    if (marca.startsWith("✘")) fallos++;
    console.log(`  ${m.activo ? "[sí]" : "[no]"} ${m.nombre.padEnd(22)} ${marca.padEnd(8)} ${m.motivo}`);
  }

  const t = resolveTokenMap({ designSystem: boot.designSystem, roleId: boot.roles[0]!.id, channel: "backoffice" })
    .values as Record<string, string>;
  const sector = sample ? detectarSector(sample.nombre, sample.descripcion) : "-";
  console.log(
    `Diseño: sector=${sector} · ${boot.designSystem.label} · primario ${t["color.primario"]} · letra ${String(t["tipografia.titulos"]).split(",")[0]}`,
  );

  if (boot.questions.length > 0) {
    console.log("Preguntas que haría al negocio:");
    for (const q of boot.questions) console.log(`  ? ${q.question}`);
  }

  const dir = mkdtempSync(join(tmpdir(), "abs-generar-"));
  const rt = AppRuntime.open(boot, { dbPath: join(dir, "db.sqlite") });
  try {
    console.log("¿Cada proceso llega al final?");
    for (const r of await probarCiclos(boot, rt)) {
      const ok = r.paradoEn === "OK";
      if (!ok) fallos++;
      const nombre = rt.etiquetas.proceso(r.lifecycleId);
      console.log(
        ok
          ? `  ✔ ${nombre}`
          : `  ✘ ${nombre}: se para en «${rt.etiquetas.accion(r.lifecycleId, r.paradoEn)}» — ${r.motivo ?? ""}`,
      );
    }
  } finally {
    rt.close();
    rmSync(dir, { recursive: true, force: true });
  }
  if (sample && sample.bloqueos.length > 0) {
    console.log("Bloqueos que pidió el negocio (revisar a mano):");
    for (const b of sample.bloqueos) console.log(`  - ${b}`);
  }
  return fallos;
}

let total = 0;
for (const id of ids()) {
  try {
    total += await informe(id);
  } catch (err) {
    total++;
    console.log(`\n══════ ${id}\n  ✘ NO SE PUDO GENERAR: ${err instanceof Error ? err.message : String(err)}`);
  }
}
console.log(`\n${total === 0 ? "Sin fallos." : `${total} fallos (✘) a revisar.`}`);
