/**
 * Criterios Revisor de seguridad MVP:
 * - Detecta mismo rol crea y aprueba pagos
 * - Encuentra fraude proveedor ficticio si permisos lo permiten
 * - Config correcta (concesionaria) sin falsos críticos
 */

import { describe, expect, it } from "vitest";
import { defineStates } from "../core/lifecycle.js";
import type { Lifecycle } from "../core/lifecycle.js";
import {
  buildConcesionariaGeneratorInput,
  generateUiSpec,
} from "../generator/index.js";
import { runSecurityReview } from "../generator/security/index.js";
import {
  catalogFromLifecycle,
  compilePolicies,
} from "../policies/compiler.js";
import type { PolicyDocument } from "../policies/types.js";
import type { GeneratorInput } from "../generator/types.js";

function purchaseFraudLifecycle(): Lifecycle {
  const commitments = [
    { id: "c_proveedor", label: "Proveedor creado" },
    { id: "c_pedido", label: "Pedido emitido" },
    { id: "c_recibido", label: "Mercancía recibida" },
    { id: "c_pagado", label: "Pago liquidado" },
  ] as const;
  return {
    commitments: [...commitments],
    states: defineStates(commitments, [
      {
        id: "inicio",
        kind: "inicial",
        label: "Inicio",
        fulfilledVariants: [[]],
      },
      {
        id: "proveedor_ok",
        kind: "intermedio",
        label: "Proveedor",
        fulfilledVariants: [["c_proveedor"]],
      },
      {
        id: "pedido_ok",
        kind: "intermedio",
        label: "Pedido",
        fulfilledVariants: [["c_proveedor", "c_pedido"]],
      },
      {
        id: "recibido",
        kind: "intermedio",
        label: "Recibido",
        fulfilledVariants: [["c_proveedor", "c_pedido", "c_recibido"]],
      },
      {
        id: "pagado",
        kind: "terminal_exito",
        label: "Pagado",
        fulfilledVariants: [
          ["c_proveedor", "c_pedido", "c_recibido", "c_pagado"],
        ],
      },
    ]),
    transitions: [
      {
        id: "t_crear_proveedor",
        from: "inicio",
        to: "proveedor_ok",
        condition: "alta",
        requiredEvidence: "sistema",
        allowedActor: "sistema",
        fulfills: ["c_proveedor"],
      },
      {
        id: "t_pedido_proveedor",
        from: "proveedor_ok",
        to: "pedido_ok",
        condition: "pedido",
        requiredEvidence: "sistema",
        allowedActor: "sistema",
        fulfills: ["c_pedido"],
      },
      {
        id: "t_recibir_mercancia",
        from: "pedido_ok",
        to: "recibido",
        condition: "recepcion",
        requiredEvidence: "fisica",
        allowedActor: "sistema",
        fulfills: ["c_recibido"],
      },
      {
        id: "t_pagar_proveedor",
        from: "recibido",
        to: "pagado",
        condition: "pago",
        requiredEvidence: "fisica",
        allowedActor: "sistema",
        fulfills: ["c_pagado"],
      },
    ],
  };
}

function paymentSodLifecycle(): Lifecycle {
  const commitments = [
    { id: "c_creado", label: "Pago creado" },
    { id: "c_aprobado", label: "Pago aprobado" },
  ] as const;
  return {
    commitments: [...commitments],
    states: defineStates(commitments, [
      {
        id: "borrador",
        kind: "inicial",
        label: "Borrador",
        fulfilledVariants: [[]],
      },
      {
        id: "creado",
        kind: "intermedio",
        label: "Creado",
        fulfilledVariants: [["c_creado"]],
      },
      {
        id: "aprobado",
        kind: "terminal_exito",
        label: "Aprobado",
        fulfilledVariants: [["c_creado", "c_aprobado"]],
      },
    ]),
    transitions: [
      {
        id: "t_crear_pago",
        from: "borrador",
        to: "creado",
        condition: "crear",
        requiredEvidence: "aceptacion",
        allowedActor: "humano",
        fulfills: ["c_creado"],
      },
      {
        id: "t_aprobar_pago",
        from: "creado",
        to: "aprobado",
        condition: "aprobar",
        requiredEvidence: "aceptacion",
        allowedActor: "humano",
        fulfills: ["c_aprobado"],
      },
    ],
  };
}

