/**
 * Validador en tiempo de ejecución. Entrada inválida → BusinessProfileError.
 */

import type { BusinessProfile } from "./types.js";
import { BusinessProfileError } from "./types.js";
import { businessProfileZod, SUPPORTED_SCHEMA_VERSIONS } from "./schema.js";
import { isKnown } from "./field.js";

function collectContradictions(profile: BusinessProfile): string[] {
  const issues: string[] = [];
  const { capabilities, resourceSubtypes, naturalezaBienes, channels } =
    profile;

  if (
    isKnown(capabilities.hasCalendar) &&
    capabilities.hasCalendar.value === false &&
    isKnown(resourceSubtypes) &&
    resourceSubtypes.value.includes("capacidad_temporal")
  ) {
    issues.push(
      "Contradicción: hasCalendar=false (sin citas) pero resourceSubtypes incluye capacidad_temporal",
    );
  }

  if (
    isKnown(capabilities.hasCalendar) &&
    capabilities.hasCalendar.value === true &&
    profile.calendar.status === "not_applicable"
  ) {
    issues.push(
      "Contradicción: hasCalendar=true (tiene citas) pero calendar es not_applicable",
    );
  }

  if (
    isKnown(capabilities.hasFiscalCompliance) &&
    capabilities.hasFiscalCompliance.value === true &&
    isKnown(capabilities.hasFormalDocuments) &&
    capabilities.hasFormalDocuments.value === false
  ) {
    issues.push(
      "Contradicción: hasFiscalCompliance=true requiere hasFormalDocuments=true",
    );
  }

  if (
    isKnown(capabilities.hasFiscalCompliance) &&
    capabilities.hasFiscalCompliance.value === true &&
    isKnown(capabilities.hasMovimientos) &&
    capabilities.hasMovimientos.value === false
  ) {
    issues.push(
      "Contradicción: hasFiscalCompliance=true requiere hasMovimientos=true",
    );
  }

  if (
    isKnown(naturalezaBienes) &&
    naturalezaBienes.value.includes("propios_por_cantidad") &&
    isKnown(capabilities.hasPartes) &&
    capabilities.hasPartes.value === false
  ) {
    issues.push(
      "Contradicción: inventario por cantidad (propios_por_cantidad) sin Partes",
    );
  }

  if (isKnown(channels) && channels.value.includes("autoservicio")) {
    // El materializador añade rol cliente + visibilidad propia;
    // no se rechaza aquí si falta el rol.
  }

  if (isKnown(profile.processes)) {
    const ids = new Set<string>();
    for (const p of profile.processes.value) {
      if (ids.has(p.id)) {
        issues.push(`Contradicción: process id duplicado "${p.id}"`);
      }
      ids.add(p.id);
    }
    const dominant = profile.policyMeta.dominantArchetypeId;
    if (!profile.processes.value.some((p) => p.archetypeId === dominant)) {
      issues.push(
        `Contradicción: dominantArchetypeId="${dominant}" no está en processes`,
      );
    }

    if (profile.composition && isKnown(profile.composition)) {
      const comp = profile.composition.value;
      const archIds = new Set(profile.processes.value.map((p) => p.archetypeId));
      if (!archIds.has(comp.dominant)) {
        issues.push(
          `Contradicción: composition.dominant="${comp.dominant}" no está en processes`,
        );
      }
      if (comp.dominant !== dominant) {
        issues.push(
          `Contradicción: composition.dominant="${comp.dominant}" ≠ policyMeta.dominantArchetypeId="${dominant}"`,
        );
      }
      for (const sec of comp.secondaries) {
        if (!archIds.has(sec.secondaryArchetypeId)) {
          issues.push(
            `Contradicción: secundario "${sec.secondaryArchetypeId}" no está en processes`,
          );
        }
      }
    }
  }

  return issues;
}

export function validateBusinessProfile(raw: unknown): BusinessProfile {
  if (raw === null || typeof raw !== "object") {
    throw new BusinessProfileError(
      "SCHEMA",
      "BusinessProfile debe ser un objeto JSON",
    );
  }

  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (typeof version === "string" && !SUPPORTED_SCHEMA_VERSIONS.has(version)) {
    throw new BusinessProfileError(
      "UNSUPPORTED_VERSION",
      `schemaVersion "${version}" no soportada; soportadas: ${[...SUPPORTED_SCHEMA_VERSIONS].join(", ")}`,
      [version],
    );
  }

  const parsed = businessProfileZod.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`,
    );
    throw new BusinessProfileError(
      "SCHEMA",
      `BusinessProfile inválido: ${details[0] ?? "error de esquema"}`,
      details,
    );
  }

  const profile = parsed.data as BusinessProfile;
  const contradictions = collectContradictions(profile);
  if (contradictions.length > 0) {
    throw new BusinessProfileError(
      "CONTRADICTION",
      contradictions[0]!,
      contradictions,
    );
  }

  return profile;
}
