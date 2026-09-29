/**
 * Ciclos de vida derivados: nunca avanzan solos.
 * Su estado se deriva exclusivamente de eventos de transacciones.
 */

import type { Lifecycle } from "../core/lifecycle.js";
import { defineStates } from "../core/lifecycle.js";

/** Parte: prospecto → activo → inactivo */
const parteCommitments = [
  { id: "c_parte_activar", label: "Parte activada vía transacción" },
  { id: "c_parte_desactivar", label: "Parte desactivada vía transacción" },
] as const;

export const parteDerivedLifecycle: Lifecycle = {
  commitments: [...parteCommitments],
  states: defineStates(parteCommitments, [
    {
      id: "prospecto",
      kind: "inicial",
      label: "Prospecto",
      fulfilledVariants: [[]],
    },
    {
      id: "activo",
      kind: "intermedio",
      label: "Activo",
      fulfilledVariants: [["c_parte_activar"]],
    },
    {
      id: "inactivo",
      kind: "terminal_exito",
      label: "Inactivo",
      fulfilledVariants: [["c_parte_activar", "c_parte_desactivar"]],
    },
  ]),
  transitions: [
    {
      id: "t_parte_activar",
      from: "prospecto",
      to: "activo",
      condition: "derivado_de_transaccion",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_parte_activar"],
    },
    {
      id: "t_parte_desactivar",
      from: "activo",
      to: "inactivo",
      condition: "derivado_de_transaccion",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_parte_desactivar"],
    },
  ],
};

/** Oferta: borrador → vigente → retirada */
const ofertaCommitments = [
  { id: "c_oferta_vigente", label: "Oferta publicada" },
  { id: "c_oferta_retirada", label: "Oferta retirada" },
] as const;

export const ofertaDerivedLifecycle: Lifecycle = {
  commitments: [...ofertaCommitments],
  states: defineStates(ofertaCommitments, [
    {
      id: "borrador",
      kind: "inicial",
      label: "Borrador",
      fulfilledVariants: [[]],
    },
    {
      id: "vigente",
      kind: "intermedio",
      label: "Vigente",
      fulfilledVariants: [["c_oferta_vigente"]],
    },
    {
      id: "retirada",
      kind: "terminal_exito",
      label: "Retirada",
      fulfilledVariants: [["c_oferta_vigente", "c_oferta_retirada"]],
    },
  ]),
  transitions: [
    {
      id: "t_oferta_publicar",
      from: "borrador",
      to: "vigente",
      condition: "derivado_de_transaccion",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_oferta_vigente"],
    },
    {
      id: "t_oferta_retirar",
      from: "vigente",
      to: "retirada",
      condition: "derivado_de_transaccion",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_oferta_retirada"],
    },
  ],
};

/**
 * Recurso: disponible → reservado → liquidado (consumido o devuelto).
 * Un solo terminal de éxito: ambas vías resuelven la misma situación.
 */
const recursoCommitments = [
  { id: "c_recurso_reservar", label: "Recurso reservado" },
  { id: "c_recurso_liquidar", label: "Recurso consumido o devuelto" },
] as const;

export const recursoDerivedLifecycle: Lifecycle = {
  commitments: [...recursoCommitments],
  states: defineStates(recursoCommitments, [
    {
      id: "disponible",
      kind: "inicial",
      label: "Disponible",
      fulfilledVariants: [[]],
    },
    {
      id: "reservado",
      kind: "intermedio",
      label: "Reservado",
      fulfilledVariants: [["c_recurso_reservar"]],
    },
    {
      id: "consumido",
      kind: "terminal_exito",
      label: "Consumido o devuelto",
      fulfilledVariants: [["c_recurso_reservar", "c_recurso_liquidar"]],
    },
  ]),
  transitions: [
    {
      id: "t_recurso_reservar",
      from: "disponible",
      to: "reservado",
      condition: "derivado_de_transaccion",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_recurso_reservar"],
    },
    {
      id: "t_recurso_consumir",
      from: "reservado",
      to: "consumido",
      condition: "derivado_de_transaccion",
      requiredEvidence: "fisica",
      allowedActor: "sistema",
      fulfills: ["c_recurso_liquidar"],
    },
    {
      id: "t_recurso_devolver",
      from: "reservado",
      to: "consumido",
      condition: "derivado_de_transaccion",
      requiredEvidence: "fisica",
      allowedActor: "humano",
      fulfills: ["c_recurso_liquidar"],
    },
  ],
};

/** Compromiso: pendiente → cumplido | incumplido */
const compromisoCommitments = [
  { id: "c_comp_cumplir", label: "Compromiso cumplido" },
  { id: "c_comp_incumplir", label: "Compromiso incumplido" },
] as const;

