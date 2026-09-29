/**
 * Hoja de estilos profesional nivel ChatGPT/Vercel.
 * Solo variables del DesignSystem. Componentes pulidos, accesibles, elegantes.
 */

import type { ResolvedTokenMap } from "../presentation/resolve-tokens.js";

function esc(s: string): string {
  return s.replace(/</g, "").replace(/>/g, "").replace(/"/g, "");
}

export function cssFromTokens(tokens: ResolvedTokenMap): string {
  const v = tokens.values;
  return `
:root {
  --color-primario: ${esc(v["color.primario"])};
  --color-secundario: ${esc(v["color.secundario"])};
  --color-fondo: ${esc(v["color.fondo"])};
  --color-superficie: ${esc(v["color.superficie"])};
  --color-texto: ${esc(v["color.texto"])};
  --color-muted: ${esc(v["color.muted"])};
  --color-borde: ${esc(v["color.borde"])};
  --color-exito: ${esc(v["color.exito"])};
  --color-aviso: ${esc(v["color.aviso"])};
  --color-peligro: ${esc(v["color.peligro"])};
  --espaciado-xs: ${esc(v["espaciado.xs"])};
  --espaciado-s: ${esc(v["espaciado.s"])};
  --espaciado-m: ${esc(v["espaciado.m"])};
  --espaciado-l: ${esc(v["espaciado.l"])};
  --espaciado-xl: ${esc(v["espaciado.xl"])};
  --tipografia-titulos: ${esc(v["tipografia.titulos"])}, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --tipografia-cuerpo: ${esc(v["tipografia.cuerpo"])}, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --radio-sm: ${esc(v["radio.sm"])};
  --radio-md: ${esc(v["radio.md"])};
  --radio-lg: ${esc(v["radio.lg"])};
  --sombra-sm: ${esc(v["sombra.sm"])};
  --sombra-md: ${esc(v["sombra.md"])};
  --sombra-lg: ${esc(v["sombra.lg"])};
  --tactil-minimo: ${esc(v["tactil.minimo"])};
  --densidad: ${esc(v["densidad.activa"])};
  --transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

*, *::before, *::after {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  min-height: 100%;
  background: var(--color-fondo);
  color: var(--color-texto);
  font-family: var(--tipografia-cuerpo);
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* === RESET === */
h1, h2, h3, h4, h5, h6 {
  margin: 0;
  font-family: var(--tipografia-titulos);
  font-weight: 600;
  line-height: 1.2;
}

p {
  margin: 0;
}

a {
  color: var(--color-primario);
  text-decoration: none;
  transition: var(--transition);
}

a:hover {
  text-decoration: underline;
  opacity: 0.85;
}

a:focus-visible,
button:focus-visible,
select:focus-visible,
input:focus-visible,
textarea:focus-visible {
  outline: 2px solid var(--color-primario);
  outline-offset: 2px;
}

/* === ACCESSIBILITY === */
.skip-link {
  position: absolute;
  left: -9999px;
  top: var(--espaciado-s);
  background: var(--color-primario);
  color: var(--color-fondo);
  padding: var(--espaciado-s) var(--espaciado-m);
  border-radius: var(--radio-md);
  font-weight: 600;
  z-index: 1000;
}

.skip-link:focus {
  left: var(--espaciado-m);
}

/* === LAYOUT === */
.app-shell {
  display: grid;
  grid-template-columns: 240px 1fr;
  grid-template-rows: auto auto auto 1fr;
  grid-template-areas:
    "dev dev"
    "questions questions"
    "nav header"
    "nav main";
  min-height: 100vh;
  background: var(--color-fondo);
}

@media (max-width: 768px) {
  .app-shell {
    grid-template-columns: 1fr;
    grid-template-areas:
      "dev"
      "questions"
      "header"
      "nav"
      "main";
  }

  .nav-process {
    display: flex;
    flex-wrap: wrap;
    gap: var(--espaciado-xs);
    border-right: none;
    border-bottom: 1px solid var(--color-borde);
    padding: var(--espaciado-s);
  }

  .nav-process ul {
    display: flex;
    flex-direction: row;
    width: 100%;
    gap: var(--espaciado-xs);
  }

  .nav-process a {
    flex: 1 1 auto;
    text-align: center;
    font-size: 0.875rem;
  }
}

/* === DEV BAR === */
.dev-bar {
  grid-area: dev;
  background: linear-gradient(135deg, var(--color-aviso) 0%, rgba(255, 152, 0, 0.95) 100%);
  color: #ffffff;
  padding: var(--espaciado-m) var(--espaciado-l);
  font-size: 0.875rem;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: var(--sombra-sm);
}

.dev-bar strong {
  font-weight: 700;
  display: block;
  margin-bottom: var(--espaciado-xs);
}

.dev-bar form {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espaciado-m);
  align-items: flex-end;
  margin-top: var(--espaciado-m);
}

.dev-bar label {
  display: flex;
  flex-direction: column;
  gap: var(--espaciado-xs);
  font-weight: 600;
  font-size: 0.875rem;
}

.dev-bar select,
.dev-bar button {
  min-height: 36px;
  padding: var(--espaciado-xs) var(--espaciado-s);
  border-radius: var(--radio-md);
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
  transition: var(--transition);
}

.dev-bar select {
  cursor: pointer;
}

.dev-bar select:hover,
.dev-bar select:focus {
  background: rgba(255, 255, 255, 0.25);
  border-color: rgba(255, 255, 255, 0.5);
}

.dev-bar button {
  background: rgba(255, 255, 255, 0.3);
  border-color: rgba(255, 255, 255, 0.5);
  font-weight: 700;
  padding: var(--espaciado-xs) var(--espaciado-m);
}

.dev-bar button:hover {
  background: rgba(255, 255, 255, 0.4);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

/* === QUESTIONS BANNER === */
.questions-banner {
  grid-area: questions;
  background: var(--color-superficie);
  border-bottom: 1px solid var(--color-borde);
  padding: var(--espaciado-m) var(--espaciado-l);
  box-shadow: var(--sombra-sm);
}

.questions-banner[hidden] {
  display: none;
}

.questions-banner h2 {
  margin: 0 0 var(--espaciado-s);
  font-size: 0.875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-aviso);
}

.questions-banner p {
  margin: 0 0 var(--espaciado-m);
  font-size: 0.875rem;
  color: var(--color-muted);
}

.questions-banner ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--espaciado-s);
}

.questions-banner li {
  font-size: 0.875rem;
  padding: var(--espaciado-xs) var(--espaciado-s);
  background: var(--color-fondo);
  border-radius: var(--radio-md);
  border: 1px solid var(--color-borde);
  color: var(--color-texto);
}

/* === HEADER === */
.site-header {
  grid-area: header;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--espaciado-m);
  padding: var(--espaciado-m) var(--espaciado-l);
  background: var(--color-superficie);
  border-bottom: 1px solid var(--color-borde);
  box-shadow: var(--sombra-sm);
}

.site-header h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-primario);
  letter-spacing: -0.02em;
}

.site-header .meta {
  font-size: 0.75rem;
  color: var(--color-muted);
  font-family: "Menlo", "Monaco", monospace;
}

.has-questions .site-header {
  border-top: 1px solid var(--color-borde);
}

/* === NAVIGATION === */
.nav-process {
  grid-area: nav;
  background: var(--color-superficie);
  border-right: 1px solid var(--color-borde);
  padding: var(--espaciado-l);
  overflow-y: auto;
}

.nav-process h2 {
  margin: 0 0 var(--espaciado-m);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--color-muted);
  font-weight: 700;
}

.nav-process ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--espaciado-xs);
}

.nav-process a {
  display: block;
  min-height: 40px;
  padding: var(--espaciado-s) var(--espaciado-m);
  border-radius: var(--radio-md);
  text-decoration: none;
  color: var(--color-texto);
  border: 1px solid transparent;
  transition: var(--transition);
  font-weight: 500;
  font-size: 0.9rem;
}

.nav-process a:hover {
  background: var(--color-fondo);
  border-color: var(--color-borde);
}

.nav-process a[aria-current="page"] {
  background: var(--color-primario);
  color: var(--color-fondo);
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.nav-process .pg-role {
  display: block;
  font-size: 0.7rem;
  opacity: 0.7;
  margin-top: 2px;
}

/* === MAIN CONTENT === */
.main {
  grid-area: main;
  padding: var(--espaciado-l);
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

/* === VIEW TABS === */
.view-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espaciado-s);
  margin-bottom: var(--espaciado-l);
  border-bottom: 2px solid var(--color-borde);
  padding-bottom: var(--espaciado-m);
}

.view-tabs a {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  padding: var(--espaciado-xs) var(--espaciado-m);
  border-radius: var(--radio-md) var(--radio-md) 0 0;
  border: 1px solid transparent;
  background: transparent;
  text-decoration: none;
  color: var(--color-texto);
  font-weight: 500;
  font-size: 0.9rem;
  transition: var(--transition);
  cursor: pointer;
}

.view-tabs a:hover {
  background: var(--color-fondo);
  color: var(--color-primario);
}

.view-tabs a[aria-current="page"] {
  background: var(--color-primario);
  color: var(--color-fondo);
  border-color: var(--color-primario);
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* === PANELS & CARDS === */
.panel,
.tablero,
.form-entity {
  background: var(--color-superficie);
  border: 1px solid var(--color-borde);
  border-radius: var(--radio-lg);
  padding: var(--espaciado-l);
  margin-bottom: var(--espaciado-l);
  box-shadow: var(--sombra-sm);
  transition: var(--transition-slow);
}

.panel:hover,
.tablero:hover {
  box-shadow: var(--sombra-md);
  border-color: var(--color-primario);
  border-color: color-mix(in srgb, var(--color-primario) 20%, var(--color-borde));
}

.panel h3,
.tablero h3,
.form-entity h3 {
  margin: 0 0 var(--espaciado-m);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-texto);
  letter-spacing: -0.01em;
}

.kind-badge {
  display: inline-block;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-muted);
  margin-left: var(--espaciado-s);
  font-weight: 600;
  background: var(--color-fondo);
  padding: 2px 6px;
  border-radius: var(--radio-sm);
}

/* === ROW LIST (TABLA) === */
.row-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--color-borde);
  border-radius: var(--radio-md);
  overflow: hidden;
}

.row-list li {
  padding: var(--espaciado-m);
  border-bottom: 1px solid var(--color-borde);
  min-height: 48px;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--espaciado-m);
  align-items: center;
  transition: var(--transition);
  background: var(--color-superficie);
}

.row-list li:last-child {
  border-bottom: none;
}

.row-list li:nth-child(even) {
  background: color-mix(in srgb, var(--color-fondo) 50%, var(--color-superficie));
}

.row-list li:hover {
  background: var(--color-fondo);
  box-shadow: inset 0 0 0 1px var(--color-primario);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primario) 30%, transparent);
}

.row-list .meta {
  color: var(--color-muted);
  font-size: 0.8rem;
  font-weight: 500;
}

/* === ACTIONS === */
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--espaciado-s);
  margin-top: var(--espaciado-l);
}

.actions[data-actions="0"] {
  padding: var(--espaciado-m);
  background: var(--color-fondo);
  border-radius: var(--radio-md);
  border: 1px dashed var(--color-borde);
}

.action-form {
  display: contents;
}

.action-form button,
.actions button {
  min-height: 40px;
  padding: var(--espaciado-s) var(--espaciado-m);
  border-radius: var(--radio-md);
  border: none;
  background: var(--color-primario);
  color: var(--color-fondo);
  font: inherit;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: var(--transition);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.action-form button:hover:not(:disabled),
.actions button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-primario) 90%, #000);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.action-form button:active:not(:disabled),
.actions button:active:not(:disabled) {
  transform: translateY(0);
}

.action-form button:disabled,
.actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-form button[aria-busy="true"] {
  opacity: 0.8;
  pointer-events: none;
}

/* === FORMS === */
.form-entity label {
  display: flex;
  flex-direction: column;
  gap: var(--espaciado-xs);
  margin-bottom: var(--espaciado-m);
  font-weight: 600;
  font-size: 0.9rem;
}

.form-entity input,
.form-entity select,
.form-entity textarea {
  min-height: 40px;
  padding: var(--espaciado-s);
  border: 1px solid var(--color-borde);
  border-radius: var(--radio-md);
  background: var(--color-fondo);
  color: var(--color-texto);
  font: inherit;
  font-size: 0.9rem;
  transition: var(--transition);
  width: 100%;
}

.form-entity textarea {
  min-height: 100px;
  resize: vertical;
}

.form-entity input:hover,
.form-entity select:hover,
.form-entity textarea:hover {
  border-color: var(--color-primario);
  border-color: color-mix(in srgb, var(--color-primario) 40%, var(--color-borde));
}

.form-entity input:focus,
.form-entity select:focus,
.form-entity textarea:focus {
  outline: none;
  border-color: var(--color-primario);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primario) 10%, transparent);
  background: var(--color-superficie);
}

.form-entity input::placeholder {
  color: var(--color-muted);
  opacity: 0.7;
}

/* === FLASH MESSAGES === */
.flash {
  padding: var(--espaciado-m);
  margin-bottom: var(--espaciado-m);
  border-radius: var(--radio-md);
  border: 1px solid;
  border-left: 4px solid;
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.flash p {
  margin: 0;
  font-weight: 500;
}

.flash p + p {
  margin-top: var(--espaciado-s);
}

.flash a {
  text-decoration: underline;
  font-weight: 600;
}

.flash-ok {
  background: color-mix(in srgb, var(--color-exito) 10%, var(--color-superficie));
  border-color: var(--color-exito);
}

.flash-error,
.flash-block {
  background: color-mix(in srgb, var(--color-peligro) 10%, var(--color-superficie));
  border-color: var(--color-peligro);
  color: var(--color-peligro);
}

.flash-info {
  background: color-mix(in srgb, var(--color-aviso) 10%, var(--color-superficie));
  border-color: var(--color-aviso);
  color: var(--color-aviso);
}

/* === BLOCK BANNER === */
.block-banner {
  margin-bottom: var(--espaciado-m);
  padding: var(--espaciado-m);
  border: 1px solid var(--color-aviso);
  border-left: 4px solid var(--color-aviso);
  border-radius: var(--radio-md);
  background: color-mix(in srgb, var(--color-aviso) 5%, var(--color-superficie));
}

.block-banner h2 {
  margin: 0 0 var(--espaciado-s);
  font-size: 0.95rem;
  color: var(--color-aviso);
}

.block-banner ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.block-banner li {
  padding: var(--espaciado-s) 0;
  font-size: 0.9rem;
}

/* === EMPTY STATES === */
.empty {
  color: var(--color-muted);
  font-style: italic;
  padding: var(--espaciado-m);
  text-align: center;
}

/* === UNRENDERED NOTES === */
.unrendered {
  margin-top: var(--espaciado-xl);
  padding: var(--espaciado-m);
  border: 1px dashed var(--color-borde);
  border-radius: var(--radio-md);
  background: color-mix(in srgb, var(--color-fondo) 50%, var(--color-superficie));
  font-size: 0.875rem;
  color: var(--color-muted);
}

.unrendered strong {
  display: block;
  color: var(--color-texto);
  margin-bottom: var(--espaciado-s);
  font-weight: 600;
}

.unrendered ul {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.8rem;
}

.unrendered li {
  padding: 4px 0;
  color: var(--color-muted);
}

/* === RESPONSIVE === */
@media (max-width: 1024px) {
  .main {
    padding: var(--espaciado-m);
    max-width: 100%;
  }

  .view-tabs {
    gap: var(--espaciado-xs);
  }

  .view-tabs a {
    padding: var(--espaciado-xs) var(--espaciado-s);
    font-size: 0.85rem;
  }
}

@media (max-width: 640px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .site-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--espaciado-s);
  }

  .view-tabs {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .row-list li {
    flex-direction: column;
    align-items: flex-start;
  }

  .actions {
    width: 100%;
  }

  .action-form button,
  .actions button {
    flex: 1 1 auto;
  }
}
`.trim();
}