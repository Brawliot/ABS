/**
 * tpl.aviso_plazo en gestoría (p06): aviso al responsable vía Priorizador, sin bloquear.
 */

import { describe, expect, it } from "vitest";
import { bootProfile } from "../web/boot-profile.js";
import {
  buildAvisoPlazoInsight,
  prioritizeAvisoPlazo,
} from "../contracts/policy-templates/index.js";
import type { PolicyTemplateInvocation } from "../contracts/policy-templates/types.js";

describe("tpl.aviso_plazo — gestoría p06", () => {
  it("el perfil incluye la plantilla y no genera reglas bloqueantes", () => {
    const boot = bootProfile("p06-gestoria");
    const invs =
      (
        boot.input as {
          policyTemplates?: readonly PolicyTemplateInvocation[];
        }
      ).policyTemplates ??
      [];
    // Las plantillas pueden estar materializadas solo en ruleSet; buscar en boot vía sample
    const fromRules = boot.input.ruleSet.rules.some(
      (r) => r.sourcePolicyId?.includes("aviso"),
    );
    expect(fromRules).toBe(false);

    const avisoInv: PolicyTemplateInvocation = {
      id: "sample-aviso-plazo",
      plantilla: "tpl.aviso_plazo",
      parametros: { dias_antes: 10 },
    };
    const deadline = "2026-06-15T00:00:00.000Z";
    const now = "2026-06-10T00:00:00.000Z"; // 5 días antes → dentro de ventana 10d
    const insight = buildAvisoPlazoInsight(avisoInv, {
      tenantId: "gestoria",
      subjectId: "tx-gestoria-1",
      deadlineAt: deadline,
      now,
      responsibleRoles: ["gerente"],
    });
    expect(insight).not.toBeNull();
    expect(insight!.type).toBe("alerta");
    expect(insight!.complianceDerived).toBe(true);

    const { prioritized } = prioritizeAvisoPlazo(avisoInv, {
      tenantId: "gestoria",
      subjectId: "tx-gestoria-1",
      deadlineAt: deadline,
      now,
      responsibleRoles: ["gerente"],
    });
    expect(prioritized).not.toBeNull();
    expect(prioritized!.items.length).toBe(1);
    expect(prioritized!.interruptLimit).toBeGreaterThan(0);
    // No interrumpe si el cupo está agotado
    const deferred = prioritizeAvisoPlazo(avisoInv, {
      tenantId: "gestoria",
      subjectId: "tx-gestoria-1",
      deadlineAt: deadline,
      now,
      responsibleRoles: ["gerente"],
      interruptsAlreadyToday: 99,
    });
    expect(deferred.prioritized!.items[0]!.urgency).not.toBe("interrumpir");
  });

  it("fuera de ventana no avisa", () => {
    const inv: PolicyTemplateInvocation = {
      id: "a",
      plantilla: "tpl.aviso_plazo",
      parametros: { dias_antes: 10 },
    };
    expect(
      buildAvisoPlazoInsight(inv, {
        tenantId: "g",
        subjectId: "s",
        deadlineAt: "2026-12-01T00:00:00.000Z",
        now: "2026-01-01T00:00:00.000Z",
        responsibleRoles: ["gerente"],
      }),
    ).toBeNull();
  });
});
