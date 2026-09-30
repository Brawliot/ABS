/**
 * Muestra el diseño que recibe cada negocio de ejemplo.
 *   npx tsx scripts/disenos.ts
 */
import { allBootableIds, bootProfile } from "../web/index.js";
import { resolveTokenMap } from "../presentation/resolve-tokens.js";

const CLAVES = ["color.primario", "color.secundario", "color.fondo", "color.texto", "tipografia.titulos", "radio.md", "espaciado.m", "densidad"];
const firmas = new Map<string, string[]>();
for (const id of allBootableIds()) {
  const b = bootProfile(id);
  const t = resolveTokenMap({ designSystem: b.designSystem, roleId: b.roles[0]!.id, channel: "backoffice" }).values as Record<string, string>;
  const fila = CLAVES.map((k) => String(t[k] ?? "").split(",")[0]!.trim());
  console.log(`${id.padEnd(27)} ${fila.join(" | ")}`);
  const firma = fila.join("|");
  firmas.set(firma, [...(firmas.get(firma) ?? []), id]);
}
console.log(`\n${firmas.size} diseños distintos para ${allBootableIds().length} negocios.`);
for (const ids of firmas.values()) if (ids.length > 1) console.log(`Mismo diseño: ${ids.join(", ")}`);
