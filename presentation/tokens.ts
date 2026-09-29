/**
 * Tokens semánticos de presentación.
 * La UiSpec solo referencia estos ids; el renderizador los resuelve con el DesignSystem.
 */

export const SEMANTIC_TOKENS = {
  "color.primario": true,
  "color.secundario": true,
  "color.fondo": true,
  "color.superficie": true,
  "color.texto": true,
  "color.muted": true,
  "color.borde": true,
  "color.exito": true,
  "color.aviso": true,
  "color.peligro": true,
  "tipografia.titulos": true,
  "tipografia.cuerpo": true,
  "tipografia.escala": true,
  "espaciado.xs": true,
  "espaciado.s": true,
  "espaciado.m": true,
  "espaciado.l": true,
  "espaciado.xl": true,
  "radio.sm": true,
  "radio.md": true,
  "radio.lg": true,
  "sombra.sm": true,
  "sombra.md": true,
  "sombra.lg": true,
  "densidad.activa": true,
  "tactil.minimo": true,
} as const;

export type SemanticTokenId = keyof typeof SEMANTIC_TOKENS;

export function isSemanticTokenId(id: string): id is SemanticTokenId {
  return id in SEMANTIC_TOKENS;
}

/** Refs de estilo que toda UiSpec declara (sin literales). */
export interface UiStyleTokenRefs {
  readonly colorPrimario: "color.primario";
  readonly colorSecundario: "color.secundario";
  readonly colorFondo: "color.fondo";
  readonly colorSuperficie: "color.superficie";
  readonly colorTexto: "color.texto";
  readonly espaciadoM: "espaciado.m";
  readonly tipografiaTitulos: "tipografia.titulos";
  readonly tipografiaCuerpo: "tipografia.cuerpo";
  readonly densidad: "densidad.activa";
  readonly tactilMinimo: "tactil.minimo";
}

export const DEFAULT_STYLE_TOKEN_REFS: UiStyleTokenRefs = {
  colorPrimario: "color.primario",
  colorSecundario: "color.secundario",
  colorFondo: "color.fondo",
  colorSuperficie: "color.superficie",
  colorTexto: "color.texto",
  espaciadoM: "espaciado.m",
  tipografiaTitulos: "tipografia.titulos",
  tipografiaCuerpo: "tipografia.cuerpo",
  densidad: "densidad.activa",
  tactilMinimo: "tactil.minimo",
};
