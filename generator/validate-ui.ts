/**
 * Validación del Generador con tokens ya aplicados (accesibilidad).
 */

import { contrastRatio } from "../design/contrast.js";
import { WCAG_AA_CONTRAST, MIN_TOUCH_TARGET_PX } from "../design/schema.js";
import type { DesignSystem } from "../design/schema.js";
import type { UiSpec } from "../presentation/types.js";
import type { PresentationChannel } from "../presentation/types.js";
import { bindDesignToUiSpec } from "../presentation/bind-design.js";
import { hashDesignSystem } from "../design/approve.js";

export interface AppliedAccessibilityIssue {
  readonly code: string;
  readonly message: string;
}

export interface AppliedValidationResult {
  readonly ok: boolean;
  readonly issues: readonly AppliedAccessibilityIssue[];
  readonly warnings: readonly string[];
}

/**
 * Comprueba accesibilidad con el DesignSystem ya resuelto sobre la UiSpec.
 * Complementa validateDesignSystem (aislado).
 */
export function validateUiWithDesignSystem(input: {
  readonly spec: UiSpec;
  readonly designSystem: DesignSystem;
  readonly roleId: string;
  readonly channel: PresentationChannel;
}): AppliedValidationResult {
  const issues: AppliedAccessibilityIssue[] = [];
  const binding = bindDesignToUiSpec({
    spec: input.spec,
    designSystem: input.designSystem,
    designContentHash: hashDesignSystem(input.designSystem),
    roleId: input.roleId,
    channel: input.channel,
  });

  const text = binding.tokens.values["color.texto"];
  const bg = binding.tokens.values["color.fondo"];
  const surface = binding.tokens.values["color.superficie"];
  const rBg = contrastRatio(text, bg);
  const rSurf = contrastRatio(text, surface);
  if (rBg < WCAG_AA_CONTRAST) {
    issues.push({
      code: "applied_contrast",
      message: `Contraste aplicado texto/fondo ${rBg.toFixed(2)} < ${WCAG_AA_CONTRAST}`,
    });
  }
  if (rSurf < WCAG_AA_CONTRAST) {
    issues.push({
      code: "applied_contrast",
      message: `Contraste aplicado texto/superficie ${rSurf.toFixed(2)} < ${WCAG_AA_CONTRAST}`,
    });
  }

  if (binding.tokens.touchTargetMinPx < MIN_TOUCH_TARGET_PX) {
    const tactile = binding.tokens.profile.highContrast ||
      /tablet|almacen|táctil|tactil/i.test(binding.tokens.profile.label);
    if (tactile) {
      issues.push({
        code: "applied_touch",
        message: `Táctil aplicado ${binding.tokens.touchTargetMinPx}px < ${MIN_TOUCH_TARGET_PX}`,
      });
    }
  }

  // Literales prohibidos en la especificación
  const literalIssues = assertSpecHasNoLiteralDesignValues(input.spec);
  issues.push(...literalIssues);

  return {
    ok: issues.length === 0,
    issues,
    warnings: binding.warnings.map((w) => w.message),
  };
}

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
const PX_RE = /\b\d+(\.\d+)?px\b/;

/**
 * La UiSpec no debe contener colores ni medidas literales.
 */
export function assertSpecHasNoLiteralDesignValues(
  spec: UiSpec,
): AppliedAccessibilityIssue[] {
  const issues: AppliedAccessibilityIssue[] = [];
  const json = JSON.stringify({
    modules: spec.modules,
    views: spec.views,
    actions: spec.actions,
    forms: spec.forms,
    recorridos: spec.recorridos,
    identity: spec.identity,
    styleTokenRefs: spec.styleTokenRefs,
  });
  if (HEX_RE.test(json)) {
    issues.push({
      code: "literal_color",
      message: "La especificación contiene un color literal (#hex)",
    });
  }
  if (PX_RE.test(json)) {
    issues.push({
      code: "literal_measure",
      message: "La especificación contiene una medida literal (px)",
    });
  }
  if (spec.identity.primaryColor || spec.identity.secondaryColor) {
    issues.push({
      code: "literal_color",
      message: "identity.primaryColor/secondaryColor no deben estar en UiSpec",
    });
  }
  return issues;
}
