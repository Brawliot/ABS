/**
 * Renderizador: UiSpec + DesignSystem → HTML.
 * Estructura fija; diseño resuelto por tokens.
 */

import type { DesignSystem } from "../design/schema.js";
import { hashDesignSystem } from "../design/approve.js";
import type { PresentationChannel, UiSpec } from "./types.js";
import {
  bindDesignToUiSpec,
  type UiDesignBinding,
} from "./bind-design.js";
import { isValidatedUiSpec } from "./validated.js";
import {
  UiSpecValidationError,
  type UiSpecValidationReport,
} from "./uispec-validator.js";
import { PRESENTATION_SCHEMA_VERSION } from "./types.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function t(spec: UiSpec, key: string): string {
  const bundle = spec.localization[0];
  return bundle?.strings[key] ?? key;
}

function cssVars(binding: UiDesignBinding): string {
  const v = binding.tokens.values;
  return `
    --color-primario: ${esc(v["color.primario"])};
    --color-secundario: ${esc(v["color.secundario"])};
    --color-fondo: ${esc(v["color.fondo"])};
    --color-superficie: ${esc(v["color.superficie"])};
    --color-texto: ${esc(v["color.texto"])};
    --color-borde: ${esc(v["color.borde"])};
    --espaciado-m: ${esc(v["espaciado.m"])};
    --tipografia-titulos: ${esc(v["tipografia.titulos"])}, sans-serif;
    --tipografia-cuerpo: ${esc(v["tipografia.cuerpo"])}, sans-serif;
    --tactil-minimo: ${esc(v["tactil.minimo"])};
    --densidad: ${esc(v["densidad.activa"])};
  `;
}

function renderModuleHtml(
  spec: UiSpec,
  moduleId: string,
  binding: UiDesignBinding,
  roleId?: string,
): string {
  const m = spec.modules.find((x) => x.id === moduleId);
  if (!m) return `<p class="empty">Módulo ${esc(moduleId)} no encontrado</p>`;
  const views = spec.views.filter((v) => m.viewIds.includes(v.id));
  const actions = spec.actions.filter((a) => {
    if (!m.actionIds.includes(a.id)) return false;
    if (roleId && !a.visibleRoles.includes(roleId)) return false;
    return true;
  });
  const viewsBlock = views
    .map((v) => {
      const vb = binding.views.find((x) => x.viewId === v.id);
      const title = spec.content[v.id]?.title ?? t(spec, v.labelKey);
      const acts = actions
        .filter((a) => v.actionIds.includes(a.id))
        .map(
          (a) =>
            `<li class="action" style="min-height:var(--tactil-minimo)">` +
            `<strong>${esc(spec.content[a.id]?.title ?? t(spec, a.labelKey))}</strong>` +
            ` <span class="meta">${esc(a.transitionId)}</span>` +
            `</li>`,
        )
        .join("\n");
      return (
        `<section class="view" id="${esc(v.id)}" ` +
        `data-listados="${esc(vb?.chosen.listados ?? "")}" ` +
        `data-nav="${esc(vb?.chosen.navegacion ?? "")}" ` +
        `data-tablero="${esc(vb?.chosen.tableros ?? "")}">` +
        `<h3>${esc(title)}</h3>` +
        `<p class="meta">patrones=${esc(vb?.chosen.listados ?? "")}/${esc(vb?.chosen.tableros ?? "")}</p>` +
        `<ul>${acts || "<li class=\"empty\">Sin acciones</li>"}</ul>` +
        `</section>`
      );
    })
    .join("\n");
  return (
    `<article class="module" data-module="${esc(m.id)}" data-channel="${esc(m.channel)}" ` +
    `data-density="${esc(binding.tokens.density)}">` +
    `<h2>${esc(t(spec, m.labelKey))}</h2>` +
    `<p class="meta">canal=${esc(m.channel)} · ds=${esc(binding.designSystemId)}</p>` +
    viewsBlock +
    `</article>`
  );
}

/**
 * Renderiza UiSpec con un DesignSystem activo (tokens resueltos).
 * Rechaza UiSpec no validada/sellada.
 */
