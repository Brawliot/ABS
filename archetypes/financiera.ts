import { createTransaccionSpec } from "../elements/index.js";
import { defineStates } from "../core/lifecycle.js";
import { buildArchetypeLifecycle } from "./build-lifecycle.js";
import type { ArchetypeDefinition } from "./types.js";

const commitments = [
  { id: "c_aprobar_riesgo", label: "Riesgo aprobado" },
  { id: "c_desembolsar", label: "Desembolso / cobertura emitida" },
  { id: "c_calendario", label: "Calendario de amortización activo" },
  { id: "c_amortizar", label: "Obligación liquidada" },
  { id: "c_rechazar", label: "Rechazo registrado" },
  { id: "c_impago", label: "Impago registrado" },
] as const;

const lifecycle = buildArchetypeLifecycle({
  commitments,
  states: defineStates(commitments, [
    {
      id: "solicitud",
      kind: "inicial",
      label: "Solicitud",
      fulfilledVariants: [[]],
    },
    {
      id: "aprobada",
      kind: "intermedio",
      label: "Aprobada",
      fulfilledVariants: [["c_aprobar_riesgo"]],
    },
    {
      id: "desembolsada",
      kind: "intermedio",
      label: "Desembolsada",
      fulfilledVariants: [["c_aprobar_riesgo", "c_desembolsar"]],
    },
    {
      id: "en_amortizacion",
      kind: "en_espera",
      label: "En amortización",
      fulfilledVariants: [["c_aprobar_riesgo", "c_desembolsar", "c_calendario"]],
    },
    {
      id: "cerrada",
      kind: "terminal_exito",
      label: "Cerrada",
      fulfilledVariants: [
        [
          "c_aprobar_riesgo",
          "c_desembolsar",
          "c_calendario",
          "c_amortizar",
          "c_rechazar",
          "c_impago",
        ],
      ],
    },
    {
      id: "rechazada",
      kind: "terminal_excepcion",
      label: "Rechazada",
      fulfilledVariants: [["c_rechazar"]],
    },
    {
      id: "impagada",
      kind: "terminal_excepcion",
      label: "Impagada",
      fulfilledVariants: [
        ["c_aprobar_riesgo", "c_desembolsar", "c_calendario", "c_impago"],
      ],
    },
  ]),
  happyPath: [
    {
      id: "t_aprobar",
      from: "solicitud",
      to: "aprobada",
      condition: "riesgo_ok",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_aprobar_riesgo"],
    },
    {
      id: "t_desembolsar",
      from: "aprobada",
      to: "desembolsada",
      condition: "fondos_emitidos",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_desembolsar"],
    },
    {
      id: "t_amortizar",
      from: "desembolsada",
      to: "en_amortizacion",
      condition: "calendario_activo",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_calendario"],
    },
    {
      id: "t_cerrar",
      from: "en_amortizacion",
      to: "cerrada",
      condition: "saldo_cero",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_amortizar", "c_rechazar", "c_impago"],
    },
  ],
  exceptions: [
    {
      id: "t_rechazar",
      from: "solicitud",
      to: "rechazada",
      condition: "riesgo_no_ok",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_rechazar"],
    },
    {
      id: "t_impago",
      from: "en_amortizacion",
      to: "impagada",
      condition: "impago",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_impago"],
    },
  ],
});

export const financieraArchetype: ArchetypeDefinition = {
  id: "financiera",
  label: "Financiera",
  lifecycle,
  spec: createTransaccionSpec("financiera", lifecycle),
  profilePriors: {
    tasa_aprobacion: 0.6,
    tasa_impago: 0.07,
    tasa_cierre: 0.5,
  },
};
