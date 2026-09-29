/**
 * Nivel 7 — Seguridad ejecutable: aislamiento, filtro, forzado, SoD, fraude.
 */

import { describe, expect, it } from "vitest";
import { readThroughFilter, type FilterReader, type FilterRow } from "../../filter/index.js";
import {
  catalogFromLifecycle,
  compilePolicies,
} from "../../policies/compiler.js";
import { ventaArchetype } from "../../archetypes/venta.js";
import { deriveState } from "../../core/derivation.js";
import {
  attemptJudgedAdvance,
} from "../../policies/judge.js";
import {
  buildConcesionariaGeneratorInput,
  generateUiSpec,
} from "../../generator/index.js";
import { runSecurityReview } from "../../generator/security/index.js";
import { MultiTenantVault, TenantIsolationError } from "../../tenancy/index.js";
import { defineStates } from "../../core/lifecycle.js";
import type { Lifecycle } from "../../core/lifecycle.js";
import type { PolicyDocument } from "../../policies/types.js";
import type { GeneratorInput } from "../../generator/types.js";

const life = ventaArchetype.lifecycle;
const catalog = catalogFromLifecycle(
  life.transitions.map((t) => t.id),
  life.states.map((s) => s.id),
  ["importe", "parte_id", "factura_id"],
);

describe("Nivel 7 — Seguridad", () => {
  it("aislamiento multiempresa: vault rechaza cruce de tenant", () => {
    const vault = new MultiTenantVault();
    vault.registerCompany("acme");
    vault.registerCompany("otra");
    expect(() => vault.readEvents("acme", "otra")).toThrow(
      TenantIsolationError,
    );
  });

  it("Filtro: lector de sede A no ve filas de sede B", () => {
    const ruleSet = compilePolicies(
      {
        id: "sec-f",
        version: "1",
        companyId: "acme",
        archetypeId: "venta",
        roles: [{ id: "vendedor", label: "V" }],
        organization: {
          sedes: [
            { id: "sede-a", label: "A" },
            { id: "sede-b", label: "B" },
          ],
          equipos: [
            { id: "eq-a", label: "A", sedeId: "sede-a" },
            { id: "eq-b", label: "B", sedeId: "sede-b" },
          ],
          assignments: [
            {
              actorId: "u-a",
              sedeId: "sede-a",
              equipoId: "eq-a",
              roleId: "vendedor",
            },
          ],
        },
        permissions: [
          {
            id: "vis",
            kind: "permiso",
            action: "consultar",
            allowedRoles: ["vendedor"],
            visibility: { scope: "sede" },
          },
        ],
      },
      { catalog, activationAt: "2026-01-01T00:00:00.000Z" },
    );
    const rows: FilterRow[] = [
      {
        kind: "transaccion",
        id: "tx-a",
        tenantId: "acme",
        sedeId: "sede-a",
        fields: {},
      },
      {
        kind: "transaccion",
        id: "tx-b",
        tenantId: "acme",
        sedeId: "sede-b",
        fields: {},
      },
    ];
    const reader: FilterReader = {
      id: "u-a",
      roles: ["vendedor"],
      tenantId: "acme",
    };
    const r = readThroughFilter(reader, rows, ruleSet);
    expect(r.items.map((i) => i.row.id)).toEqual(["tx-a"]);
  });

  it("vía de forzado: sin permiso de forzar → ForceNotAllowedError", () => {
    const ruleSet = compilePolicies(
      {
        id: "sec-force",
        version: "1",
        companyId: "acme",
        archetypeId: "venta",
        roles: [
          { id: "vendedor", label: "V" },
          { id: "gerente", label: "G" },
        ],
        permissions: [
          {
            id: "p",
            kind: "permiso",
            transitionId: "t_aceptar",
            allowedRoles: ["gerente"],
          },
        ],
      },
      { catalog, activationAt: "2026-01-01T00:00:00.000Z" },
    );
    expect(() =>
      attemptJudgedAdvance({
        subjectId: "tx",
        lifecycle: life,
        derived: deriveState(life, []),
        command: {
          transitionId: "t_aceptar",
          eventId: "e",
          actorId: "v",
          actorKind: "humano",
          occurredAt: "2026-01-01T00:00:00.000Z",
          evidence: {
            kind: "aceptacion",
            reference: "r",
            recordedAt: "2026-01-01T00:00:00.000Z",
          },
        },
        actor: { id: "v", kind: "humano", roles: ["vendedor"] },
        evidence: {
          kind: "aceptacion",
          reference: "r",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
        fields: { importe: 1 },
        ruleSet,
        force: {
          reason: "urgente",
          // Lista vacía = sin permiso explícito de forzar esa regla
          allowedForceRuleIds: [],
        },
      }),
    ).toThrow(/Forzado rechazado|sin permiso explícito de forzado/);
  });

  it("Revisor: SoD mismo rol crea y aprueba pago → deliveryBlocked", () => {
    const commitments = [
      { id: "c_creado", label: "Creado" },
      { id: "c_aprobado", label: "Aprobado" },
    ] as const;
    const payLife: Lifecycle = {
      commitments: [...commitments],
      states: defineStates(commitments, [
        {
          id: "borrador",
          kind: "inicial",
          label: "B",
          fulfilledVariants: [[]],
        },
        {
          id: "creado",
          kind: "intermedio",
          label: "C",
          fulfilledVariants: [["c_creado"]],
        },
        {
          id: "aprobado",
          kind: "terminal_exito",
          label: "A",
          fulfilledVariants: [["c_creado", "c_aprobado"]],
        },
      ]),
      transitions: [
        {
          id: "t_crear_pago",
          from: "borrador",
          to: "creado",
          condition: "c",
          requiredEvidence: "aceptacion",
          allowedActor: "humano",
          fulfills: ["c_creado"],
        },
        {
          id: "t_aprobar_pago",
          from: "creado",
          to: "aprobado",
          condition: "a",
          requiredEvidence: "aceptacion",
          allowedActor: "humano",
          fulfills: ["c_aprobado"],
        },
      ],
    };
    const doc: PolicyDocument = {
      id: "sod",
      version: "1",
      companyId: "sod",
      archetypeId: "venta",
      roles: [{ id: "tesoreria", label: "T" }],
      permissions: [
        {
          id: "c",
          kind: "permiso",
          transitionId: "t_crear_pago",
          allowedRoles: ["tesoreria"],
        },
        {
          id: "a",
          kind: "permiso",
          transitionId: "t_aprobar_pago",
          allowedRoles: ["tesoreria"],
        },
      ],
    };
    const cat = catalogFromLifecycle(
      payLife.transitions.map((t) => t.id),
      payLife.states.map((s) => s.id),
      ["importe"],
    );
    const input: GeneratorInput = {
      caseId: "sod",
      caseVersion: "1",
      companyId: "sod",
      generatedAt: "2026-06-01T00:00:00.000Z",
      lifecycles: [
        { id: "lc", archetypeId: "venta", lifecycle: payLife },
      ],
      ruleSet: compilePolicies(doc, {
        catalog: cat,
        activationAt: "2026-01-01T00:00:00.000Z",
      }),
      roles: doc.roles,
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
    const report = runSecurityReview(input, generateUiSpec(input));
    expect(report.findings.some((f) => f.kind === "sod_violation")).toBe(true);
    expect(report.deliveryBlocked).toBe(true);
  });

  it("configuración correcta (concesionaria) no bloquea por seguridad", () => {
    const input = buildConcesionariaGeneratorInput();
    const report = runSecurityReview(input, generateUiSpec(input));
    expect(report.deliveryBlocked).toBe(false);
  });
});
