import { createTransaccionSpec } from "../elements/index.js";
import { defineStates } from "../core/lifecycle.js";
import { buildArchetypeLifecycle } from "./build-lifecycle.js";
import type { ArchetypeDefinition } from "./types.js";

/**
 * Intermediación con disputa (en_espera) y retención de valor
 * (movimiento_valor subtipo retencion: se libera o reembolsa al resolver).
 */
const commitments = [
  { id: "c_empatar", label: "Partes conectadas" },
  { id: "c_iniciar", label: "Intercambio en curso" },
  { id: "c_disputa", label: "Disputa abierta" },
  { id: "c_retencion", label: "Retención de valor registrada" },
  { id: "c_resolver_disputa", label: "Disputa resuelta" },
  { id: "c_cumplir_lado_a", label: "Lado A cumplido" },
  { id: "c_cumplir_lado_b", label: "Lado B cumplido" },
  { id: "c_comision", label: "Comisión liquidada" },
  { id: "c_cancelar", label: "Cancelación registrada" },
  { id: "c_fallar", label: "Fallo registrado" },
] as const;

const ALL_SUCCESS = [
  "c_empatar",
  "c_iniciar",
  "c_disputa",
  "c_retencion",
  "c_resolver_disputa",
  "c_cumplir_lado_a",
  "c_cumplir_lado_b",
  "c_comision",
  "c_cancelar",
  "c_fallar",
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
      id: "emparejada",
      kind: "intermedio",
      label: "Emparejada",
      fulfilledVariants: [["c_empatar"]],
    },
    {
      id: "en_curso",
      kind: "en_espera",
      label: "En curso (terceros)",
      fulfilledVariants: [
        ["c_empatar", "c_iniciar"],
        [
          "c_empatar",
          "c_iniciar",
          "c_disputa",
          "c_retencion",
          "c_resolver_disputa",
        ],
      ],
    },
    {
      id: "en_disputa",
      kind: "en_espera",
      label: "En disputa / retención",
      fulfilledVariants: [
        ["c_empatar", "c_iniciar", "c_disputa", "c_retencion"],
      ],
    },
    {
      id: "cerrada",
      kind: "terminal_exito",
      label: "Cerrada",
      fulfilledVariants: [[...ALL_SUCCESS]],
    },
    {
      id: "cancelada",
      kind: "terminal_excepcion",
      label: "Cancelada",
      fulfilledVariants: [["c_empatar", "c_cancelar"]],
    },
    {
      id: "fallida",
      kind: "terminal_excepcion",
      label: "Fallida",
      fulfilledVariants: [
        ["c_empatar", "c_iniciar", "c_fallar"],
        [
          "c_empatar",
          "c_iniciar",
          "c_disputa",
          "c_retencion",
          "c_fallar",
        ],
      ],
    },
  ]),
  happyPath: [
    {
      id: "t_emparejar",
      from: "propuesta",
      to: "emparejada",
      condition: "partes_aceptan",
      requiredEvidence: "aceptacion",
      allowedActor: "humano",
      fulfills: ["c_empatar"],
    },
    {
      id: "t_iniciar",
      from: "emparejada",
      to: "en_curso",
      condition: "terceros_en_curso",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_iniciar"],
    },
    {
      id: "t_abrir_disputa",
      from: "en_curso",
      to: "en_disputa",
      condition: "disputa_con_retencion",
      requiredEvidence: "aceptacion",
      allowedActor: "humano",
      fulfills: ["c_disputa", "c_retencion"],
    },
    {
      id: "t_resolver_liberar",
      from: "en_disputa",
      to: "en_curso",
      condition: "retencion_liberada",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_resolver_disputa"],
    },
    {
      id: "t_resolver_reembolsar",
      from: "en_disputa",
      to: "fallida",
      condition: "retencion_reembolsada",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_resolver_disputa", "c_fallar"],
    },
    {
      id: "t_cerrar",
      from: "en_curso",
      to: "cerrada",
      condition: "ambos_lados_y_comision",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: [
        "c_cumplir_lado_a",
        "c_cumplir_lado_b",
        "c_comision",
        "c_disputa",
        "c_retencion",
        "c_resolver_disputa",
        "c_cancelar",
        "c_fallar",
      ],
    },
  ],
  exceptions: [
    {
      id: "t_cancelar",
      from: "emparejada",
      to: "cancelada",
      condition: "cancelacion",
      requiredEvidence: "aceptacion",
      allowedActor: "humano",
      fulfills: ["c_cancelar"],
    },
    {
      id: "t_fallar",
      from: "en_curso",
      to: "fallida",
      condition: "fallo_tercero",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_fallar"],
    },
  ],
});

export const intermediacionArchetype: ArchetypeDefinition = {
  id: "intermediacion",
  label: "Intermediación",
  lifecycle,
  spec: createTransaccionSpec("intermediacion", lifecycle),
  profilePriors: {
    tasa_cierre: 0.45,
    tasa_cancelacion: 0.25,
    tasa_fallo: 0.1,
  },
};
