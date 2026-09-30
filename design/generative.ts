/**
 * Diseñador generativo (determinista): del negocio a su sistema de diseño.
 *
 *  1. Sector a partir del nombre y la descripción del negocio.
 *  2. Personalidad del sector: gama de color, tipografía, forma, densidad,
 *     patrones y tono.
 *  3. Señales del negocio (sedes, roles, autoservicio…) ajustan densidad y
 *     tamaño táctil.
 *  4. El tono de color se desplaza por negocio (hash del id): dos negocios
 *     del mismo sector no salen iguales.
 *  5. Contraste WCAG AA garantizado ajustando la luminosidad.
 *
 * Tipografías: pilas de fuentes del sistema (Windows / macOS / Linux). La app
 * no descarga fuentes (CSP font-src 'self'), así que un nombre que no está
 * instalado no cambiaría nada en pantalla.
 */

import { createHash } from "node:crypto";
import { contrastRatio } from "./contrast.js";
import type {
  DesignDensity,
  DesignSystem,
  HexColor,
  PatternSet,
  TextTone,
  UsageProfile,
} from "./schema.js";

// ─── Sectores ───────────────────────────────────────────────────────────

export type Sector =
  | "belleza"
  | "salud"
  | "industrial"
  | "motor"
  | "hosteleria"
  | "profesional"
  | "comercio_online"
  | "construccion"
  | "educacion"
  | "alquiler"
  | "plataforma"
  | "moda"
  | "alimentacion"
  | "turismo"
  | "inmobiliaria"
  | "general";

/**
 * Pistas de cada sector. Cada pista distinta que aparece suma un punto (el
 * nombre del negocio cuenta triple); gana el sector con más puntos y, a
 * igualdad, el que va antes en esta lista.
 */
const SECTOR_KEYWORDS: readonly [Sector, RegExp][] = [
  ["salud", /clinic|dental|dentist|salud|medic|fisio|veterinar|optic|farmac|paciente/g],
  ["motor", /taller mecanic|mecanic|coche|vehicul|concesionari|neumatic|\bmoto\b/g],
  ["belleza", /peluquer|barber|estetic|belleza|manicur|\bspa\b|masaj/g],
  ["inmobiliaria", /inmobiliari|inmueble|\bpisos?\b|\bcasas?\b|vivienda|\barras\b|notaria/g],
  ["alquiler", /alquil|renting|arrend/g],
  ["construccion", /reforma|\bobras?\b|construc|albanil|fontaner|electricist|pintor|carpinter|ebanist|mueble/g],
  ["industrial", /ferreter|bricolaj|herramient|suministro|industrial|maquinaria/g],
  ["alimentacion", /panader|pasteler|\bhorno\b|obrador|carnicer|pescader|fruter|charcuter|\bpan\b|tartas?\b/g],
  ["turismo", /viajes?\b|turism|vuelos?\b|excursion|\bbilletes?\b/g],
  ["hosteleria", /restaurante|\bbar\b|cafeter|cubiertos|cocina|hotel|catering|comensal/g],
  ["profesional", /gestoria|asesor|contab|abogad|despacho|consultor|notari|seguros/g],
  ["educacion", /academia|idioma|clases|alumno|escuela|formacion|colegio|autoescuela/g],
  ["moda", /ropa|moda|boutique|calzado|streetwear/g],
  ["comercio_online", /tienda online|internet|ecommerce|e-commerce|online|cosmetic/g],
  ["plataforma", /marketplace|plataforma|intermedia|comision/g],
];

