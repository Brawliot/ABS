/**
 * Máquina de ejemplo mínima (4 estados) — sin lógica de negocio concreta.
 * Sirve para validar gramática, validador y derivación.
 *
 * flujo: borrador --aceptar--> activo --cerrar--> cerrado
 *                            \--rechazar--> anulado
 */

import type { Lifecycle } from "../core/lifecycle.js";
import { defineStates } from "../core/lifecycle.js";
import type { MetaObjectSpec } from "../core/metaobject.js";

const commitments = [
  { id: "c_aceptacion", label: "Aceptación registrada" },
  { id: "c_cierre", label: "Cierre registrado" },
  { id: "c_rechazo", label: "Rechazo registrado" },
] as const;

export const minimalExampleLifecycle: Lifecycle = {
  commitments: [...commitments],
  states: defineStates(commitments, [
    {
      id: "borrador",
      kind: "inicial",
      label: "Borrador",
      fulfilledVariants: [[]],
    },
    {
      id: "activo",
      kind: "intermedio",
      label: "Activo",
      fulfilledVariants: [["c_aceptacion"]],
    },
    {
      id: "cerrado",
      kind: "terminal_exito",
      label: "Cerrado",
      // Éxito: happy path + marcador de rechazo no aplicado
      fulfilledVariants: [["c_aceptacion", "c_cierre", "c_rechazo"]],
    },
    {
      id: "anulado",
      kind: "terminal_excepcion",
      label: "Anulado",
      fulfilledVariants: [["c_aceptacion", "c_rechazo"]],
    },
  ]),
  transitions: [
    {
      id: "t_aceptar",
      from: "borrador",
      to: "activo",
      condition: "aceptacion_presente",
      requiredEvidence: "aceptacion",
      allowedActor: "humano",
      fulfills: ["c_aceptacion"],
    },
    {
      id: "t_cerrar",
      from: "activo",
      to: "cerrado",
      condition: "cierre_autorizado",
      requiredEvidence: "sistema",
      allowedActor: "sistema",
      fulfills: ["c_cierre", "c_rechazo"],
    },
    {
      id: "t_rechazar",
      from: "activo",
      to: "anulado",
      condition: "rechazo_registrado",
      requiredEvidence: "aceptacion",
      allowedActor: "humano",
      fulfills: ["c_rechazo"],
    },
  ],
};

export const minimalExampleSpec: MetaObjectSpec = {
  identity: {
    id: "meta-example-minimal",
    elementKind: "transaccion",
    grammarVersion: "1.0.0",
  },
  definition: {
    subtype: "ejemplo_estructural",
    fields: [
      { name: "codigo", type: "string", required: true },
    ],
  },
  lifecycle: minimalExampleLifecycle,
  invariants: [
    {
      id: "inv_siempre",
      appliesInStates: [],
      predicate: "always_true",
      description: "Invariante estructural siempre verdadera",
    },
    {
      id: "inv_cerrado_sin_pendientes",
      appliesInStates: ["cerrado"],
      predicate: "no_pending_commitments",
      description: "En terminal de éxito no quedan compromisos pendientes",
    },
  ],
};
