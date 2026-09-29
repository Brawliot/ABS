import { createTransaccionSpec } from "../elements/index.js";
import { defineStates } from "../core/lifecycle.js";
import { buildArchetypeLifecycle } from "./build-lifecycle.js";
import type { ArchetypeDefinition } from "./types.js";

const commitments = [
  { id: "c_acordar_alcance", label: "Alcance acordado" },
  { id: "c_iniciar_trabajo", label: "Trabajo iniciado" },
  { id: "c_entregar_trabajo", label: "Trabajo entregado" },
  { id: "c_aceptar_entrega", label: "Entrega aceptada" },
  { id: "c_cancelar", label: "Cancelación registrada" },
  { id: "c_fallar", label: "Fallo registrado" },
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
      id: "acordado",
      kind: "intermedio",
      label: "Acordado",
      fulfilledVariants: [["c_acordar_alcance"]],
    },
    {
      id: "en_ejecucion",
      kind: "intermedio",
      label: "En ejecución",
      fulfilledVariants: [["c_acordar_alcance", "c_iniciar_trabajo"]],
    },
    {
      id: "en_espera",
      kind: "en_espera",
      label: "En espera de aceptación",
      fulfilledVariants: [
        ["c_acordar_alcance", "c_iniciar_trabajo", "c_entregar_trabajo"],
      ],
    },
    {
      id: "cerrada",
      kind: "terminal_exito",
      label: "Cerrada",
      fulfilledVariants: [
        [
          "c_acordar_alcance",
          "c_iniciar_trabajo",
          "c_entregar_trabajo",
          "c_aceptar_entrega",
          "c_cancelar",
          "c_fallar",
        ],
      ],
    },
    {
      id: "cancelada",
      kind: "terminal_excepcion",
      label: "Cancelada",
      fulfilledVariants: [["c_acordar_alcance", "c_cancelar"]],
    },
    {
      id: "fallida",
      kind: "terminal_excepcion",
      label: "Fallida",
      fulfilledVariants: [
        ["c_acordar_alcance", "c_iniciar_trabajo", "c_fallar"],
        [
          "c_acordar_alcance",
          "c_iniciar_trabajo",
          "c_entregar_trabajo",
          "c_fallar",
        ],
      ],
    },
  ]),
  happyPath: [
    {
      id: "t_acordar",
      from: "propuesta",
      to: "acordado",
      condition: "alcance_aceptado",
      requiredEvidence: "aceptacion",
      allowedActor: "humano",
      fulfills: ["c_acordar_alcance"],
    },
    {
      id: "t_ejecutar",
      from: "acordado",
      to: "en_ejecucion",
      condition: "inicio_trabajo",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_iniciar_trabajo"],
    },
    {
      id: "t_presentar",
      from: "en_ejecucion",
      to: "en_espera",
      condition: "entrega_presentada",
      requiredEvidence: "fisica",
      allowedActor: "humano",
      fulfills: ["c_entregar_trabajo"],
    },
    {
      id: "t_cerrar",
      from: "en_espera",
      to: "cerrada",
      condition: "aceptacion_entrega",
      requiredEvidence: "aceptacion",
      allowedActor: "humano",
      fulfills: ["c_aceptar_entrega", "c_cancelar", "c_fallar"],
    },
  ],
  exceptions: [
    {
      id: "t_cancelar",
      from: "acordado",
      to: "cancelada",
      condition: "cancelacion",
      requiredEvidence: "aceptacion",
      allowedActor: "humano",
      fulfills: ["c_cancelar"],
    },
    {
      id: "t_fallar",
      from: "en_ejecucion",
      to: "fallida",
      condition: "fallo_ejecucion",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_fallar"],
    },
    {
      id: "t_rechazar_entrega",
      from: "en_espera",
      to: "fallida",
      condition: "rechazo_entrega",
      requiredEvidence: "aceptacion",
      allowedActor: "humano",
      fulfills: ["c_fallar"],
    },
  ],
});

export const servicioArchetype: ArchetypeDefinition = {
  id: "servicio_proyecto",
  label: "Servicio / proyecto",
  lifecycle,
  spec: createTransaccionSpec("servicio_proyecto", lifecycle),
  profilePriors: {
    tasa_cierre: 0.5,
    tasa_cancelacion: 0.15,
    tasa_fallo: 0.1,
  },
};