function normalizar(t: string): string {
  return t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function pistas(texto: string, re: RegExp): number {
  return new Set(normalizar(texto).match(re) ?? []).size;
}

/** Puntos de cada sector (el nombre cuenta triple que la descripción). */
export function puntuarSectores(nombre: string, descripcion = ""): [Sector, number][] {
  return SECTOR_KEYWORDS.map(([sector, re]): [Sector, number] => [
    sector,
    3 * pistas(nombre, re) + pistas(descripcion, re),
  ]).filter(([, n]) => n > 0);
}

/** El sector con más pistas; el nombre del negocio pesa más que la descripción. */
export function detectarSector(nombre: string, descripcion = ""): Sector {
  let mejor: Sector = "general";
  let max = 0;
  for (const [sector, n] of puntuarSectores(nombre, descripcion)) {
    if (n > max) {
      mejor = sector;
      max = n;
    }
  }
  return mejor;
}

// ─── Tipografías (fuentes del sistema) ──────────────────────────────────

const FUENTES = {
  elegante: "Georgia, 'Palatino Linotype', Palatino, 'Book Antiqua', serif",
  clasica: "Cambria, 'Hoefler Text', Georgia, serif",
  humanista: "'Segoe UI', 'Helvetica Neue', Calibri, Arial, sans-serif",
  amable: "'Trebuchet MS', 'Gill Sans', Candara, Verdana, sans-serif",
  geometrica: "'Century Gothic', Futura, 'Avenir Next', Avenir, sans-serif",
  industrial: "Bahnschrift, 'DIN Alternate', 'Franklin Gothic Medium', 'Arial Narrow', sans-serif",
  robusta: "'Franklin Gothic Medium', 'Arial Black', Arial, sans-serif",
  legible: "Verdana, Tahoma, 'Segoe UI', sans-serif",
  sobria: "Calibri, Candara, 'Segoe UI', Arial, sans-serif",
} as const;

// ─── Personalidades ─────────────────────────────────────────────────────

interface Personalidad {
  readonly nombre: string;
  /** Gama de tono (grados HSL) y saturación del color principal. */
  readonly hue: readonly [number, number];
  readonly sat: number;
  /** Tono del acento secundario respecto al principal. */
  readonly acento: number;
  readonly titulos: string;
  readonly cuerpo: string;
  /** Tamaño base y proporción de la escala tipográfica. */
  readonly base: number;
  readonly ratio: number;
  readonly radio: readonly [number, number, number];
  readonly densidad: DesignDensity;
  readonly tono: TextTone;
  readonly patrones: PatternSet;
  /** Tinte del fondo (0 = neutro, 1 = muy teñido). */
  readonly tinte: number;
  readonly sombra: "suave" | "marcada" | "plana";
}

const P = (p: Personalidad) => p;

const PERSONALIDADES: Readonly<Record<Sector, Personalidad>> = {
  belleza: P({
    nombre: "Salón", hue: [310, 355], sat: 0.55, acento: 150, titulos: FUENTES.elegante, cuerpo: FUENTES.humanista,
    base: 15, ratio: 1.25, radio: [10, 16, 24], densidad: "espaciosa", tono: "cercano", tinte: 0.6, sombra: "suave",
    patrones: { listados: "tarjetas", navegacion: "superior", formularios: "una_columna", tableros: "kanban" },
  }),
  salud: P({
    nombre: "Consulta", hue: [170, 210], sat: 0.5, acento: 170, titulos: FUENTES.clasica, cuerpo: FUENTES.humanista,
    base: 16, ratio: 1.25, radio: [8, 12, 20], densidad: "espaciosa", tono: "formal", tinte: 0.4, sombra: "suave",
    patrones: { listados: "tarjetas", navegacion: "superior", formularios: "por_pasos", tableros: "kanban" },
  }),
  industrial: P({
    nombre: "Mostrador", hue: [14, 40], sat: 0.7, acento: 190, titulos: FUENTES.industrial, cuerpo: FUENTES.sobria,
    base: 14, ratio: 1.2, radio: [2, 4, 6], densidad: "compacta", tono: "tecnico", tinte: 0.25, sombra: "plana",
    patrones: { listados: "tabla", navegacion: "lateral", formularios: "dos_columnas", tableros: "lista_agrupada" },
  }),
  motor: P({
    nombre: "Taller", hue: [348, 382], sat: 0.65, acento: 200, titulos: FUENTES.robusta, cuerpo: FUENTES.sobria,
    base: 15, ratio: 1.2, radio: [2, 4, 8], densidad: "compacta", tono: "tecnico", tinte: 0.15, sombra: "marcada",
    patrones: { listados: "tabla", navegacion: "lateral", formularios: "una_columna", tableros: "kanban" },
  }),
  hosteleria: P({
    nombre: "Sala", hue: [4, 34], sat: 0.6, acento: 110, titulos: FUENTES.elegante, cuerpo: FUENTES.amable,
    base: 15, ratio: 1.25, radio: [6, 10, 16], densidad: "normal", tono: "cercano", tinte: 0.7, sombra: "suave",
    patrones: { listados: "tarjetas", navegacion: "inferior_movil", formularios: "una_columna", tableros: "kanban" },
  }),
  profesional: P({
    nombre: "Despacho", hue: [204, 236], sat: 0.45, acento: 35, titulos: FUENTES.clasica, cuerpo: FUENTES.sobria,
    base: 15, ratio: 1.2, radio: [2, 4, 6], densidad: "normal", tono: "formal", tinte: 0.15, sombra: "plana",
    patrones: { listados: "tabla", navegacion: "lateral", formularios: "dos_columnas", tableros: "lista_agrupada" },
  }),
  comercio_online: P({
    nombre: "Escaparate", hue: [88, 160], sat: 0.45, acento: 300, titulos: FUENTES.geometrica, cuerpo: FUENTES.humanista,
    base: 15, ratio: 1.333, radio: [8, 14, 22], densidad: "normal", tono: "cercano", tinte: 0.5, sombra: "suave",
    patrones: { listados: "tarjetas", navegacion: "superior", formularios: "por_pasos", tableros: "kanban" },
  }),
  construccion: P({
    nombre: "Obra", hue: [34, 56], sat: 0.75, acento: 215, titulos: FUENTES.industrial, cuerpo: FUENTES.legible,
    base: 15, ratio: 1.25, radio: [0, 2, 4], densidad: "normal", tono: "tecnico", tinte: 0.3, sombra: "marcada",
    patrones: { listados: "lista", navegacion: "lateral", formularios: "por_pasos", tableros: "kanban" },
  }),
  educacion: P({
    nombre: "Aula", hue: [244, 286], sat: 0.5, acento: 45, titulos: FUENTES.amable, cuerpo: FUENTES.legible,
    base: 16, ratio: 1.25, radio: [8, 12, 18], densidad: "espaciosa", tono: "cercano", tinte: 0.45, sombra: "suave",
    patrones: { listados: "tarjetas", navegacion: "superior", formularios: "una_columna", tableros: "lista_agrupada" },
  }),
  alquiler: P({
    nombre: "Parque", hue: [40, 62], sat: 0.8, acento: 220, titulos: FUENTES.robusta, cuerpo: FUENTES.legible,
    base: 15, ratio: 1.2, radio: [4, 6, 10], densidad: "compacta", tono: "tecnico", tinte: 0.2, sombra: "marcada",
    patrones: { listados: "tabla", navegacion: "lateral", formularios: "dos_columnas", tableros: "lista_agrupada" },
  }),
  plataforma: P({
    nombre: "Red", hue: [232, 296], sat: 0.55, acento: 160, titulos: FUENTES.geometrica, cuerpo: FUENTES.humanista,
    base: 15, ratio: 1.25, radio: [10, 14, 20], densidad: "normal", tono: "cercano", tinte: 0.3, sombra: "suave",
    patrones: { listados: "tarjetas", navegacion: "superior", formularios: "una_columna", tableros: "kanban" },
  }),
  alimentacion: P({
    nombre: "Obrador", hue: [22, 44], sat: 0.6, acento: 120, titulos: FUENTES.amable, cuerpo: FUENTES.humanista,
    base: 15, ratio: 1.25, radio: [8, 12, 18], densidad: "normal", tono: "cercano", tinte: 0.65, sombra: "suave",
    patrones: { listados: "tarjetas", navegacion: "inferior_movil", formularios: "una_columna", tableros: "lista_agrupada" },
  }),
  turismo: P({
    nombre: "Destino", hue: [186, 214], sat: 0.6, acento: 28, titulos: FUENTES.geometrica, cuerpo: FUENTES.amable,
    base: 15, ratio: 1.333, radio: [10, 16, 24], densidad: "espaciosa", tono: "cercano", tinte: 0.55, sombra: "suave",
    patrones: { listados: "tarjetas", navegacion: "superior", formularios: "por_pasos", tableros: "kanban" },
  }),
  inmobiliaria: P({
    nombre: "Escaparate inmobiliario", hue: [140, 176], sat: 0.4, acento: 25, titulos: FUENTES.clasica, cuerpo: FUENTES.sobria,
    base: 15, ratio: 1.25, radio: [4, 8, 12], densidad: "normal", tono: "formal", tinte: 0.3, sombra: "suave",
    patrones: { listados: "tarjetas", navegacion: "lateral", formularios: "dos_columnas", tableros: "kanban" },
  }),
  moda: P({
    nombre: "Pasarela", hue: [330, 372], sat: 0.6, acento: 180, titulos: FUENTES.geometrica, cuerpo: FUENTES.humanista,
    base: 15, ratio: 1.333, radio: [0, 2, 4], densidad: "normal", tono: "cercano", tinte: 0.2, sombra: "plana",
    patrones: { listados: "tarjetas", navegacion: "inferior_movil", formularios: "una_columna", tableros: "kanban" },
  }),
  general: P({
    nombre: "Base", hue: [195, 235], sat: 0.5, acento: 30, titulos: FUENTES.humanista, cuerpo: FUENTES.humanista,
    base: 15, ratio: 1.25, radio: [4, 8, 12], densidad: "normal", tono: "formal", tinte: 0.2, sombra: "suave",
    patrones: { listados: "tabla", navegacion: "lateral", formularios: "una_columna", tableros: "lista_agrupada" },
  }),
};

// ─── Color ──────────────────────────────────────────────────────────────

function hsl(h: number, s: number, l: number): HexColor {
  const hh = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + hh / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

/** Oscurece (baja la luminosidad) hasta cumplir el contraste mínimo. */
function hastaContraste(h: number, s: number, l: number, fondo: HexColor, min: number): HexColor {
  let ll = l;
  let c = hsl(h, s, ll);
  while (contrastRatio(c, fondo) < min && ll > 0.05) {
    ll -= 0.02;
    c = hsl(h, s, ll);
  }
  return c;
}

function hashUnit(seed: string): number {
  return parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 8), 16) / 0xffffffff;
}

