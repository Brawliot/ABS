/**
 * Landing pública: GET /web (HTML) + POST /web/solicitud (crear expediente).
 * Sin login, sin rol, solo datos de negocio y contacto.
 */

import type { AppBootResult } from "./types.js";
import { AppRuntime } from "./runtime.js";
import { ParteIdentityStore } from "../policies/identity.js";
import { montar } from "../generator/secciones.js";
import { SECCIONES_WEB, type ContextoWeb } from "./secciones-web.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatCentimos(centimos: number): string {
  const euros = Math.floor(centimos / 100);
  const cents = centimos % 100;
  return `${euros}${cents > 0 ? "," + cents.toString().padStart(2, "0") : ""}€`;
}

/**
 * Extrae datos de diseño para landing (estilos, colores).
 */
function estiloNegocio(
  boot: AppBootResult,
): { css: string; brandColor: string } {
  const ds = boot.designSystem;
  const brandColor = ds.tokens.colors.primary ?? "#3b82f6";
  const bgColor = ds.tokens.colors.neutrals.background ?? "#ffffff";
  const textColor = ds.tokens.colors.neutrals.text ?? "#1f2937";
  const borderColor = ds.tokens.colors.neutrals.border ?? "#e5e7eb";

  const css = `
    :root {
      --color-primary: ${esc(brandColor)};
      --color-bg: ${esc(bgColor)};
      --color-text: ${esc(textColor)};
      --color-border: ${esc(borderColor)};
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--color-bg);
      color: var(--color-text);
      line-height: 1.6;
      padding: 20px;
    }

    .container { max-width: 900px; margin: 0 auto; }

    header {
      text-align: center;
      padding: 40px 20px;
      border-bottom: 2px solid var(--color-border);
      margin-bottom: 40px;
    }

    h1 {
      font-size: 2em;
      margin-bottom: 10px;
      color: var(--color-primary);
    }

    h2 {
      font-size: 1.5em;
      margin: 30px 0 20px;
      border-bottom: 1px solid var(--color-border);
      padding-bottom: 10px;
    }

    .offers {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin: 20px 0;
    }

    .offer-card {
      border: 1px solid var(--color-border);
      border-radius: 8px;
      padding: 20px;
      background: var(--color-bg);
      transition: box-shadow 0.2s;
    }

    .offer-card:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .offer-title {
      font-weight: 600;
      margin-bottom: 8px;
      font-size: 1.1em;
    }

    .offer-price {
      font-size: 1.4em;
      color: var(--color-primary);
      font-weight: bold;
      margin: 10px 0;
    }

    .info-section {
      background: #f9fafb;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }

    form {
      background: #f9fafb;
      padding: 30px;
      border-radius: 8px;
      max-width: 500px;
      margin: 30px auto;
    }

    .form-group {
      margin-bottom: 20px;
    }

    label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
    }

    input[type="text"],
    input[type="email"],
    input[type="tel"],
    textarea {
      width: 100%;
      padding: 10px;
      border: 1px solid var(--color-border);
      border-radius: 4px;
      font-family: inherit;
      font-size: 1em;
    }

    textarea {
      resize: vertical;
      min-height: 100px;
    }

    input[type="hidden"] {
      display: none;
    }

    button {
      width: 100%;
      padding: 12px;
      background: var(--color-primary);
      color: white;
      border: none;
      border-radius: 4px;
      font-weight: 600;
      cursor: pointer;
      font-size: 1em;
    }

    button:hover {
      opacity: 0.9;
    }

    .success-message {
      background: #d1fae5;
      color: #065f46;
      padding: 15px;
      border-radius: 4px;
      margin-bottom: 20px;
      text-align: center;
    }

    footer {
      text-align: center;
      padding: 20px;
      margin-top: 40px;
      border-top: 1px solid var(--color-border);
      font-size: 0.9em;
      color: #6b7280;
    }

    @media (max-width: 768px) {
      h1 { font-size: 1.5em; }
      h2 { font-size: 1.2em; }
      form { padding: 20px; }
      .offers { grid-template-columns: 1fr; }
    }
  `;

  return { css, brandColor };
}

/**
 * Etiquetas de formulario del primer paso del proceso principal.
 */
