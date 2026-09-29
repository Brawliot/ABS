import { financieraArchetype } from "./financiera.js";
import { intermediacionArchetype } from "./intermediacion.js";
import { servicioArchetype } from "./servicio.js";
import { suscripcionArchetype } from "./suscripcion.js";
import type { ArchetypeDefinition, ArchetypeId } from "./types.js";
import { usoTemporalArchetype } from "./uso-temporal.js";
import { ventaArchetype } from "./venta.js";

export const ARCHETYPES: readonly ArchetypeDefinition[] = [
  ventaArchetype,
  servicioArchetype,
  suscripcionArchetype,
  usoTemporalArchetype,
  intermediacionArchetype,
  financieraArchetype,
];

const byId = new Map(ARCHETYPES.map((a) => [a.id, a]));

export function getArchetype(
  id: ArchetypeId,
): ArchetypeDefinition | undefined {
  return byId.get(id);
}

export function requireArchetype(id: ArchetypeId): ArchetypeDefinition {
  const a = getArchetype(id);
  if (!a) throw new Error(`Arquetipo desconocido: ${id}`);
  return a;
}
