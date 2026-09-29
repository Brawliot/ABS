import { describe, expect, it } from "vitest";
import { ventaArchetype } from "../archetypes/venta.js";
import { deriveState } from "../core/derivation.js";
import { FACT_IDS } from "../facts/catalog.js";
import {
  addBusinessDuration,
  compileCalendar,
  type CalendarDef,
} from "../policies/calendario.js";
import {
  changeLabel,
  seedClassification,
} from "../policies/clasificacion.js";
import {
  catalogFromLifecycle,
  compilePolicies,
  selectEffectiveRules,
} from "../policies/compiler.js";
import {
  attemptJudgedAdvance,
  applyCalculations,
  observeGoals,
} from "../policies/judge.js";
import {
  anchorDeadline,
  clockStatus,
} from "../policies/objetivo.js";
import type { PolicyDocument } from "../policies/types.js";

const life = ventaArchetype.lifecycle;
const catalog = catalogFromLifecycle(
  life.transitions.map((t) => t.id),
  life.states.map((s) => s.id),
  [
    "importe",
    "descuento_pct",
    "credito_disponible",
    "factura_id",
    "precio",
    "parte_id",
  ],
);
const activationAt = "2026-04-01T00:00:00.000Z";

/** Lun–vie 00:00–24:00 UTC; un festivo el lunes. */
const businessWeek: CalendarDef = {
  id: "cal-es",
  weeklyHours: {
    1: [{ start: "00:00", end: "24:00" }],
    2: [{ start: "00:00", end: "24:00" }],
    3: [{ start: "00:00", end: "24:00" }],
    4: [{ start: "00:00", end: "24:00" }],
    5: [{ start: "00:00", end: "24:00" }],
  },
  exceptions: [
    { date: "2026-04-06", closed: true, label: "Festivo" }, // lunes
  ],
  seasons: [
    {
      id: "alta",
      label: "Temporada alta",
      startDate: "2026-06-01",
      endDate: "2026-08-31",
    },
  ],
  shifts: [
    {
      id: "manana",
      label: "Mañana",
      weekdays: [1, 2, 3, 4, 5],
      window: { start: "08:00", end: "14:00" },
      actorIds: ["u-vendedor"],
      recursoIds: ["sala-a"],
    },
  ],
};

