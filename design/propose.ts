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
import type {
  DesignDensity,
  DesignSystem,
  PatternSet,
  TextTone,
} from "./schema.js";

export interface DesignIdentityInput {
  readonly companyId: string;
  readonly businessDescription: string;
  readonly identity: IdentitySpec;
  readonly segment?: string;
  readonly differentiation?: string;
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

/** Ferretería — industrial, práctico. */
function ferreteriaVariants(companyId: string): DesignSystem[] {
  const profiles = baseProfiles(56, 40);
  const commonPatterns: PatternSet = {
    listados: "tabla",
    navegacion: "lateral",
    formularios: "una_columna",
    tableros: "lista_agrupada",
  };
  return [
    {
      id: `${companyId}.ds.a`,
      label: "Acero y ámbar",
      density: "compacta",
      tone: "tecnico",
      patterns: commonPatterns,
      usageProfiles: profiles,
      tokens: {
        colors: {
          primary: "#C45C26",
          secondary: "#4A5568",
          neutrals: {
            background: "#F7F5F2",
            surface: "#FFFFFF",
            text: "#1A1A1A",
            muted: "#5C5C5C",
            border: "#D0CBC4",
          },
          semantic: {
            success: "#2F6F4E",
            warning: "#B45309",
            danger: "#B91C1C",
          },
        },
        typography: typography("IBM Plex Sans", "IBM Plex Sans", [
          12, 14, 16, 20, 24, 32,
        ]),
        spacing: spacing([4, 8, 12, 16, 24, 32]),
        radii: radii(2, 4, 8),
        shadows: shadows(),
      },
    },
    {
      id: `${companyId}.ds.b`,
      label: "Taller oscuro",
      density: "compacta",
      tone: "tecnico",
      patterns: { ...commonPatterns, listados: "lista" },
      usageProfiles: profiles,
      tokens: {
        colors: {
          primary: "#E8A317",
          secondary: "#2D3748",
          neutrals: {
            background: "#1C1C1E",
            surface: "#2A2A2E",
            text: "#F5F5F5",
            muted: "#A0A0A0",
            border: "#3F3F46",
          },
          semantic: {
            success: "#3D9B6E",
            warning: "#D97706",
            danger: "#EF4444",
          },
        },
        typography: typography("Source Sans 3", "Source Sans 3", [
          12, 14, 16, 18, 22, 28,
        ]),
        spacing: spacing([4, 8, 12, 16, 24, 40]),
        radii: radii(0, 2, 4),
        shadows: shadows(),
      },
    },
    {
      id: `${companyId}.ds.c`,
      label: "Mostrador claro",
      density: "normal",
      tone: "formal",
      patterns: { ...commonPatterns, formularios: "dos_columnas" },
      usageProfiles: profiles,
      tokens: {
        colors: {
          primary: "#A34B1C",
          secondary: "#5B6B7A",
          neutrals: {
            background: "#FAFAF8",
            surface: "#FFFFFF",
            text: "#111827",
            muted: "#6B7280",
            border: "#E5E7EB",
          },
          semantic: {
            success: "#166534",
            warning: "#A16207",
            danger: "#991B1B",
          },
        },
        typography: typography("Barlow", "Barlow", [12, 14, 16, 20, 26, 34]),
        spacing: spacing([4, 8, 16, 24, 32, 48]),
        radii: radii(4, 6, 10),
        shadows: shadows(),
      },
    },
  ];
}

/** Clínica premium — sereno, formal, espacioso. */
function clinicaVariants(companyId: string): DesignSystem[] {
  const profiles = baseProfiles(48, 36);
  const patterns: PatternSet = {
    listados: "tarjetas",
    navegacion: "superior",
    formularios: "por_pasos",
    tableros: "kanban",
  };
  return [
    {
      id: `${companyId}.ds.a`,
      label: "Lino y agua",
      density: "espaciosa",
      tone: "formal",
      patterns,
      usageProfiles: profiles,
      tokens: {
        colors: {
          primary: "#2A6F8F",
          secondary: "#8FA8B8",
          neutrals: {
            background: "#F4F8FA",
            surface: "#FFFFFF",
            text: "#0F172A",
            muted: "#64748B",
            border: "#D9E4EC",
          },
          semantic: {
            success: "#0F766E",
            warning: "#B45309",
            danger: "#BE123C",
          },
        },
        typography: typography("Cormorant Garamond", "Lora", [
          14, 16, 18, 22, 28, 40,
        ]),
        spacing: spacing([8, 12, 16, 24, 40, 64]),
        radii: radii(8, 12, 20),
        shadows: shadows(),
      },
    },
    {
      id: `${companyId}.ds.b`,
      label: "Mármol suave",
      density: "espaciosa",
      tone: "formal",
      patterns: { ...patterns, listados: "lista" },
      usageProfiles: profiles,
      tokens: {
        colors: {
          primary: "#1E4D5C",
          secondary: "#C4A484",
          neutrals: {
            background: "#FBFAF7",
            surface: "#FFFFFF",
            text: "#1C1917",
            muted: "#78716C",
            border: "#E7E5E4",
          },
          semantic: {
            success: "#047857",
            warning: "#B45309",
            danger: "#9F1239",
          },
        },
        typography: typography("Playfair Display", "Source Serif 4", [
          14, 16, 18, 24, 30, 42,
        ]),
        spacing: spacing([8, 16, 24, 32, 48, 72]),
        radii: radii(6, 10, 16),
        shadows: shadows(),
      },
    },
    {
      id: `${companyId}.ds.c`,
      label: "Clínica luz",
      density: "normal",
      tone: "formal",
      patterns: { ...patterns, formularios: "una_columna" },
      usageProfiles: profiles,
      tokens: {
        colors: {
          primary: "#0E7490",
          secondary: "#67E8F9",
          neutrals: {
            background: "#ECFEFF",
            surface: "#FFFFFF",
            text: "#083344",
            muted: "#0E7490",
            border: "#A5F3FC",
          },
          semantic: {
            success: "#0F766E",
            warning: "#CA8A04",
            danger: "#E11D48",
          },
        },
        typography: typography("Fraunces", "Nunito Sans", [
          13, 15, 17, 21, 27, 36,
        ]),
        spacing: spacing([6, 12, 18, 28, 40, 56]),
        radii: radii(10, 14, 22),
        shadows: shadows(),
      },
    },
  ];
}

/** Moda juvenil — energético, cercano (sin púrpura genérico). */
function modaVariants(companyId: string): DesignSystem[] {
  const profiles = baseProfiles(52, 40);
  const patterns: PatternSet = {
    listados: "tarjetas",
    navegacion: "inferior_movil",
    formularios: "una_columna",
    tableros: "kanban",
  };
  return [
    {
      id: `${companyId}.ds.a`,
      label: "Coral street",
      density: "normal",
      tone: "cercano",
      patterns,
      usageProfiles: profiles,
      tokens: {
        colors: {
          primary: "#E85D4C",
          secondary: "#1AABB8",
          neutrals: {
            background: "#FFF8F5",
            surface: "#FFFFFF",
            text: "#1A1A1A",
            muted: "#6B6B6B",
            border: "#F0D9D3",
          },
          semantic: {
            success: "#15803D",
            warning: "#D97706",
            danger: "#DC2626",
          },
        },
        typography: typography("Space Grotesk", "DM Sans", [
          12, 14, 16, 20, 28, 40,
        ]),
        spacing: spacing([4, 8, 12, 20, 32, 48]),
        radii: radii(12, 16, 24),
        shadows: shadows(),
      },
    },
    {
      id: `${companyId}.ds.b`,
      label: "Neón limón",
      density: "espaciosa",
      tone: "cercano",
      patterns: { ...patterns, listados: "lista" },
      usageProfiles: profiles,
      tokens: {
        colors: {
          primary: "#C8F542",
          secondary: "#111111",
          neutrals: {
            background: "#FAFAFA",
            surface: "#FFFFFF",
            text: "#0A0A0A",
            muted: "#525252",
            border: "#E5E5E5",
          },
          semantic: {
            success: "#16A34A",
            warning: "#EAB308",
            danger: "#F43F5E",
          },
        },
        typography: typography("Syne", "Outfit", [12, 14, 16, 22, 30, 44]),
        spacing: spacing([6, 10, 16, 24, 36, 56]),
        radii: radii(0, 4, 8),
        shadows: shadows(),
      },
    },
    {
      id: `${companyId}.ds.c`,
      label: "Denim vivo",
      density: "normal",
      tone: "cercano",
      patterns: { ...patterns, navegacion: "superior", listados: "tarjetas" },
      usageProfiles: profiles,
      tokens: {
        colors: {
          primary: "#1D4E89",
          secondary: "#F4A261",
          neutrals: {
            background: "#F8FAFC",
            surface: "#FFFFFF",
            text: "#0F172A",
            muted: "#475569",
            border: "#CBD5E1",
          },
          semantic: {
            success: "#15803D",
            warning: "#EA580C",
            danger: "#E11D48",
          },
        },
        typography: typography("Archivo Black", "Archivo", [
          12, 14, 16, 20, 26, 36,
        ]),
        spacing: spacing([4, 8, 16, 24, 32, 48]),
        radii: radii(8, 12, 20),
        shadows: shadows(),
      },
    },
  ];
}

function generalVariants(companyId: string): DesignSystem[] {
  const profiles = baseProfiles(48, 40);
  return [
    {
      id: `${companyId}.ds.a`,
      label: "Base neutra A",
      density: "normal" as DesignDensity,
      tone: "formal" as TextTone,
      patterns: {
        listados: "tabla",
        navegacion: "superior",
        formularios: "una_columna",
        tableros: "lista_agrupada",
      },
      usageProfiles: profiles,
      tokens: {
        colors: {
          primary: "#2563EB",
          secondary: "#64748B",
          neutrals: {
            background: "#F8FAFC",
            surface: "#FFFFFF",
            text: "#0F172A",
            muted: "#64748B",
            border: "#E2E8F0",
          },
          semantic: {
            success: "#16A34A",
            warning: "#D97706",
            danger: "#DC2626",
          },
        },
        typography: typography("IBM Plex Sans", "IBM Plex Sans", [
          12, 14, 16, 20, 24, 32,
        ]),
        spacing: spacing([4, 8, 12, 16, 24, 32]),
        radii: radii(4, 8, 12),
        shadows: shadows(),
      },
    },
    {
      id: `${companyId}.ds.b`,
      label: "Base neutra B",
      density: "compacta",
      tone: "tecnico",
      patterns: {
        listados: "lista",
        navegacion: "lateral",
        formularios: "dos_columnas",
        tableros: "kanban",
      },
      usageProfiles: profiles,
      tokens: {
        colors: {
          primary: "#0F766E",
          secondary: "#334155",
          neutrals: {
            background: "#F1F5F9",
            surface: "#FFFFFF",
            text: "#020617",
            muted: "#475569",
            border: "#CBD5E1",
          },
          semantic: {
            success: "#15803D",
            warning: "#B45309",
            danger: "#B91C1C",
          },
        },
        typography: typography("JetBrains Mono", "IBM Plex Sans", [
          12, 14, 16, 18, 22, 28,
        ]),
        spacing: spacing([4, 8, 12, 16, 24, 40]),
        radii: radii(2, 4, 8),
        shadows: shadows(),
      },
    },
    {
      id: `${companyId}.ds.c`,
      label: "Base neutra C",
      density: "espaciosa",
      tone: "cercano",
      patterns: {
        listados: "tarjetas",
        navegacion: "inferior_movil",
        formularios: "por_pasos",
        tableros: "lista_agrupada",
      },
      usageProfiles: profiles,
      tokens: {
        colors: {
          primary: "#EA580C",
          secondary: "#0EA5E9",
          neutrals: {
            background: "#FFFBEB",
            surface: "#FFFFFF",
            text: "#1C1917",
            muted: "#78716C",
            border: "#FDE68A",
          },
          semantic: {
            success: "#16A34A",
            warning: "#CA8A04",
            danger: "#E11D48",
          },
        },
        typography: typography("Nunito", "Nunito Sans", [
          13, 15, 17, 21, 28, 36,
        ]),
        spacing: spacing([8, 12, 16, 24, 40, 56]),
        radii: radii(10, 14, 20),
        shadows: shadows(),
      },
    },
  ];
}

/**
 * Propone 3 sistemas de diseño. Sustituible por un LLM que emita el mismo JSON.
 */
export function proposeDesignSystems(
  input: DesignIdentityInput,
  layer4: Layer4Stub = new HeuristicLayer4Stub(),
): DesignProposalBatch {
  const hints = layer4.inferBrandHints({
    businessDescription: input.businessDescription,
    ...(input.segment !== undefined ? { segment: input.segment } : {}),
    ...(input.differentiation !== undefined
      ? { differentiation: input.differentiation }
      : {}),
  });

  // Aplicar colores de marca si existen
  let proposals: DesignSystem[];
  switch (hints.segment) {
    case "ferreteria":
      proposals = ferreteriaVariants(input.companyId);
      break;
    case "clinica":
      proposals = clinicaVariants(input.companyId);
      break;
    case "moda_juvenil":
      proposals = modaVariants(input.companyId);
      break;
    default:
      proposals = generalVariants(input.companyId);
  }

  if (input.identity.primaryColor) {
    proposals = proposals.map((p, i) =>
      i === 0
        ? {
            ...p,
            tokens: {
              ...p.tokens,
              colors: {
                ...p.tokens.colors,
                primary: input.identity.primaryColor!,
              },
            },
          }
        : p,
    );
  }
  if (input.identity.secondaryColor) {
    proposals = proposals.map((p, i) =>
      i === 0
        ? {
            ...p,
            tokens: {
              ...p.tokens,
              colors: {
                ...p.tokens.colors,
                secondary: input.identity.secondaryColor!,
              },
            },
          }
        : p,
    );
  }

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