export const compromisoDerivedLifecycle: Lifecycle = {
  commitments: [...compromisoCommitments],
  states: defineStates(compromisoCommitments, [
    {
      id: "pendiente",
      kind: "inicial",
      label: "Pendiente",
      fulfilledVariants: [[]],
    },
    {
      id: "cumplido",
      kind: "terminal_exito",
      label: "Cumplido",
      fulfilledVariants: [["c_comp_cumplir", "c_comp_incumplir"]],
    },
    {
      id: "incumplido",
      kind: "terminal_excepcion",
      label: "Incumplido",
      fulfilledVariants: [["c_comp_incumplir"]],
    },
  ]),
  transitions: [
    {
      id: "t_comp_cumplir",
      from: "pendiente",
      to: "cumplido",
      condition: "derivado_de_transaccion",
      requiredEvidence: "aceptacion",
      allowedActor: "sistema",
      fulfills: ["c_comp_cumplir", "c_comp_incumplir"],
    },
    {
      id: "t_comp_incumplir",
      from: "pendiente",
      to: "incumplido",
      condition: "derivado_de_transaccion",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_comp_incumplir"],
    },
  ],
};

/** Movimiento: emitido → liquidado | revertido */
const movimientoCommitments = [
  { id: "c_mov_liquidar", label: "Movimiento liquidado" },
  { id: "c_mov_revertir", label: "Movimiento revertido" },
] as const;

export const movimientoDerivedLifecycle: Lifecycle = {
  commitments: [...movimientoCommitments],
  states: defineStates(movimientoCommitments, [
    {
      id: "emitido",
      kind: "inicial",
      label: "Emitido",
      fulfilledVariants: [[]],
    },
    {
      id: "liquidado",
      kind: "terminal_exito",
      label: "Liquidado",
      fulfilledVariants: [["c_mov_liquidar", "c_mov_revertir"]],
    },
    {
      id: "revertido",
      kind: "terminal_excepcion",
      label: "Revertido",
      fulfilledVariants: [["c_mov_revertir"]],
    },
  ]),
  transitions: [
    {
      id: "t_mov_liquidar",
      from: "emitido",
      to: "liquidado",
      condition: "derivado_de_transaccion",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_mov_liquidar", "c_mov_revertir"],
    },
    {
      id: "t_mov_revertir",
      from: "emitido",
      to: "revertido",
      condition: "derivado_de_transaccion",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_mov_revertir"],
    },
  ],
};

/** Evidencia: registrada → validada | rechazada */
const evidenciaCommitments = [
  { id: "c_ev_validar", label: "Evidencia validada" },
  { id: "c_ev_rechazar", label: "Evidencia rechazada" },
] as const;

export const evidenciaDerivedLifecycle: Lifecycle = {
  commitments: [...evidenciaCommitments],
  states: defineStates(evidenciaCommitments, [
    {
      id: "registrada",
      kind: "inicial",
      label: "Registrada",
      fulfilledVariants: [[]],
    },
    {
      id: "validada",
      kind: "terminal_exito",
      label: "Validada",
      fulfilledVariants: [["c_ev_validar", "c_ev_rechazar"]],
    },
    {
      id: "rechazada",
      kind: "terminal_excepcion",
      label: "Rechazada",
      fulfilledVariants: [["c_ev_rechazar"]],
    },
  ]),
  transitions: [
    {
      id: "t_ev_validar",
      from: "registrada",
      to: "validada",
      condition: "derivado_de_transaccion",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_ev_validar", "c_ev_rechazar"],
    },
    {
      id: "t_ev_rechazar",
      from: "registrada",
      to: "rechazada",
      condition: "derivado_de_transaccion",
      requiredEvidence: "sistema",
      allowedActor: "humano",
      fulfills: ["c_ev_rechazar"],
    },
  ],
};

/**
 * Actor, Estado y Evento no tienen ciclo operativo propio avanzable:
 * son estructurales. Se modela un ciclo trivial derivado (registrado → anclado).
 */
const structuralCommitments = [
  { id: "c_anclar", label: "Anclado por evento de transacción" },
] as const;

export const structuralAnchorLifecycle: Lifecycle = {
  commitments: [...structuralCommitments],
  states: defineStates(structuralCommitments, [
    {
      id: "registrado",
      kind: "inicial",
      label: "Registrado",
      fulfilledVariants: [[]],
    },
    {
      id: "anclado",
      kind: "terminal_exito",
      label: "Anclado",
      fulfilledVariants: [["c_anclar"]],
    },
  ]),
  transitions: [
    {
      id: "t_anclar",
      from: "registrado",
      to: "anclado",
      condition: "derivado_de_transaccion",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_anclar"],
    },
  ],
};
