import { createTransaccionSpec } from "../elements/index.js";
import { defineStates } from "../core/lifecycle.js";
import { buildArchetypeLifecycle } from "./build-lifecycle.js";
import type { ArchetypeDefinition } from "./types.js";

const commitments = [
  { id: "c_alta", label: "Alta de acceso" },
  { id: "c_fin_periodo", label: "Fin de periodo alcanzado" },
  { id: "c_periodo_pagado", label: "Periodo liquidado" },
  { id: "c_en_pausa", label: "Entrada en pausa" },
  { id: "c_salida_pausa", label: "Salida de pausa" },
  { id: "c_baja", label: "Baja registrada" },
  { id: "c_cancelar", label: "Cancelación registrada" },
  { id: "c_impago", label: "Impago registrado" },
] as const;

const lifecycle = buildArchetypeLifecycle({
  commitments,
  states: defineStates(commitments, [
    {
      id: "propuesta",
      kind: "inicial",
      label: "Propuesta",
      fulfilledVariants: [[]],
    },
    {
      id: "activa",
      kind: "intermedio",
      label: "Activa",
      fulfilledVariants: [
        ["c_alta"],
        ["c_alta", "c_fin_periodo", "c_periodo_pagado"],
        ["c_alta", "c_en_pausa", "c_salida_pausa"],
        [
          "c_alta",
          "c_fin_periodo",
          "c_periodo_pagado",
          "c_en_pausa",
          "c_salida_pausa",
        ],
      ],
    },
    {
      id: "pausada",
      kind: "en_espera",
      label: "Pausada",
      fulfilledVariants: [
        ["c_alta", "c_en_pausa"],
        ["c_alta", "c_fin_periodo", "c_periodo_pagado", "c_en_pausa"],
      ],
    },
    {
      id: "en_renovacion",
      kind: "en_espera",
      label: "En renovación",
      fulfilledVariants: [
        ["c_alta", "c_fin_periodo"],
        ["c_alta", "c_fin_periodo", "c_en_pausa", "c_salida_pausa"],
      ],
    },
    {
      id: "cerrada",
      kind: "terminal_exito",
      label: "Cerrada",
      fulfilledVariants: [
        [
          "c_alta",
          "c_baja",
          "c_fin_periodo",
          "c_periodo_pagado",
          "c_en_pausa",
          "c_salida_pausa",
          "c_cancelar",
          "c_impago",
        ],
      ],
    },
    {
      id: "cancelada",
      kind: "terminal_excepcion",
      label: "Cancelada",
      fulfilledVariants: [["c_cancelar"]],
    },
    {
      id: "impagada",
      kind: "terminal_excepcion",
      label: "Impagada",
      fulfilledVariants: [
        ["c_alta", "c_fin_periodo", "c_impago"],
        [
          "c_alta",
          "c_fin_periodo",
          "c_en_pausa",
          "c_salida_pausa",
          "c_impago",
        ],
      ],
    },
  ]),
  happyPath: [
    {
      id: "t_activar",
      from: "propuesta",
      to: "activa",
      condition: "acceso_aceptado",
      requiredEvidence: "aceptacion",
      allowedActor: "humano",
      fulfills: ["c_alta"],
    },
    {
      id: "t_pausar",
      from: "activa",
      to: "pausada",
      condition: "pausa_solicitada",
      requiredEvidence: "aceptacion",
      allowedActor: "humano",
      fulfills: ["c_en_pausa"],
    },
    {
      id: "t_reanudar",
      from: "pausada",
      to: "activa",
      condition: "reanudacion",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_salida_pausa"],
    },
    {
      id: "t_periodo",
      from: "activa",
      to: "en_renovacion",
      condition: "fin_periodo",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_fin_periodo"],
    },
    {
      id: "t_renovar",
      from: "en_renovacion",
      to: "activa",
      condition: "pago_periodo",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_periodo_pagado"],
    },
    {
      id: "t_cerrar",
      from: "activa",
      to: "cerrada",
      condition: "baja_voluntaria",
      requiredEvidence: "aceptacion",
      allowedActor: "humano",
      fulfills: [
        "c_baja",
        "c_fin_periodo",
        "c_periodo_pagado",
        "c_en_pausa",
        "c_salida_pausa",
        "c_cancelar",
        "c_impago",
      ],
    },
  ],
  exceptions: [
    {
      id: "t_cancelar",
      from: "propuesta",
      to: "cancelada",
      condition: "cancelacion",
      requiredEvidence: "aceptacion",
      allowedActor: "humano",
      fulfills: ["c_cancelar"],
    },
    {
      id: "t_impago",
      from: "en_renovacion",
      to: "impagada",
      condition: "impago",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_impago"],
    },
  ],
});

export const suscripcionArchetype: ArchetypeDefinition = {
  id: "suscripcion",
  label: "Suscripción",
  lifecycle,
  spec: createTransaccionSpec("suscripcion", lifecycle),
  profilePriors: {
    tasa_renovacion: 0.7,
    tasa_impago: 0.08,
    tasa_baja: 0.12,
  },
};
