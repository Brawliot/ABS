/**
 * Pack concesionaria — instancia BusinessProfile.
 * Composición canónica: sale del compositor (no hardcode en el camino principal).
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { financieraArchetype } from "../../archetypes/financiera.js";
import { requireArchetype } from "../../archetypes/catalog.js";
import type { ComposedArchetypeSpec } from "../../archetypes/types.js";
import type { PolicyDocument, PermissionPolicy } from "../../policies/types.js";
import type { GeneratorInput } from "../types.js";
import {
  businessProfileToGeneratorInput,
  validateBusinessProfile,
} from "../../contracts/business-profile/index.js";
import { readProfileJson } from "../../contracts/business-profile/sources/json-file.js";
import { isKnown } from "../../contracts/business-profile/field.js";
import type { SystemIds } from "../../contracts/business-profile/system-ids.js";
import { concesionariaCase } from "../../spec/cases.js";
import {
  composeBusinessProfile,
  applyComposerToMaterialize,
} from "../../composer/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CONCESIONARIA_PROFILE_PATH = join(
  HERE,
  "../../contracts/business-profile/fixtures/concesionaria.profile.json",
);

/** Ids históricos del pack (generados por el sistema / registro de casos). */
export const CONCESIONARIA_SYSTEM_IDS: SystemIds = {
  caseId: "case-concesionaria",
  caseVersion: "1.1.0",
  documentId: "pol-concesionaria",
  compiledVersion: "compiled:concesionaria-1",
  activationAt: "2026-04-01T00:00:00.000Z",
};

/**
 * Composición de referencia histórica (spec/cases).
 * Oráculo de equivalencia; el camino vivo usa el compositor.
 */
export const CONCESIONARIA_COMPOSITION: ComposedArchetypeSpec =
  concesionariaCase.composition;

export function concesionariaBusinessProfile() {
  return validateBusinessProfile(readProfileJson(CONCESIONARIA_PROFILE_PATH));
}

/** Composición producida por el compositor sobre el perfil concesionaria. */
export function composeConcesionaria(): ComposedArchetypeSpec {
  const profile = concesionariaBusinessProfile();
  const result = composeBusinessProfile(profile);
  if (!result.ok) {
    throw new Error(`Compositor concesionaria: ${result.message}`);
  }
  if (!result.composition) {
    throw new Error("Compositor concesionaria: composición vacía");
  }
  return result.composition;
}

export function concesionariaPolicyDocument(): PolicyDocument {
  const profile = concesionariaBusinessProfile();
  if (!isKnown(profile.roles)) {
    throw new Error("Perfil concesionaria: roles deben ser known");
  }
  if (!isKnown(profile.permissions)) {
    throw new Error("Perfil concesionaria: permissions deben ser known");
  }
  if (!isKnown(profile.compliance)) {
    throw new Error("Perfil concesionaria: compliance deben ser known");
  }
  if (!isKnown(profile.calendar)) {
    throw new Error("Perfil concesionaria: calendar deben ser known");
  }

  const venta = requireArchetype("venta");
  const servicio = requireArchetype("servicio_proyecto");
  const transitionIds = [
    ...new Set([
      ...venta.lifecycle.transitions.map((t) => t.id),
      ...servicio.lifecycle.transitions.map((t) => t.id),
      ...financieraArchetype.lifecycle.transitions.map((t) => t.id),
    ]),
  ];

  const fallback = isKnown(profile.permissionFallback)
    ? profile.permissionFallback.value
    : undefined;
  const covered = new Set(
    profile.permissions.value
      .map((p) => p.transitionId)
      .filter((id): id is string => typeof id === "string"),
  );
  for (const id of fallback?.excludeTransitionIds ?? []) {
    covered.add(id);
  }

  const permissions: PermissionPolicy[] = [...profile.permissions.value];
  if (fallback) {
    for (const tid of transitionIds) {
      if (covered.has(tid)) continue;
      permissions.push({
        id: `perm-${tid}`,
        kind: "permiso",
        transitionId: tid,
        allowedRoles: [fallback.roleId],
      });
    }
  }

  return {
    id: CONCESIONARIA_SYSTEM_IDS.documentId,
    version: profile.policyMeta.documentVersion,
    companyId: profile.identity.companyId,
    archetypeId: profile.policyMeta.dominantArchetypeId,
    roles: [...profile.roles.value],
    calendar: profile.calendar.value,
    permissions,
    compliance: [...profile.compliance.value],
  };
}

/** Input sin composition (baseline funcional / materialize directo). */
export function buildConcesionariaGeneratorInput(
  generatedAt = "2026-06-01T00:00:00.000Z",
): GeneratorInput {
  return businessProfileToGeneratorInput(
    readProfileJson(CONCESIONARIA_PROFILE_PATH),
    {
      generatedAt,
      systemIds: CONCESIONARIA_SYSTEM_IDS,
    },
  );
}

/**
 * Pack + composición del compositor.
 * Preferir esta función para UI por proceso/secundario.
 */
export function buildConcesionariaGeneratorInputWithComposition(
  generatedAt = "2026-06-01T00:00:00.000Z",
): GeneratorInput {
  const profile = concesionariaBusinessProfile();
  const composed = composeBusinessProfile(profile);
  if (!composed.ok) {
    throw new Error(`Compositor concesionaria: ${composed.message}`);
  }
  const pipe = applyComposerToMaterialize(profile, composed, {
    generatedAt,
    systemIds: CONCESIONARIA_SYSTEM_IDS,
  });
  return pipe.input;
}

/** Alias explícito: composición vía compositor. */
export const buildConcesionariaGeneratorInputFromComposer =
  buildConcesionariaGeneratorInputWithComposition;
