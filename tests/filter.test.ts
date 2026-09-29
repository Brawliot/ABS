import { describe, expect, it } from "vitest";
import {
  catalogFromLifecycle,
  compilePolicies,
} from "../policies/compiler.js";
import { ventaArchetype } from "../archetypes/venta.js";
import {
  assertNoDirectStoreAccess,
  createPresentationReadGateway,
  evaluateFieldAccess,
  Layer2DirectAccessError,
  readThroughFilter,
  sealAgainstLayer2DirectAccess,
  DEFAULT_FIELD_RULES,
  type FilterReader,
  type FilterRow,
} from "../filter/index.js";
import type { PolicyDocument } from "../policies/types.js";

const life = ventaArchetype.lifecycle;
const catalog = catalogFromLifecycle(
  life.transitions.map((t) => t.id),
  life.states.map((s) => s.id),
  ["importe", "base_imponible", "iva", "nif", "email", "parte_id"],
);
const activationAt = "2026-04-01T00:00:00.000Z";

function compileDoc(over: Partial<PolicyDocument> = {}) {
  const doc: PolicyDocument = {
    id: "filtro-pack",
    version: "1.0.0",
    companyId: "acme",
    archetypeId: "venta",
    roles: [
      { id: "vendedor", label: "Vendedor" },
      { id: "finanzas", label: "Finanzas" },
      { id: "cliente", label: "Cliente" },
      { id: "gerente", label: "Gerente" },
    ],
    organization: {
      sedes: [
        { id: "sede-a", label: "Sede A" },
        { id: "sede-b", label: "Sede B" },
      ],
      equipos: [
        { id: "eq-a", label: "Ventas A", sedeId: "sede-a" },
        { id: "eq-b", label: "Ventas B", sedeId: "sede-b" },
      ],
      assignments: [
        {
          actorId: "u-vend-a",
          sedeId: "sede-a",
          equipoId: "eq-a",
          roleId: "vendedor",
        },
        {
          actorId: "u-vend-b",
          sedeId: "sede-b",
          equipoId: "eq-b",
          roleId: "vendedor",
        },
        {
          actorId: "u-fin",
          sedeId: "sede-a",
          equipoId: "eq-a",
          roleId: "finanzas",
        },
        {
          actorId: "u-cli",
          sedeId: "sede-a",
          equipoId: "eq-a",
          roleId: "cliente",
        },
      ],
    },
    permissions: [
      {
        id: "vis-vend",
        kind: "permiso",
        action: "consultar",
        allowedRoles: ["vendedor", "finanzas", "gerente"],
        visibility: { scope: "sede" },
      },
      {
        id: "vis-portal",
        kind: "permiso",
        action: "consultar",
        allowedRoles: ["cliente"],
        visibility: { scope: "propia" },
      },
    ],
    ...over,
  };
  return compilePolicies(doc, { catalog, activationAt });
}

const rows: FilterRow[] = [
  {
    kind: "transaccion",
    id: "tx-a1",
    tenantId: "acme",
    sedeId: "sede-a",
    equipoId: "eq-a",
    parteId: "parte-ana",
    fields: {
      importe: 1000,
      base_imponible: 826.45,
      iva: 173.55,
      nif: "A12345678",
      email: "ana@example.com",
      estado: "aceptada",
    },
  },
  {
    kind: "transaccion",
    id: "tx-b1",
    tenantId: "acme",
    sedeId: "sede-b",
    equipoId: "eq-b",
    parteId: "parte-bob",
    fields: {
      importe: 500,
      base_imponible: 413.22,
      iva: 86.78,
      nif: "B99999999",
      email: "bob@example.com",
      estado: "propuesta",
    },
  },
  {
    kind: "transaccion",
    id: "tx-a2",
    tenantId: "acme",
    sedeId: "sede-a",
    equipoId: "eq-a",
    parteId: "parte-ana",
    fields: {
      importe: 200,
      base_imponible: 165.29,
      iva: 34.71,
      nif: "A12345678",
      email: "ana@example.com",
      estado: "en_entrega",
    },
  },
];