export function renderUiSpecHtml(
  spec: UiSpec,
  options?: {
    readonly roleId?: string;
    readonly channel?: PresentationChannel;
    readonly designSystem?: DesignSystem;
  },
): string {
  if (!isValidatedUiSpec(spec)) {
    const report: UiSpecValidationReport = {
      ok: false,
      issues: [
        {
          code: "NOT_VALIDATED",
          path: "$",
          message:
            "renderUiSpecHtml exige UiSpec validada (salida de generateUiSpec / validateUiSpec)",
        },
      ],
      validatedAt: new Date().toISOString(),
      schemaVersion: spec.version ?? PRESENTATION_SCHEMA_VERSION,
    };
    throw new UiSpecValidationError(report);
  }
  const roleId = options?.roleId ?? "oficina";
  const channel = options?.channel ?? "backoffice";
  const designSystem = options?.designSystem;
  const logo = spec.identity.logoUrl
    ? `<img src="${esc(spec.identity.logoUrl)}" alt="logo" class="logo" />`
    : "";
  const brand =
    spec.content["brand"]?.title ??
    spec.identity.brandName ??
    spec.sourceCaseId;

  let binding: UiDesignBinding | null = null;
  if (designSystem) {
    binding = bindDesignToUiSpec({
      spec,
      designSystem,
      designContentHash: hashDesignSystem(designSystem),
      roleId,
      channel,
    });
  }

  const modulesHtml = spec.modules
    .map((m) => {
      if (binding) {
        return renderModuleHtml(spec, m.id, binding, roleId);
      }
      // Sin DS: solo estructura (tokens semánticos como data-*)
      const views = spec.views.filter((v) => m.viewIds.includes(v.id));
      return (
        `<article class="module" data-module="${esc(m.id)}">` +
        `<h2>${esc(t(spec, m.labelKey))}</h2>` +
        views
          .map(
            (v) =>
              `<section class="view" id="${esc(v.id)}"><h3>${esc(t(spec, v.labelKey))}</h3></section>`,
          )
          .join("") +
        `</article>`
      );
    })
    .join("\n");

  const rootVars = binding
    ? cssVars(binding)
    : `--color-primario: var(--fallback, #333); --color-fondo: #f5f5f5; --color-texto: #111; --color-superficie: #fff; --color-borde: #ccc; --espaciado-m: 12px; --tipografia-titulos: system-ui; --tipografia-cuerpo: system-ui; --tactil-minimo: 44px;`;

  const warn =
    binding && binding.warnings.length > 0
      ? `<aside class="warnings">${binding.warnings.map((w) => `<p>${esc(w.message)}</p>`).join("")}</aside>`
      : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${esc(String(brand))} — ABS UI</title>
  <style>
    :root { ${rootVars} }
    body { font-family: var(--tipografia-cuerpo); margin: 0;
      background: var(--color-fondo); color: var(--color-texto); }
    header { display: flex; align-items: center; gap: var(--espaciado-m);
      padding: var(--espaciado-m); background: var(--color-primario); color: #fff; }
    header .logo { height: var(--tactil-minimo); }
    main { padding: var(--espaciado-m); display: grid; gap: var(--espaciado-m); }
    .module { background: var(--color-superficie); border-left: 4px solid var(--color-primario);
      padding: var(--espaciado-m); border: 1px solid var(--color-borde); }
    h2, h3 { font-family: var(--tipografia-titulos); }
    .view { margin-top: var(--espaciado-m); padding-top: var(--espaciado-m);
      border-top: 1px solid var(--color-borde); }
    .meta { font-size: 0.85rem; opacity: 0.75; }
    .action { margin: 0.35rem 0; display: flex; align-items: center; }
    .hash { font-family: ui-monospace, monospace; font-size: 0.75rem; opacity: 0.6; }
    .warnings { background: #fff3cd; padding: var(--espaciado-m); }
  </style>
</head>
<body>
  <header>
    ${logo}
    <div>
      <div style="font-size:1.4rem;font-weight:600;font-family:var(--tipografia-titulos)">${esc(String(brand))}</div>
      <div class="hash">${esc(spec.contentHash.slice(0, 16))}… · ${esc(spec.version)}</div>
      <div class="hash" data-tokens="${esc(spec.styleTokenRefs.colorPrimario)}">${esc(spec.styleTokenRefs.colorPrimario)} / ${esc(spec.styleTokenRefs.espaciadoM)}</div>
    </div>
  </header>
  ${warn}
  <main>
    ${modulesHtml || "<p>Sin módulos</p>"}
  </main>
</body>
</html>`;
}

/**
 * Vista previa: mismo módulo con dos sistemas de diseño en paralelo.
 */
export function renderModuleDesignComparison(input: {
  readonly spec: UiSpec;
  readonly moduleId: string;
  readonly designA: DesignSystem;
  readonly designB: DesignSystem;
  readonly roleId: string;
  readonly channel: PresentationChannel;
}): string {
  const bindA = bindDesignToUiSpec({
    spec: input.spec,
    designSystem: input.designA,
    designContentHash: hashDesignSystem(input.designA),
    roleId: input.roleId,
    channel: input.channel,
  });
  const bindB = bindDesignToUiSpec({
    spec: input.spec,
    designSystem: input.designB,
    designContentHash: hashDesignSystem(input.designB),
    roleId: input.roleId,
    channel: input.channel,
  });
  const colA = renderModuleHtml(input.spec, input.moduleId, bindA, input.roleId);
  const colB = renderModuleHtml(input.spec, input.moduleId, bindB, input.roleId);
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8" /><title>Comparativa diseño</title>
<style>
  body { margin: 0; font-family: system-ui; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; padding: 1rem; }
  .pane { border: 1px solid #ccc; }
  .pane.a { --color-primario: ${esc(bindA.tokens.values["color.primario"])};
    --color-fondo: ${esc(bindA.tokens.values["color.fondo"])};
    --color-superficie: ${esc(bindA.tokens.values["color.superficie"])};
    --color-texto: ${esc(bindA.tokens.values["color.texto"])};
    --color-borde: ${esc(bindA.tokens.values["color.borde"])};
    --espaciado-m: ${esc(bindA.tokens.values["espaciado.m"])};
    --tipografia-titulos: ${esc(bindA.tokens.values["tipografia.titulos"])}, sans-serif;
    --tipografia-cuerpo: ${esc(bindA.tokens.values["tipografia.cuerpo"])}, sans-serif;
    --tactil-minimo: ${esc(bindA.tokens.values["tactil.minimo"])};
    background: var(--color-fondo); color: var(--color-texto); }
  .pane.b { --color-primario: ${esc(bindB.tokens.values["color.primario"])};
    --color-fondo: ${esc(bindB.tokens.values["color.fondo"])};
    --color-superficie: ${esc(bindB.tokens.values["color.superficie"])};
    --color-texto: ${esc(bindB.tokens.values["color.texto"])};
    --color-borde: ${esc(bindB.tokens.values["color.borde"])};
    --espaciado-m: ${esc(bindB.tokens.values["espaciado.m"])};
    --tipografia-titulos: ${esc(bindB.tokens.values["tipografia.titulos"])}, sans-serif;
    --tipografia-cuerpo: ${esc(bindB.tokens.values["tipografia.cuerpo"])}, sans-serif;
    --tactil-minimo: ${esc(bindB.tokens.values["tactil.minimo"])};
    background: var(--color-fondo); color: var(--color-texto); }
  .module { background: var(--color-superficie); border-left: 4px solid var(--color-primario);
    padding: var(--espaciado-m); margin: var(--espaciado-m); }
  h2,h3 { font-family: var(--tipografia-titulos); }
  .label { padding: 0.5rem 1rem; font-weight: 600; background: #111; color: #fff; }
</style></head>
<body>
  <div class="grid">
    <div class="pane a"><div class="label">${esc(input.designA.label)}</div>${colA}</div>
    <div class="pane b"><div class="label">${esc(input.designB.label)}</div>${colB}</div>
  </div>
</body></html>`;
}
