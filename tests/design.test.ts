/**
 * Criterios Diseñador MVP:
 * - Ferretería, clínica premium y moda juvenil → sistemas distintos
 * - Las 3 propuestas de cada empresa pasan el validador
 * - Contraste insuficiente se rechaza
 * - Tablet almacén > oficina en táctil
 * - Sistemas aprobados versionados
 */

import { describe, expect, it } from "vitest";
import {
  DesignRejectionError,
  DesignStore,
  buildLowContrastSystem,
  proposeDesignSystems,
  runDesignSession,
  selectValidProposal,
  validateDesignSystem,
  WCAG_AA_CONTRAST,
  contrastRatio,
} from "../design/index.js";
import type { DesignIdentityInput } from "../design/index.js";

const ferreteria: DesignIdentityInput = {
  companyId: "ferre-norte",
  businessDescription:
    "Ferretería y bricolaje: venta de herramientas, tornillería y material de taller",
  identity: { brandName: "Ferre Norte", primaryColor: "#C45C26" },
};

const clinica: DesignIdentityInput = {
  companyId: "clinica-aurora",
  businessDescription:
    "Clínica estética premium y salud dental con atención personalizada",
  identity: { brandName: "Aurora Clinic" },
  segment: "clinica",
  differentiation: "premium sereno",
};

const moda: DesignIdentityInput = {
  companyId: "urban-fit",
  businessDescription:
    "Tienda de ropa juvenil streetwear y moda casual para jóvenes",
  identity: { brandName: "Urban Fit" },
};

describe("Diseñador MVP", () => {
  it("ferretería, clínica premium y moda juvenil producen sistemas claramente distintos", () => {
    const a = proposeDesignSystems(ferreteria);
    const b = proposeDesignSystems(clinica);
    const c = proposeDesignSystems(moda);

    expect(a.hints.segment).toBe("ferreteria");
    expect(b.hints.segment).toBe("clinica");
    expect(c.hints.segment).toBe("moda_juvenil");

    const pa = a.proposals[0]!;
    const pb = b.proposals[0]!;
    const pc = c.proposals[0]!;

    expect(pa.tokens.colors.primary).not.toBe(pb.tokens.colors.primary);
    expect(pb.tokens.colors.primary).not.toBe(pc.tokens.colors.primary);
    expect(pa.tone).not.toBe(pc.tone);
    expect(pa.density).not.toBe(pb.density);
    expect(pa.patterns.listados).not.toBe(pb.patterns.listados);
    expect(pa.patterns.navegacion).not.toBe(pc.patterns.navegacion);
    // Tipografías distintas
    expect(pa.tokens.typography.headingFamily).not.toBe(
      pb.tokens.typography.headingFamily,
    );
  });

  it("las tres propuestas de cada empresa pasan el validador", () => {
    for (const input of [ferreteria, clinica, moda]) {
      const batch = proposeDesignSystems(input);
      expect(batch.proposals).toHaveLength(3);
      for (const p of batch.proposals) {
        const v = validateDesignSystem(p);
        expect(v.ok, `${input.companyId} ${p.id}: ${v.issues.map((i) => i.message).join("; ")}`).toBe(
          true,
        );
      }
    }
  });

  it("un sistema con contraste insuficiente se rechaza", () => {
    const bad = buildLowContrastSystem("test-co");
    const ratio = contrastRatio(
      bad.tokens.colors.neutrals.text,
      bad.tokens.colors.neutrals.background,
    );
    expect(ratio).toBeLessThan(WCAG_AA_CONTRAST);
    const v = validateDesignSystem(bad);
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.code === "contrast_aa")).toBe(true);

    expect(() =>
      selectValidProposal({ proposals: [bad] }),
    ).toThrow(DesignRejectionError);

    // Reintento: malo + bueno → acepta el bueno
    const good = proposeDesignSystems(ferreteria).proposals[0]!;
    const picked = selectValidProposal({ proposals: [bad, good] });
    expect(picked.system.id).toBe(good.id);
    expect(picked.rejected).toHaveLength(1);
  });

  it("el perfil de tablet de almacén tiene elementos táctiles más grandes que el de oficina", () => {
    const batch = proposeDesignSystems(ferreteria);
    for (const p of batch.proposals) {
      const oficina = p.usageProfiles.find((x) => x.id === "perfil.oficina")!;
      const tablet = p.usageProfiles.find(
        (x) => x.id === "perfil.almacen.tablet",
      )!;
      expect(tablet.touchTargetMinPx).toBeGreaterThan(oficina.touchTargetMinPx);
      expect(tablet.touchTargetMinPx).toBeGreaterThanOrEqual(44);
      expect(tablet.highContrast).toBe(true);
    }
  });

  it("los sistemas aprobados quedan versionados", () => {
    const store = new DesignStore();
    const first = runDesignSession({
      identity: ferreteria,
      chosenIndex: 0,
      approvedAt: "2026-06-01T10:00:00.000Z",
      store,
    });
    expect(first.approved.version).toBe("ds-1.0.0");
    expect(first.overlay.designSystem?.contentHash).toBe(
      first.approved.contentHash,
    );
    expect(first.overlay.designSystemHistory).toHaveLength(1);

    const second = runDesignSession({
      identity: clinica,
      chosenIndex: 1,
      approvedAt: "2026-06-02T10:00:00.000Z",
      store,
    });
    expect(second.approved.version).toBe("ds-2.0.0");
    expect(store.getHistory()).toHaveLength(2);
    expect(store.getCurrent()?.proposalId).toBe(second.approved.proposalId);
    expect(second.overlay.designSystemHistory).toHaveLength(2);
    expect(second.overlay.version).toBe("ds-2.0.0");
  });
});