// ─── Escalas ────────────────────────────────────────────────────────────

function escalaTipografica(base: number, ratio: number): number[] {
  const out = [Math.round(base / ratio / ratio), Math.round(base / ratio), base];
  for (let i = 1; i <= 3; i++) out.push(Math.round(base * ratio ** i));
  for (let i = 1; i < out.length; i++) {
    if (out[i]! < out[i - 1]! * 1.1 && out[i]! < out[i - 1]! + 2) out[i] = out[i - 1]! + 2;
  }
  return out;
}

const ESPACIADO: Readonly<Record<DesignDensity, number[]>> = {
  compacta: [4, 6, 10, 14, 20, 28],
  normal: [4, 8, 12, 16, 24, 32],
  espaciosa: [6, 12, 18, 24, 36, 52],
};

const SOMBRAS = {
  plana: { sm: "0 0 0 1px rgba(0,0,0,0.06)", md: "0 1px 2px rgba(0,0,0,0.10)", lg: "0 2px 6px rgba(0,0,0,0.12)" },
  suave: { sm: "0 1px 2px rgba(0,0,0,0.06)", md: "0 4px 14px rgba(0,0,0,0.08)", lg: "0 12px 32px rgba(0,0,0,0.12)" },
  marcada: { sm: "0 1px 2px rgba(0,0,0,0.14)", md: "0 3px 8px rgba(0,0,0,0.18)", lg: "0 8px 20px rgba(0,0,0,0.22)" },
} as const;