describe("Filtro — juez de lectura capa 2", () => {
  it("un vendedor de la sede A no ve transacciones de la sede B", () => {
    const ruleSet = compileDoc();
    const reader: FilterReader = {
      id: "u-vend-a",
      roles: ["vendedor"],
      tenantId: "acme",
    };
    const result = readThroughFilter(reader, rows, ruleSet);
    const ids = result.items.map((i) => i.row.id).sort();
    expect(ids).toEqual(["tx-a1", "tx-a2"]);
    expect(result.denied.some((d) => d.rowId === "tx-b1")).toBe(true);
  });

  it("un rol sin permiso fiscal ve la transacción pero no esos campos", () => {
    const ruleSet = compileDoc();
    const reader: FilterReader = {
      id: "u-vend-a",
      roles: ["vendedor"],
      tenantId: "acme",
    };
    const result = readThroughFilter(reader, rows, ruleSet);
    const tx = result.items.find((i) => i.row.id === "tx-a1");
    expect(tx).toBeDefined();
    expect(tx!.fields.importe).toBe(1000);
    expect(tx!.fields.estado).toBe("aceptada");
    expect(tx!.fields.base_imponible).toBeUndefined();
    expect(tx!.fields.iva).toBeUndefined();
    expect(tx!.fields.nif).toBeUndefined();
    expect(tx!.redactedFields).toEqual(
      expect.arrayContaining(["base_imponible", "iva", "nif"]),
    );

    const fin: FilterReader = {
      id: "u-fin",
      roles: ["finanzas"],
      tenantId: "acme",
    };
    const withFiscal = readThroughFilter(fin, rows, ruleSet);
    const txFin = withFiscal.items.find((i) => i.row.id === "tx-a1");
    expect(txFin!.fields.base_imponible).toBe(826.45);
    expect(txFin!.fields.iva).toBe(173.55);
    expect(txFin!.fields.nif).toBe("A12345678");
  });

  it("el Portal del cliente solo muestra las transacciones de esa Parte", () => {
    const ruleSet = compileDoc();
    const reader: FilterReader = {
      id: "u-cli",
      roles: ["cliente"],
      tenantId: "acme",
      parteId: "parte-ana",
    };
    const result = readThroughFilter(reader, rows, ruleSet);
    const ids = result.items.map((i) => i.row.id).sort();
    expect(ids).toEqual(["tx-a1", "tx-a2"]);
    expect(ids).not.toContain("tx-b1");
  });

  it("un intento de lectura directa desde la capa 2 falla", () => {
    const fakeStore = {
      eventStore: { all: () => [] },
      projection: {},
      read: () => null,
    };
    const sealed = sealAgainstLayer2DirectAccess(fakeStore);
    expect(() => sealed.eventStore).toThrow(Layer2DirectAccessError);
    expect(() => sealed.projection).toThrow(Layer2DirectAccessError);

    expect(() =>
      assertNoDirectStoreAccess({
        eventStore: {},
        ui: true,
      }),
    ).toThrow(Layer2DirectAccessError);

    const gw = createPresentationReadGateway();
    expect(() => (gw as unknown as { eventStore: unknown }).eventStore).toThrow(
      Layer2DirectAccessError,
    );
  });

  it("accesos a datos personales quedan registrados", () => {
    const ruleSet = compileDoc();
    const reader: FilterReader = {
      id: "u-vend-a",
      roles: ["vendedor"],
      tenantId: "acme",
    };
    // vendedor no está en allowedRoles de email en DEFAULT — comercial sí.
    // Ajustamos: vendedor no ve email; comercial-equivalente vía finanzas
    const fin: FilterReader = {
      id: "u-fin",
      roles: ["finanzas"],
      tenantId: "acme",
    };
    const result = readThroughFilter(
      fin,
      rows,
      ruleSet,
      { fieldRules: DEFAULT_FIELD_RULES },
      "2026-06-01T12:00:00.000Z",
    );
    expect(result.personalAccessLog.length).toBeGreaterThan(0);
    expect(result.personalAccessLog[0]?.fields).toContain("email");
    expect(result.personalAccessLog[0]?.purpose).toBe("consulta");
    expect(result.personalAccessLog[0]?.readerId).toBe("u-fin");
  });

  it("evaluateFieldAccess es puro y determinista", () => {
    const reader: FilterReader = {
      id: "x",
      roles: ["vendedor"],
      tenantId: "acme",
    };
    const a = evaluateFieldAccess(reader, "iva", 10, {
      fieldRules: DEFAULT_FIELD_RULES,
    });
    const b = evaluateFieldAccess(reader, "iva", 10, {
      fieldRules: DEFAULT_FIELD_RULES,
    });
    expect(a).toEqual(b);
    expect(a.visible).toBe(false);
  });
});