function inputFromLife(
  caseId: string,
  life: Lifecycle,
  permissions: NonNullable<PolicyDocument["permissions"]>,
  roles: PolicyDocument["roles"],
): GeneratorInput {
  const doc: PolicyDocument = {
    id: `pol-${caseId}`,
    version: "1.0.0",
    companyId: caseId,
    archetypeId: "venta",
    roles,
    permissions,
  };
  const catalog = catalogFromLifecycle(
    life.transitions.map((t) => t.id),
    life.states.map((s) => s.id),
    ["importe", "parte_id", "factura_id"],
  );
  const ruleSet = compilePolicies(doc, {
    catalog,
    activationAt: "2026-01-01T00:00:00.000Z",
    compiledVersion: `compiled:${caseId}`,
  });
  return {
    caseId,
    caseVersion: "1",
    companyId: caseId,
    generatedAt: "2026-06-01T00:00:00.000Z",
    lifecycles: [
      { id: "lc.sec", archetypeId: "venta", lifecycle: life, label: "Sec" },
    ],
    ruleSet,
    roles,
    channels: ["backoffice"],
    resourceSubtypes: [],
    naturalezaBienes: [],
    paymentMode: "inmediato",
    hasPartes: true,
    hasMovimientos: false,
    hasFormalDocuments: false,
    hasFiscalCompliance: false,
    hasCalendar: false,
  };
}

describe("Revisor de seguridad MVP", () => {
  it("detecta una configuración donde el mismo rol crea y aprueba pagos", () => {
    const life = paymentSodLifecycle();
    const input = inputFromLife(
      "sod-pago",
      life,
      [
        {
          id: "p-crear",
          kind: "permiso",
          transitionId: "t_crear_pago",
          allowedRoles: ["tesoreria"],
        },
        {
          id: "p-aprobar",
          kind: "permiso",
          transitionId: "t_aprobar_pago",
          allowedRoles: ["tesoreria"],
        },
      ],
      [{ id: "tesoreria", label: "Tesorería" }],
    );
    const spec = generateUiSpec(input);
    const report = runSecurityReview(input, spec);

    const sod = report.findings.filter((f) => f.kind === "sod_violation");
    expect(sod.length).toBeGreaterThanOrEqual(1);
    expect(sod.some((f) => f.severity === "critical")).toBe(true);
    expect(sod.some((f) => f.step.roleId === "tesoreria")).toBe(true);
    expect(sod[0]!.demonstration).toEqual(
      expect.arrayContaining(["t_crear_pago", "t_aprobar_pago"]),
    );
    expect(report.deliveryBlocked).toBe(true);
    expect(report.proposals.length).toBeGreaterThan(0);
  });

  it("encuentra la secuencia de fraude con proveedor ficticio si los permisos lo permiten", () => {
    const life = purchaseFraudLifecycle();
    const all = life.transitions.map((t) => t.id);
    const input = inputFromLife(
      "fraud-prov",
      life,
      all.map((tid) => ({
        id: `p-${tid}`,
        kind: "permiso" as const,
        transitionId: tid,
        allowedRoles: ["comprador"] as const,
      })),
      [{ id: "comprador", label: "Comprador" }],
    );
    const spec = generateUiSpec(input);
    const report = runSecurityReview(input, spec);

    const fraud = report.findings.filter((f) => f.kind === "fraud_sequence");
    expect(fraud.length).toBeGreaterThanOrEqual(1);
    expect(fraud[0]!.severity).toBe("critical");
    expect(fraud[0]!.demonstration).toEqual([
      "t_crear_proveedor",
      "t_pedido_proveedor",
      "t_recibir_mercancia",
      "t_pagar_proveedor",
    ]);
    expect(report.deliveryBlocked).toBe(true);
  });

  it("una configuración correcta no genera falsos críticos", () => {
    const input = buildConcesionariaGeneratorInput();
    const spec = generateUiSpec(input);
    const report = runSecurityReview(input, spec);
    const criticals = report.findings.filter((f) => f.severity === "critical");
    expect(criticals).toEqual([]);
    expect(report.deliveryBlocked).toBe(false);
  });
});