// ─── Señales del negocio ────────────────────────────────────────────────

export interface SenalesNegocio {
  readonly sedes?: number;
  readonly roles?: number;
  /** Clientes que usan la app por su cuenta (portal / autoservicio). */
  readonly autoservicio?: boolean;
  /** Uso en mostrador, taller o tablet. */
  readonly tactil?: boolean;
}

// ─── Propuestas ─────────────────────────────────────────────────────────

export interface EntradaDisenador {
  readonly companyId: string;
  readonly nombre?: string;
  readonly descripcion: string;
  readonly sector?: Sector;
  readonly colorMarca?: HexColor;
  readonly colorSecundario?: HexColor;
  readonly senales?: SenalesNegocio;
}

function perfilesUso(p: Personalidad, senales: SenalesNegocio): UsageProfile[] {
  const tactil = senales.tactil ? 56 : 48;
  const oficina = p.densidad === "compacta" ? 40 : 44;
  return [
    { id: "perfil.oficina", roleId: "oficina", channel: "backoffice", touchTargetMinPx: oficina, highContrast: false, label: "Oficina backoffice" },
    { id: "perfil.almacen.tablet", roleId: "almacen", channel: "taller", touchTargetMinPx: tactil, highContrast: true, densityOverride: "espaciosa", label: "Tablet de trabajo" },
    { id: "perfil.web", roleId: "cliente", channel: "web", touchTargetMinPx: senales.autoservicio ? 48 : 44, highContrast: false, label: "Web cliente" },
  ];
}

const DENSIDADES: readonly DesignDensity[] = ["compacta", "normal", "espaciosa"];

