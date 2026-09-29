/**
 * Resuelve tokens semánticos con el DesignSystem activo + perfil de uso.
 */

import type { DesignSystem, UsageProfile } from "../design/schema.js";
import type { PresentationChannel } from "./types.js";
import type { SemanticTokenId } from "./tokens.js";

export interface ResolvedTokenMap {
  readonly values: Readonly<Record<SemanticTokenId, string>>;
  readonly profile: UsageProfile;
  readonly density: DesignSystem["density"];
  readonly touchTargetMinPx: number;
}

function pickProfile(
  system: DesignSystem,
  roleId: string,
  channel: PresentationChannel,
): UsageProfile {
  const exact = system.usageProfiles.find(
    (p) => p.roleId === roleId && p.channel === channel,
  );
  if (exact) return exact;
  const byChannel = system.usageProfiles.find((p) => p.channel === channel);
  if (byChannel) return byChannel;
  const byRole = system.usageProfiles.find((p) => p.roleId === roleId);
  if (byRole) return byRole;
  return (
    system.usageProfiles[0] ?? {
      id: "perfil.fallback",
      roleId,
      channel,
      touchTargetMinPx: 44,
      highContrast: false,
      label: "Fallback",
    }
  );
}

function spacingToken(
  scale: readonly number[],
  index: number,
  fallback: number,
): string {
  const v = scale[index] ?? scale[scale.length - 1] ?? fallback;
  return `${v}px`;
}

/**
 * Resuelve el mapa de tokens semánticos → valores CSS.
 */
export function resolveTokenMap(input: {
  readonly designSystem: DesignSystem;
  readonly roleId: string;
  readonly channel: PresentationChannel;
}): ResolvedTokenMap {
  const profile = pickProfile(
    input.designSystem,
    input.roleId,
    input.channel,
  );
  const c = input.designSystem.tokens.colors;
  const sp = input.designSystem.tokens.spacing.scalePx;
  const density = profile.densityOverride ?? input.designSystem.density;
  const touch = profile.touchTargetMinPx;

  const values: Record<SemanticTokenId, string> = {
    "color.primario": c.primary,
    "color.secundario": c.secondary,
    "color.fondo": c.neutrals.background,
    "color.superficie": c.neutrals.surface,
    "color.texto": c.neutrals.text,
    "color.muted": c.neutrals.muted,
    "color.borde": c.neutrals.border,
    "color.exito": c.semantic.success,
    "color.aviso": c.semantic.warning,
    "color.peligro": c.semantic.danger,
    "tipografia.titulos": input.designSystem.tokens.typography.headingFamily,
    "tipografia.cuerpo": input.designSystem.tokens.typography.bodyFamily,
    "tipografia.escala": input.designSystem.tokens.typography.scalePx.join(","),
    "espaciado.xs": spacingToken(sp, 0, 4),
    "espaciado.s": spacingToken(sp, 1, 8),
    "espaciado.m": spacingToken(sp, 2, 12),
    "espaciado.l": spacingToken(sp, 3, 16),
    "espaciado.xl": spacingToken(sp, 4, 24),
    "radio.sm": `${input.designSystem.tokens.radii.sm}px`,
    "radio.md": `${input.designSystem.tokens.radii.md}px`,
    "radio.lg": `${input.designSystem.tokens.radii.lg}px`,
    "sombra.sm": input.designSystem.tokens.shadows.sm,
    "sombra.md": input.designSystem.tokens.shadows.md,
    "sombra.lg": input.designSystem.tokens.shadows.lg,
    "densidad.activa": density,
    "tactil.minimo": `${touch}px`,
  };

  return {
    values,
    profile,
    density,
    touchTargetMinPx: touch,
  };
}