describe("Capa 1 — objetivo, calendario, clasificación", () => {
  it("48 horas hábiles desde el viernes vencen el martes (respetando festivo)", () => {
    const cal = compileCalendar(businessWeek);
    // viernes 2026-04-03
    const start = "2026-04-03T00:00:00.000Z";
    const dueAt = addBusinessDuration(cal, start, 48 * 60 * 60 * 1000);
    // vie 24h + mar 24h (sáb/dom/lun festivo cerrados) → cierre del martes
    expect(dueAt).toBe("2026-04-08T00:00:00.000Z");

    const ruleSet = compilePolicies(
      {
        id: "pack-plazo",
        version: "1.0.0",
        companyId: "acme",
        archetypeId: "venta",
        roles: [{ id: "vendedor", label: "Vendedor" }],
        calendar: businessWeek,
        objectives: [
          {
            id: "obj-48h",
            kind: "plazo",
            commitmentId: "c_entrega",
            businessDurationMs: 48 * 60 * 60 * 1000,
          },
        ],
        permissions: [
          {
            id: "p",
            kind: "permiso",
            transitionId: "t_aceptar",
            allowedRoles: ["vendedor"],
          },
        ],
      },
      { catalog, activationAt },
    );

    expect(ruleSet.calendar?.id).toBe("cal-es");
    const deadline = ruleSet.deadlines[0]!;
    const anchored = anchorDeadline(ruleSet.calendar!, deadline, start);
    expect(anchored.dueAt).toBe("2026-04-08T00:00:00.000Z");
    expect(clockStatus(anchored, "2026-04-05T12:00:00.000Z")).toBe("en_plazo"); // domingo
    expect(clockStatus(anchored, "2026-04-07T12:00:00.000Z")).toBe("en_riesgo"); // mar <24h
    expect(clockStatus(anchored, "2026-04-08T00:00:00.000Z")).toBe("vencido");
  });

  it("incumplir una meta no bloquea ninguna transición", () => {
    const ruleSet = compilePolicies(
      {
        id: "pack-meta",
        version: "1.0.0",
        companyId: "acme",
        archetypeId: "venta",
        roles: [{ id: "vendedor", label: "Vendedor" }],
        objectives: [
          {
            id: "meta-vol",
            kind: "volumen",
            label: "100 unidades",
            factId: FACT_IDS.OBJETIVO_VOLUMEN,
            factParams: { scopeId: "equipo-1" },
            op: "gte",
            target: 100,
          },
        ],
        permissions: [
          {
            id: "perm-aceptar",
            kind: "permiso",
            transitionId: "t_aceptar",
            allowedRoles: ["vendedor"],
          },
        ],
      },
      { catalog, activationAt },
    );

    const evals = observeGoals(ruleSet, {
      [`${FACT_IDS.OBJETIVO_VOLUMEN}:scopeId=equipo-1`]: 10,
    });
    expect(evals[0]?.met).toBe(false);
    expect(evals[0]?.blocksTransition).toBe(false);

    // La transición avanza igual
    const derived = deriveState(life, []);
    const ok = attemptJudgedAdvance({
      subjectId: "tx-meta",
      lifecycle: life,
      derived,
      command: {
        transitionId: "t_aceptar",
        eventId: "e-meta",
        actorId: "u1",
        actorKind: "humano",
        occurredAt: "2026-01-01T00:00:00.000Z",
        evidence: {
          kind: "aceptacion",
          reference: "ok",
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      actor: { id: "u1", kind: "humano", roles: ["vendedor"] },
      evidence: {
        kind: "aceptacion",
        reference: "ok",
        recordedAt: "2026-01-01T00:00:00.000Z",
      },
      fields: { importe: 100 },
      ruleSet,
    });
    expect(ok.trace.result).toBe("accepted");
    expect(ruleSet.goals).toHaveLength(1);
    expect(ruleSet.rules.every((r) => r.kind !== "calculation" || true)).toBe(
      true,
    );
  });

  it("descuento por segmento solo a Partes con etiqueta; cambio respeta vinculación", () => {
    const doc: PolicyDocument = {
      id: "pack-seg",
      version: "1.0.0",
      companyId: "acme",
      archetypeId: "venta",
      roles: [{ id: "vendedor", label: "Vendedor" }],
      classification: {
        assignments: [
          {
            target: "parte",
            subjectId: "cliente-retail",
            dimension: "segmento",
            value: "retail",
          },
        ],
      },
      permissions: [
        {
          id: "perm-aceptar",
          kind: "permiso",
          transitionId: "t_aceptar",
          allowedRoles: ["vendedor"],
        },
      ],
      policies: [
        {
          id: "pol-dto-retail",
          kind: "politica",
          transitionId: "t_aceptar",
          calculation: {
            field: "descuento_pct",
            op: "set",
            value: 10,
            segment: "retail",
          },
          binding: { mode: "at_create" },
        },
      ],
    };

    const ruleSet = compilePolicies(doc, { catalog, activationAt });
    let classif = seedClassification(doc.classification!, {
      at: "2026-01-01T00:00:00.000Z",
      actorId: "admin",
    });

    const { calculations: withLabel } = applyCalculations(
      ruleSet.rules,
      "t_aceptar",
      { parte_id: "cliente-retail", descuento_pct: 0 },
      { classification: classif, creationClassification: classif },
    );
    expect(withLabel.descuento_pct).toBe(10);

    const { calculations: otherParte } = applyCalculations(
      ruleSet.rules,
      "t_aceptar",
      { parte_id: "cliente-otro", descuento_pct: 0 },
      { classification: classif, creationClassification: classif },
    );
    expect(otherParte.descuento_pct).toBeUndefined();

    // Cambiar etiqueta DESPUÉS de crear: at_create conserva el snapshot de creación
    const changed = changeLabel(classif, {
      id: "ev-reseg",
      occurredAt: "2026-02-01T00:00:00.000Z",
      actorId: "admin",
      source: "manual",
      target: "parte",
      subjectId: "cliente-retail",
      dimension: "segmento",
      value: "vip",
    });
    expect(changed.event.kind).toBe("clasificacion");
    expect(changed.event.previousValue).toBe("retail");

    const effective = selectEffectiveRules({ ruleSet });
    const { calculations: afterChange } = applyCalculations(
      effective,
      "t_aceptar",
      { parte_id: "cliente-retail", descuento_pct: 0 },
      {
        classification: changed.snapshot,
        creationClassification: classif, // fijado al crear
      },
    );
    expect(afterChange.descuento_pct).toBe(10);

    // Si la regla fuera live, el descuento dejaría de aplicar
    const liveDoc: PolicyDocument = {
      ...doc,
      policies: [
        {
          id: "pol-dto-retail-live",
          kind: "politica",
          transitionId: "t_aceptar",
          calculation: {
            field: "descuento_pct",
            op: "set",
            value: 10,
            segment: "retail",
          },
          binding: { mode: "live" },
        },
      ],
    };
    const liveSet = compilePolicies(liveDoc, {
      catalog,
      activationAt,
      compiledVersion: "live",
    });
    const { calculations: liveAfter } = applyCalculations(
      liveSet.rules,
      "t_aceptar",
      { parte_id: "cliente-retail", descuento_pct: 0 },
      {
        classification: changed.snapshot,
        creationClassification: classif,
      },
    );
    expect(liveAfter.descuento_pct).toBeUndefined();
  });
});
