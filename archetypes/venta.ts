import { createTransaccionSpec } from "../elements/index.js";
import { defineStates } from "../core/lifecycle.js";
import { buildArchetypeLifecycle } from "./build-lifecycle.js";
import type { ArchetypeDefinition } from "./types.js";

/**
 * Venta: un acuerdo; cada entrega es un compromiso propio (t_entrega_parcial).
 * Renegociación: nueva versión de Oferta + aceptación referida a esa versión.
 */
const commitments = [
  { id: "c_aceptar_oferta", label: "Oferta aceptada (versión concreta)" },
  { id: "c_propuesta_nueva_version", label: "Nueva versión de oferta propuesta" },
  { id: "c_nueva_version_aceptada", label: "Nueva versión de oferta aceptada" },
  { id: "c_reservar", label: "Recursos reservados para entrega" },
  { id: "c_entrega_tramo", label: "Tramo de entrega registrado" },
  { id: "c_entregar", label: "Bien entregado (completo)" },
  { id: "c_pagar", label: "Pago liquidado" },
  { id: "c_cancelar", label: "Cancelación registrada" },
  { id: "c_incumplir", label: "Incumplimiento registrado" },
] as const;

const ALL = [
  "c_aceptar_oferta",
  "c_propuesta_nueva_version",
  "c_nueva_version_aceptada",
  "c_reservar",
  "c_entrega_tramo",
  "c_entregar",
  "c_pagar",
  "c_cancelar",
  "c_incumplir",
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
      id: "aceptada",
      kind: "intermedio",
      label: "Aceptada",
      fulfilledVariants: [
        ["c_aceptar_oferta"],
        [
          "c_aceptar_oferta",
          "c_propuesta_nueva_version",
          "c_nueva_version_aceptada",
        ],
      ],
    },
    {
      id: "renegociacion",
      kind: "en_espera",
      label: "Renegociación de oferta",
      fulfilledVariants: [["c_aceptar_oferta", "c_propuesta_nueva_version"]],
    },
    {
      id: "en_entrega",
      kind: "en_espera",
      label: "En entrega",
      fulfilledVariants: [
        ["c_aceptar_oferta", "c_reservar"],
        [
          "c_aceptar_oferta",
          "c_propuesta_nueva_version",
          "c_nueva_version_aceptada",
          "c_reservar",
        ],
        ["c_aceptar_oferta", "c_reservar", "c_entrega_tramo"],
        [
          "c_aceptar_oferta",
          "c_propuesta_nueva_version",
          "c_nueva_version_aceptada",
          "c_reservar",
          "c_entrega_tramo",
        ],
      ],
    },
    {
      id: "cerrada",
      kind: "terminal_exito",
      label: "Cerrada",
      fulfilledVariants: [[...ALL]],
    },
    {
      id: "cancelada",
      kind: "terminal_excepcion",
      label: "Cancelada",
      fulfilledVariants: [
        ["c_cancelar"],
        ["c_aceptar_oferta", "c_cancelar"],
        [
          "c_aceptar_oferta",
          "c_propuesta_nueva_version",
          "c_cancelar",
        ],
        [
          "c_aceptar_oferta",
          "c_propuesta_nueva_version",
          "c_nueva_version_aceptada",
          "c_cancelar",
        ],
      ],
    },
    {
      id: "incumplida",
      kind: "terminal_excepcion",
      label: "Incumplida",
      fulfilledVariants: [
        ["c_aceptar_oferta", "c_reservar", "c_incumplir"],
        [
          "c_aceptar_oferta",
          "c_propuesta_nueva_version",
          "c_nueva_version_aceptada",
          "c_reservar",
          "c_incumplir",
        ],
        ["c_aceptar_oferta", "c_reservar", "c_entrega_tramo", "c_incumplir"],
        [
          "c_aceptar_oferta",
          "c_propuesta_nueva_version",
          "c_nueva_version_aceptada",
          "c_reservar",
          "c_entrega_tramo",
          "c_incumplir",
        ],
      ],
    },
  ]),
  happyPath: [
    {
      id: "t_aceptar",
      from: "propuesta",
      to: "aceptada",
      condition: "oferta_version_aceptada",
      requiredEvidence: "aceptacion",
      allowedActor: "humano",
      fulfills: ["c_aceptar_oferta"],
    },
    {
      id: "t_proponer_renegociacion",
      from: "aceptada",
      to: "renegociacion",
      condition: "nueva_version_oferta",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_propuesta_nueva_version"],
    },
    {
      id: "t_aceptar_nueva_version",
      from: "renegociacion",
      to: "aceptada",
      condition: "oferta_version_aceptada",
      requiredEvidence: "aceptacion",
      allowedActor: "humano",
      fulfills: ["c_nueva_version_aceptada"],
    },
    {
      id: "t_iniciar_entrega",
      from: "aceptada",
      to: "en_entrega",
      condition: "recursos_reservados",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_reservar"],
    },
    {
      id: "t_entrega_parcial",
      from: "en_entrega",
      to: "en_entrega",
      condition: "tramo_entrega_parcial",
      requiredEvidence: "fisica",
      allowedActor: "sistema",
      fulfills: ["c_entrega_tramo"],
    },
    {
      id: "t_cerrar",
      from: "en_entrega",
      to: "cerrada",
      condition: "entrega_y_pago_completos",
      requiredEvidence: "fisica",
      allowedActor: "sistema",
      fulfills: [
        "c_entregar",
        "c_pagar",
        "c_entrega_tramo",
        "c_propuesta_nueva_version",
        "c_nueva_version_aceptada",
        "c_cancelar",
        "c_incumplir",
      ],
    },
  ],
  exceptions: [
    {
      id: "t_cancelar_propuesta",
      from: "propuesta",
      to: "cancelada",
      condition: "cancelacion",
      requiredEvidence: "aceptacion",
      allowedActor: "humano",
      fulfills: ["c_cancelar"],
    },
    {
      id: "t_cancelar_aceptada",
      from: "aceptada",
      to: "cancelada",
      condition: "cancelacion",
      requiredEvidence: "aceptacion",
      allowedActor: "humano",
      fulfills: ["c_cancelar"],
    },
    {
      id: "t_cancelar_renegociacion",
      from: "renegociacion",
      to: "cancelada",
      condition: "cancelacion",
      requiredEvidence: "aceptacion",
      allowedActor: "humano",
      fulfills: ["c_cancelar"],
    },
    {
      id: "t_incumplir_entrega",
      from: "en_entrega",
      to: "incumplida",
      condition: "incumplimiento",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_incumplir"],
    },
  ],
});

export const ventaArchetype: ArchetypeDefinition = {
  id: "venta",
  label: "Venta",
  lifecycle,
  spec: createTransaccionSpec("venta", lifecycle),
  profilePriors: {
    tasa_cierre: 0.55,
    tasa_cancelacion: 0.2,
    tasa_incumplimiento: 0.05,
  },
};