function ajustarDensidad(base: DesignDensity, senales: SenalesNegocio): DesignDensity {
  let i = DENSIDADES.indexOf(base);
  // Mucha gente y varias sedes: más información por pantalla
  if ((senales.sedes ?? 1) >= 3 || (senales.roles ?? 0) >= 6) i -= 1;
  return DENSIDADES[Math.max(0, Math.min(2, i))]!;
}

interface Variante {
  readonly sufijo: string;
  readonly etiqueta: string;
  readonly giroTono: number;
  readonly oscuro: boolean;
  readonly densidad?: (d: DesignDensity) => DesignDensity;
}

const VARIANTES: readonly Variante[] = [
  { sufijo: "a", etiqueta: "principal", giroTono: 0, oscuro: false },
  { sufijo: "b", etiqueta: "contraste", giroTono: 0, oscuro: true },
  {
    sufijo: "c",
    etiqueta: "alternativa",
    giroTono: 25,
    oscuro: false,
    densidad: (d) => (d === "compacta" ? "normal" : d === "espaciosa" ? "normal" : "espaciosa"),
  },
];

function construir(entrada: EntradaDisenador, sector: Sector, v: Variante): DesignSystem {
  const p = PERSONALIDADES[sector];
  const senales = entrada.senales ?? {};
  const u = hashUnit(`${entrada.companyId}|${sector}`);
  const hue = p.hue[0] + (p.hue[1] - p.hue[0]) * u + v.giroTono;
  const densidad = v.densidad ? v.densidad(ajustarDensidad(p.densidad, senales)) : ajustarDensidad(p.densidad, senales);

  // Neutros teñidos con el tono del negocio
  const bg = v.oscuro ? hsl(hue, 0.18, 0.11) : hsl(hue, 0.35 * p.tinte, 0.975 - 0.012 * p.tinte);
  const surface = v.oscuro ? hsl(hue, 0.15, 0.16) : "#FFFFFF";
  const text = v.oscuro ? hsl(hue, 0.12, 0.94) : hsl(hue, 0.3, 0.12);
  const muted = v.oscuro
    ? hsl(hue, 0.1, 0.72)
    : hastaContraste(hue, 0.12, 0.42, "#FFFFFF", 4.6);
  const border = v.oscuro ? hsl(hue, 0.12, 0.28) : hsl(hue, 0.2 * p.tinte + 0.1, 0.88);

  // Principal: botón con texto claro encima (AA); en oscuro, legible sobre el fondo
  const primary = entrada.colorMarca
    ? entrada.colorMarca.toUpperCase()
    : v.oscuro
      ? hsl(hue, p.sat, 0.62)
      : hastaContraste(hue, p.sat, 0.45, "#FFFFFF", 4.6);
  const secondary = entrada.colorSecundario
    ? entrada.colorSecundario.toUpperCase()
    : v.oscuro
      ? hsl(hue + p.acento, p.sat * 0.8, 0.66)
      : hastaContraste(hue + p.acento, p.sat * 0.7, 0.42, "#FFFFFF", 3.2);

  const sem = (h: number) => (v.oscuro ? hsl(h, 0.6, 0.62) : hastaContraste(h, 0.7, 0.4, "#FFFFFF", 4.6));

  return {
    id: `${entrada.companyId}.ds.${v.sufijo}`,
    label: `${p.nombre} ${v.etiqueta}`,
    density: densidad,
    tone: p.tono,
    patterns: p.patrones,
    usageProfiles: perfilesUso(p, senales),
    tokens: {
      colors: {
        primary,
        secondary,
        neutrals: { background: bg, surface, text, muted, border },
        semantic: { success: sem(145), warning: sem(32), danger: sem(355) },
      },
      typography: {
        headingFamily: p.titulos,
        bodyFamily: p.cuerpo,
        scalePx: escalaTipografica(p.base, p.ratio),
      },
      spacing: { scalePx: ESPACIADO[densidad] },
      radii: { sm: p.radio[0], md: p.radio[1], lg: p.radio[2] },
      shadows: SOMBRAS[p.sombra],
    },
  };
}

/** Tres propuestas (principal, contraste oscuro, alternativa) para un negocio. */
export function disenarNegocio(entrada: EntradaDisenador): { sector: Sector; propuestas: DesignSystem[] } {
  const sector = entrada.sector ?? detectarSector(entrada.nombre ?? "", entrada.descripcion);
  return { sector, propuestas: VARIANTES.map((v) => construir(entrada, sector, v)) };
}

export const SECTORES: readonly Sector[] = Object.keys(PERSONALIDADES) as Sector[];
