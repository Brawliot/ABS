import { createTransaccionSpec } from "../elements/index.js";
import { defineStates } from "../core/lifecycle.js";
import { buildArchetypeLifecycle } from "./build-lifecycle.js";
import type { ArchetypeDefinition } from "./types.js";

const commitments = [
  { id: "c_reservar", label: "Recurso reservado" },
  { id: "c_iniciar_uso", label: "Uso iniciado" },
  { id: "c_devolver", label: "Recurso devuelto" },
  { id: "c_cobrar_uso", label: "Uso cobrado" },
  { id: "c_cancelar", label: "Cancelación registrada" },
  { id: "c_no_devolver", label: "Falta de devolución registrada" },
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
      id: "reservada",
      kind: "intermedio",
      label: "Reservada",
      fulfilledVariants: [["c_reservar"]],
    },
    {
      id: "en_uso",
      kind: "intermedio",
      label: "En uso",
      fulfilledVariants: [["c_reservar", "c_iniciar_uso"]],
    },
    {
      id: "cerrada",
      kind: "terminal_exito",
      label: "Cerrada",
      fulfilledVariants: [
        [
          "c_reservar",
          "c_iniciar_uso",
          "c_devolver",
          "c_cobrar_uso",
          "c_cancelar",
          "c_no_devolver",
        ],
      ],
    },
    {
      id: "cancelada",
      kind: "terminal_excepcion",
      label: "Cancelada",
      fulfilledVariants: [["c_reservar", "c_cancelar"]],
    },
    {
      id: "no_devuelta",
      kind: "terminal_excepcion",
      label: "No devuelta",
      fulfilledVariants: [["c_reservar", "c_iniciar_uso", "c_no_devolver"]],
    },
  ]),
  happyPath: [
    {
      id: "t_reservar",
      from: "propuesta",
      to: "reservada",
      condition: "reserva_aceptada",
      requiredEvidence: "aceptacion",
      allowedActor: "humano",
      fulfills: ["c_reservar"],
    },
    {
      id: "t_iniciar_uso",
      from: "reservada",
      to: "en_uso",
      condition: "entrega_temporal",
      requiredEvidence: "fisica",
      allowedActor: "sistema",
      fulfills: ["c_iniciar_uso"],
    },
    {
      id: "t_cerrar",
      from: "en_uso",
      to: "cerrada",
      condition: "devolucion_y_cobro",
      requiredEvidence: "fisica",
      allowedActor: "sistema",
      fulfills: ["c_devolver", "c_cobrar_uso", "c_cancelar", "c_no_devolver"],
    },
  ],
  exceptions: [
    {
      id: "t_cancelar",
      from: "reservada",
      to: "cancelada",
      condition: "cancelacion",
      requiredEvidence: "aceptacion",
      allowedActor: "humano",
      fulfills: ["c_cancelar"],
    },
    {
      id: "t_no_devolver",
      from: "en_uso",
      to: "no_devuelta",
      condition: "falta_devolucion",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_no_devolver"],
    },
  ],
});

export const usoTemporalArchetype: ArchetypeDefinition = {
  id: "uso_temporal",
  label: "Uso temporal",
  lifecycle,
  spec: createTransaccionSpec("uso_temporal", lifecycle),
  profilePriors: {
    tasa_devolucion: 0.9,
    tasa_cancelacion: 0.1,
    tasa_no_devolucion: 0.05,
  },
};