function etiquetasFormulario(boot: AppBootResult): {
  nombre: string;
  contacto: string;
  mensaje: string;
  boton: string;
} {
  const firstProcess = boot.input.lifecycles[0];
  const firstState = firstProcess?.lifecycle.states[0];

  return {
    nombre: "Tu nombre",
    contacto: "Teléfono o correo",
    mensaje: "Cuéntanos qué necesitas",
    boton: firstState?.label ?? "Solicitar presupuesto",
  };
}

/**
 * Renderiza GET /web: landing pública del negocio usando motor de secciones.
 */
export function renderLandingHtml(boot: AppBootResult, query?: string): string {
  const { css, brandColor } = estiloNegocio(boot);
  const params = new URLSearchParams(query ?? "");
  const enviado = params.has("enviado");

  // Montar secciones dinámicamente
  const ctx: ContextoWeb = {
    boot,
    css,
    ...(query !== undefined ? { query } : {}),
    ...(enviado ? { showSuccess: true } : {}),
  };

  const resultado = (montar(SECCIONES_WEB, ctx) as any) ?? {};
  const successMsg = enviado
    ? `<div style="background: #d1fae5; color: #065f46; padding: 15px; border-radius: 4px; margin-bottom: 20px; text-align: center;">✓ Gracias por tu solicitud. Nos pondremos en contacto pronto.</div>`
    : "";

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(boot.brandName)} — Bienvenido</title>
  <style>${css}</style>
</head>
<body>
  <div class="container">
    ${successMsg}

    ${(resultado.html ?? resultado) as any}

    <footer style="text-align: center; padding: 20px; margin-top: 40px; border-top: 1px solid var(--color-border); font-size: 0.9em; color: #6b7280;">
      <p>&copy; 2026 ${esc(boot.brandName)}. Todos los derechos reservados.</p>
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Maneja POST /web/solicitud: crea expediente sin guardar datos personales en evento.
 */
export async function handleSolicitud(
  runtime: AppRuntime,
  identities: ParteIdentityStore,
  body: string,
): Promise<{ ok: boolean; redirectTo: string; error?: string }> {
  // Parsear form data
  const form: Record<string, string> = {};
  new URLSearchParams(body).forEach((v, k) => {
    form[k] = v;
  });

  const nombre = (form.nombre ?? "").trim();
  const contacto = (form.contacto ?? "").trim();
  const mensaje = (form.mensaje ?? "").trim();
  const trampa = (form.trampa ?? "").trim();

  // Validaciones antispam
  if (trampa !== "") {
    return { ok: false, redirectTo: "/web?error=spam" };
  }

  const bodySize = new TextEncoder().encode(body).length;
  if (bodySize > 2048) {
    return { ok: false, redirectTo: "/web?error=size" };
  }

  if (!nombre || !contacto) {
    return { ok: false, redirectTo: "/web?error=required" };
  }

  // Guardar datos personales en identity store (no en evento)
  const parteId = `parte-web-${Date.now()}`;
  try {
    const data: import("../policies/identity.js").PartePersonalData = {
      displayName: nombre,
      ...(contacto.includes("@") ? { email: contacto } : {}),
      ...(!contacto.includes("@") ? { phone: contacto } : {}),
    };
    identities.put("default-tenant", parteId, data, new Date().toISOString());
  } catch (e) {
    console.error("Error guardando identidad:", e);
    return { ok: false, redirectTo: "/web?error=identity" };
  }

  // Crear expediente (transaction) en el proceso principal
  try {
    const firstLifecycle = runtime.boot.input.lifecycles[0];
    if (!firstLifecycle) {
      return { ok: false, redirectTo: "/web?error=no_process" };
    }

    const subjectId = `web-${Date.now()}`;
    runtime.addSubject({
      id: subjectId,
      lifecycleId: firstLifecycle.id,
      label: `Solicitud de ${nombre}`,
      parteId,
    });

    // Registrar evento sin datos personales (solo parteId y mensaje)
    const event = {
      id: `evt-${Date.now()}`,
      timestamp: new Date().toISOString(),
      subjectId,
      kind: "transicion" as const,
      actor: "web",
      parteId,
      stateId: firstLifecycle.lifecycle.states[0]?.id ?? "inicial",
      notas: mensaje || "",
    };

    // En una implementación real, se usaría runtime.store.append()
    // Por ahora, simplemente registramos el sujeto

    return { ok: true, redirectTo: "/web?enviado=1" };
  } catch (e) {
    console.error("Error creando expediente:", e);
    return { ok: false, redirectTo: "/web?error=create" };
  }
}
