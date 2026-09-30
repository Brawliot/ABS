/**
 * Entrada de identidad + propuestas de diseño (stand-in del LLM).
 * Siempre JSON tipado contra el esquema DesignSystem.
 */

import type { IdentitySpec } from "../presentation/types.js";
import {
  HeuristicLayer4Stub,
  type Layer4BrandHints,
  type Layer4Stub,
} from "./layer4-stub.js";
import type { DesignSystem } from "./schema.js";
import {
  SECTORES,
  disenarNegocio,
  type Sector,
  type SenalesNegocio,
} from "./generative.js";

function isSector(x: string | undefined): x is Sector {
  return !!x && (SECTORES as readonly string[]).includes(x);
}

export interface DesignIdentityInput {
  readonly companyId: string;
  readonly businessDescription: string;
  readonly identity: IdentitySpec;
  readonly segment?: string;
  readonly differentiation?: string;
  /** Señales del perfil (sedes, roles, autoservicio…) que ajustan el diseño. */
  readonly senales?: SenalesNegocio;
}

export interface DesignProposalBatch {
  readonly companyId: string;
  readonly hints: Layer4BrandHints;
  /** Exactamente 3 alternativas. */
  readonly proposals: readonly DesignSystem[];
}

function baseProfiles(
  warehouseTouch: number,
  officeTouch: number,
): DesignSystem["usageProfiles"] {
  return [
    {
      id: "perfil.oficina",
      roleId: "oficina",
      channel: "backoffice",
      touchTargetMinPx: officeTouch,
      highContrast: false,
      label: "Oficina backoffice",
    },
    {
      id: "perfil.almacen.tablet",
      roleId: "almacen",
      channel: "taller",
      touchTargetMinPx: warehouseTouch,
      highContrast: true,
      densityOverride: "espaciosa",
      label: "Tablet de almacén",
    },
    {
      id: "perfil.web",
      roleId: "cliente",
      channel: "web",
      touchTargetMinPx: 44,
      highContrast: false,
      label: "Web cliente",
    },
  ];
}

function shadows() {
  return {
    sm: "0 1px 2px rgba(0,0,0,0.08)",
    md: "0 4px 12px rgba(0,0,0,0.12)",
    lg: "0 12px 32px rgba(0,0,0,0.16)",
  };
}

function typography(heading: string, body: string, scale: number[]) {
  return { headingFamily: heading, bodyFamily: body, scalePx: scale };
}

function spacing(scale: number[]) {
  return { scalePx: scale };
}

function radii(sm: number, md: number, lg: number) {
  return { sm, md, lg };
}

/**
 * Propone 3 sistemas de diseño generados a partir del negocio (sector,
 * personalidad, señales del perfil y un tono propio por negocio).
 * Sustituible por un LLM que emita el mismo JSON.
 */
export function proposeDesignSystems(
  input: DesignIdentityInput,
  layer4: Layer4Stub = new HeuristicLayer4Stub(),
): DesignProposalBatch {
  let hints = layer4.inferBrandHints({
    businessDescription: input.businessDescription,
    ...(input.segment !== undefined ? { segment: input.segment } : {}),
    ...(input.differentiation !== undefined
      ? { differentiation: input.differentiation }
      : {}),
  });

  const { sector, propuestas } = disenarNegocio({
    companyId: input.companyId,
    ...(input.identity.brandName ? { nombre: input.identity.brandName } : {}),
    descripcion: input.businessDescription,
    ...(isSector(input.segment) ? { sector: input.segment } : {}),
    ...(input.identity.primaryColor ? { colorMarca: input.identity.primaryColor } : {}),
    ...(input.identity.secondaryColor ? { colorSecundario: input.identity.secondaryColor } : {}),
    ...(input.senales ? { senales: input.senales } : {}),
  });
  const proposals = propuestas;
  hints = { ...hints, segment: sector };

  return {
    companyId: input.companyId,
    hints,
    proposals: proposals.slice(0, 3),
  };
}

/** Sistema inválido a propósito (contraste insuficiente) para pruebas. */
export function buildLowContrastSystem(companyId: string): DesignSystem {
  return {
    id: `${companyId}.ds.bad-contrast`,
    label: "Contraste insuficiente",
    density: "normal",
    tone: "formal",
    patterns: {
      listados: "tabla",
      navegacion: "superior",
      formularios: "una_columna",
      tableros: "lista_agrupada",
    },
    usageProfiles: baseProfiles(48, 40),
    tokens: {
      colors: {
        primary: "#CCCCCC",
        secondary: "#DDDDDD",
        neutrals: {
          background: "#EEEEEE",
          surface: "#F5F5F5",
          text: "#CCCCCC", // casi igual al fondo → falla AA
          muted: "#BBBBBB",
          border: "#DDDDDD",
        },
        semantic: {
          success: "#AABBAA",
          warning: "#CCBBAA",
          danger: "#CCAAAA",
        },
      },
      typography: typography("Arial", "Arial", [12, 14, 16, 20, 24, 32]),
      spacing: spacing([4, 8, 12, 16, 24, 32]),
      radii: radii(4, 8, 12),
      shadows: shadows(),
    },
  };
}
