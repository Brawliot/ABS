/**
 * Especificaciones de caso de prueba (JSON versionado como objetos tipados).
 */

import type { ComposedArchetypeSpec } from "../archetypes/types.js";
import type { DiagnosisSpec } from "../diagnosis/questions.js";
import { validateComposition } from "../archetypes/composition.js";
import { validateLifecycle } from "../core/validator.js";
import { requireArchetype } from "../archetypes/catalog.js";
import { MetaObjectRegistry } from "../core/metaobject.js";

export interface CaseSpec {
  readonly id: string;
  readonly version: string;
  readonly label: string;
  readonly composition: ComposedArchetypeSpec;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly audit: DiagnosisSpec["audit"];
}

export function assertCaseValid(caseSpec: CaseSpec): void {
  const compositionResult = validateComposition(caseSpec.composition);
  if (!compositionResult.ok) {
    throw new Error(
      `Caso ${caseSpec.id} composición inválida: ${compositionResult.issues.map((i) => i.message).join("; ")}`,
    );
  }

  const registry = new MetaObjectRegistry();
  const dominant = requireArchetype(caseSpec.composition.dominant);
  const dominantValidation = validateLifecycle(dominant.lifecycle);
  if (!dominantValidation.ok) {
    throw new Error(`Caso ${caseSpec.id}: dominante inválido`);
  }

  registry.register(dominant.spec, {
    subtype: dominant.id,
    arquetipo_id: dominant.id,
    ...caseSpec.parameters,
  });

  for (const sec of caseSpec.composition.secondaries) {
    const arch = requireArchetype(sec.secondaryArchetypeId);
    const id = `${arch.spec.identity.id}::${caseSpec.id}::${sec.secondaryArchetypeId}`;
    registry.register(
      {
        ...arch.spec,
        identity: { ...arch.spec.identity, id },
      },
      {
        subtype: arch.id,
        arquetipo_id: arch.id,
        dominante_id: caseSpec.id,
      },
    );
  }
}

/** Concesionaria: venta dominante + financiera + servicio. */
export const concesionariaCase: CaseSpec = {
  id: "case-concesionaria",
  version: "1.1.0",
  label: "Concesionaria (venta + financiera + servicio)",
  composition: {
    dominant: "venta",
    secondaries: [
      {
        secondaryArchetypeId: "financiera",
        bornInDominantState: "aceptada",
        bloquea: "en_entrega",
      },
      {
        secondaryArchetypeId: "servicio_proyecto",
        bornInDominantState: "cerrada",
        bloquea: "en_entrega",
      },
    ],
  },
  parameters: {
    oferta_version_aceptada: 1,
  },
  audit: [
    {
      at: "2026-01-01T00:00:00.000Z",
      decision: "dominant",
      detail: { archetype: "venta" },
    },
    {
      at: "2026-01-01T00:00:00.000Z",
      decision: "secondary",
      detail: { archetype: "financiera" },
    },
    {
      at: "2026-01-01T00:00:00.000Z",
      decision: "secondary",
      detail: { archetype: "servicio_proyecto" },
    },
  ],
};

export const ventaOnlyCase: CaseSpec = {
  id: "case-venta",
  version: "1.1.0",
  label: "Venta pura",
  composition: { dominant: "venta", secondaries: [] },
  parameters: { oferta_version_aceptada: 1 },
  audit: [
    {
      at: "2026-01-01T00:00:00.000Z",
      decision: "dominant",
      detail: { archetype: "venta" },
    },
  ],
};

export const servicioOnlyCase: CaseSpec = {
  id: "case-servicio",
  version: "1.1.0",
  label: "Servicio / proyecto",
  composition: { dominant: "servicio_proyecto", secondaries: [] },
  parameters: {},
  audit: [
    {
      at: "2026-01-01T00:00:00.000Z",
      decision: "dominant",
      detail: { archetype: "servicio_proyecto" },
    },
  ],
};

export const suscripcionOnlyCase: CaseSpec = {
  id: "case-suscripcion",
  version: "1.1.0",
  label: "Suscripción",
  composition: { dominant: "suscripcion", secondaries: [] },
  parameters: {},
  audit: [
    {
      at: "2026-01-01T00:00:00.000Z",
      decision: "dominant",
      detail: { archetype: "suscripcion" },
    },
  ],
};

export const usoTemporalOnlyCase: CaseSpec = {
  id: "case-uso-temporal",
  version: "1.1.0",
  label: "Uso temporal",
  composition: { dominant: "uso_temporal", secondaries: [] },
  parameters: {},
  audit: [
    {
      at: "2026-01-01T00:00:00.000Z",
      decision: "dominant",
      detail: { archetype: "uso_temporal" },
    },
  ],
};

export const intermediacionOnlyCase: CaseSpec = {
  id: "case-intermediacion",
  version: "1.1.0",
  label: "Intermediación",
  composition: { dominant: "intermediacion", secondaries: [] },
  parameters: {},
  audit: [
    {
      at: "2026-01-01T00:00:00.000Z",
      decision: "dominant",
      detail: { archetype: "intermediacion" },
    },
  ],
};

export const financieraOnlyCase: CaseSpec = {
  id: "case-financiera",
  version: "1.1.0",
  label: "Financiera",
  composition: { dominant: "financiera", secondaries: [] },
  parameters: {},
  audit: [
    {
      at: "2026-01-01T00:00:00.000Z",
      decision: "dominant",
      detail: { archetype: "financiera" },
    },
  ],
};

export const ALL_ARCHETYPE_CASES: readonly CaseSpec[] = [
  ventaOnlyCase,
  servicioOnlyCase,
  suscripcionOnlyCase,
  usoTemporalOnlyCase,
  intermediacionOnlyCase,
  financieraOnlyCase,
];
