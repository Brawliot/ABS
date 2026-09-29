/**
 * RGPD técnico: export / rectify / erase + replay EventStore intacto.
 */

import { describe, expect, it } from "vitest";
import { InMemoryEventStore } from "../core/event-store.js";
import type { TransitionEvent } from "../core/events.js";
import { ParteIdentityStore } from "../policies/identity.js";
import {
  assertNoPiiInResolved,
  erasePartePersonal,
  exportPartePersonal,
  rectifyPartePersonal,
  draftRatFromConfig,
  DEFAULT_RETENTION,
  THIRD_PARTY_REGISTRY,
  PRIVACY_POLICY_DRAFT,
  DPA_DRAFT,
  HOSTING_EU_CHECKLIST,
  detectAnomalies,
} from "../gdpr/index.js";

function sampleEvent(id: string, parteId: string): TransitionEvent {
  return {
    id,
    kind: "transicion",
    subjectId: `subj-${parteId}`,
    occurredAt: "2024-01-01T00:00:00.000Z",
    actorId: "a1",
    actorKind: "humano",
    evidence: {
      kind: "aceptacion",
      reference: "ev-ref-1",
      recordedAt: "2024-01-01T00:00:00.000Z",
    },
    transitionId: "t_aceptar",
    fromStateId: "borrador",
    toStateId: "activo",
    data: { parteId },
  };
}

describe("gdpr rights + replay", () => {
  it("export → erase → sin PII; EventStore idéntico", () => {
    const idStore = new ParteIdentityStore();
    const events = new InMemoryEventStore();
    const tenant = "co-gdpr";
    const parteId = "parte-cli-1";
    idStore.put(
      tenant,
      parteId,
      {
        displayName: "Ana García",
        email: "ana@example.com",
        taxId: "12345678Z",
        phone: "+34600111222",
      },
      "2024-01-01T00:00:00.000Z",
    );
    events.append(sampleEvent("e1", parteId));
    events.append(sampleEvent("e2", parteId));
    const before = events.all().map((e) => JSON.stringify(e));

    const bundle = exportPartePersonal(idStore, tenant, parteId, "acc_reader");
    expect(bundle.personal?.email).toBe("ana@example.com");
    expect(bundle.erased).toBe(false);

    rectifyPartePersonal(idStore, tenant, parteId, {
      displayName: "Ana G.",
      email: "ana.g@example.com",
    });
    expect(idStore.resolve(tenant, parteId).personal.email).toBe(
      "ana.g@example.com",
    );

    erasePartePersonal(idStore, tenant, parteId);
    assertNoPiiInResolved(idStore, tenant, parteId);
    const afterExport = exportPartePersonal(
      idStore,
      tenant,
      parteId,
      "acc_reader",
    );
    expect(afterExport.erased).toBe(true);
    expect(afterExport.personal).toBeNull();

    const after = events.all().map((e) => JSON.stringify(e));
    expect(after).toEqual(before);
    expect(idStore.eventsRemainIntact()).toBe(true);
  });

  it("RAT / terceros / textos legales marcados pendientes", () => {
    const rat = draftRatFromConfig("demo-co");
    expect(rat.disclaimer).toMatch(/PENDIENTE DE REVISIÓN POR ABOGADO/);
    expect(THIRD_PARTY_REGISTRY.length).toBeGreaterThan(0);
    expect(DEFAULT_RETENTION.some((r) => r.kind === "factura_legal")).toBe(
      true,
    );
    expect(PRIVACY_POLICY_DRAFT).toMatch(/PENDIENTE DE REVISIÓN POR ABOGADO/);
    expect(DPA_DRAFT).toMatch(/PENDIENTE DE REVISIÓN POR ABOGADO/);
    expect(HOSTING_EU_CHECKLIST).toMatch(/UE/);
    const anom = detectAnomalies();
    expect(anom.anomalies).toEqual([]);
  });
});
