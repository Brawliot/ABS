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
  const successColor = ds.tokens.colors.success ?? "#10b981";
  const textLightColor = ds.tokens.colors.neutrals.textLight ?? "#6b7280";

  const css = `
    :root {
      --color-primary: ${esc(brandColor)};
      --color-bg: ${esc(bgColor)};
      --color-text: ${esc(textColor)};
      --color-border: ${esc(borderColor)};
      --color-success: ${esc(successColor)};
      --color-light: ${esc(textLightColor)};
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--color-bg);
      color: var(--color-text);
      line-height: 1.6;
      font-size: 16px;
    }

    .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }

    header {
      background: linear-gradient(135deg, var(--color-primary) 0%, rgba(0,0,0,0.05) 100%);
      color: white;
      padding: 80px 20px;
      margin-bottom: 0;
      border-bottom: 1px solid var(--color-border);
    }

    header h1 {
      font-size: clamp(2em, 5vw, 3.5em);
      margin-bottom: 15px;
      color: white;
      font-weight: 700;
    }

    header p {
      font-size: 1.1em;
      opacity: 0.95;
      max-width: 600px;
      margin: 0;
    }

    h2 {
      font-size: 2em;
      margin: 50px 0 30px;
      color: var(--color-text);
      font-weight: 700;
    }

    h3 {
      font-size: 1.3em;
      margin: 20px 0 15px;
      color: var(--color-text);
    }

    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 30px;
      margin: 40px 0;
    }

    .feature-card {
      padding: 30px;
      border-radius: 12px;
      border: 1px solid var(--color-border);
      background: var(--color-bg);
      transition: all 0.3s ease;
    }

    .feature-card:hover {
      box-shadow: 0 10px 30px rgba(0,0,0,0.08);
      transform: translateY(-5px);
      border-color: var(--color-primary);
    }

    .feature-icon {
      font-size: 2.5em;
      margin-bottom: 15px;
      display: inline-block;
    }

    .feature-card h3 { margin-top: 0; }
    .feature-card p { color: var(--color-light); margin: 10px 0 0; }

    .offers {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 25px;
      margin: 30px 0;
    }

    .offer-card {
      border: 2px solid var(--color-border);
      border-radius: 12px;
      padding: 30px 25px;
      background: var(--color-bg);
      transition: all 0.3s ease;
      text-align: center;
    }

    .offer-card:hover {
      border-color: var(--color-primary);
      box-shadow: 0 8px 25px rgba(0,0,0,0.06);
      transform: translateY(-4px);
    }

    .offer-title {
      font-weight: 700;
      margin-bottom: 12px;
      font-size: 1.2em;
      color: var(--color-text);
    }

    .offer-price {
      font-size: 1.8em;
      color: var(--color-primary);
      font-weight: 700;
      margin: 15px 0;
    }

    .offer-desc {
      color: var(--color-light);
      font-size: 0.95em;
      margin: 10px 0;
    }

    .cta-button {
      display: inline-block;
      padding: 12px 28px;
      background: var(--color-primary);
      color: white;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 600;
      transition: all 0.3s ease;
      border: 2px solid var(--color-primary);
      cursor: pointer;
      font-size: 1em;
    }

    .cta-button:hover {
      opacity: 0.9;
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0,0,0,0.1);
    }

    .cta-secondary {
      background: transparent;
      color: var(--color-primary);
    }

    .cta-secondary:hover {
      background: var(--color-primary);
      color: white;
    }

    .steps-container {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 30px;
      margin: 40px 0;
    }

    .step {
      display: flex;
      gap: 20px;
    }

    .step-number {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 50px;
      height: 50px;
      min-width: 50px;
      border-radius: 50%;
      background: var(--color-primary);
      color: white;
      font-weight: 700;
      font-size: 1.3em;
    }

    .step-content h3 { margin-top: 0; }
    .step-content p { color: var(--color-light); }

    .info-section {
      background: linear-gradient(135deg, rgba(0,0,0,0.02), rgba(0,0,0,0.05));
      padding: 30px;
      border-radius: 12px;
      margin: 40px 0;
      border-left: 4px solid var(--color-primary);
    }

    .form-container {
      background: #f9fafb;
      padding: 40px;
      border-radius: 12px;
      max-width: 550px;
      margin: 40px auto;
    }

    form {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    label {
      font-weight: 600;
      color: var(--color-text);
      font-size: 0.95em;
    }

    input[type="text"],
    input[type="email"],
    input[type="tel"],
    textarea {
      padding: 12px 14px;
      border: 1.5px solid var(--color-border);
      border-radius: 6px;
      font-family: inherit;
      font-size: 1em;
      transition: all 0.2s;
      background: white;
    }

    input[type="text"]:focus,
    input[type="email"]:focus,
    input[type="tel"]:focus,
    textarea:focus {
      outline: none;
      border-color: var(--color-primary);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    textarea {
      resize: vertical;
      min-height: 120px;
    }

    input[type="hidden"] {
      display: none;
    }

    button[type="submit"] {
      padding: 14px 20px;
      background: var(--color-primary);
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 700;
      cursor: pointer;
      font-size: 1.05em;
      transition: all 0.3s;
      margin-top: 10px;
    }

    button[type="submit"]:hover {
      opacity: 0.9;
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0,0,0,0.1);
    }

    button[type="submit"]:active {
      transform: translateY(0);
    }

    .success-message {
      background: #dcfce7;
      color: #166534;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 30px;
      text-align: center;
      border-left: 4px solid var(--color-success);
      font-weight: 500;
    }

    .error-message {
      background: #fee2e2;
      color: #991b1b;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 30px;
      border-left: 4px solid #ef4444;
    }

    footer {
      text-align: center;
      padding: 50px 20px;
      margin-top: 60px;
      border-top: 2px solid var(--color-border);
      background: #f9fafb;
      color: var(--color-light);
    }

    footer p { margin: 8px 0; }

    .social-links {
      margin: 20px 0;
      display: flex;
      justify-content: center;
      gap: 15px;
    }

    .social-links a {
      color: var(--color-primary);
      text-decoration: none;
      font-weight: 500;
      transition: all 0.3s;
    }

    .social-links a:hover {
      opacity: 0.7;
    }

    details {
      margin: 15px 0;
      padding: 20px;
      border: 1px solid var(--color-border);
      border-radius: 8px;
    }

    details summary {
      font-weight: 600;
      cursor: pointer;
      color: var(--color-text);
      user-select: none;
    }

    details summary:hover {
      color: var(--color-primary);
    }

    details p {
      margin: 15px 0 0;
      color: var(--color-light);
    }

    @media (max-width: 768px) {
      header {
        padding: 50px 20px;
      }

      header h1 {
        font-size: 2em;
      }

      header p {
        font-size: 1em;
      }

      h2 {
        font-size: 1.6em;
        margin: 35px 0 20px;
      }

      .features-grid,
      .offers,
      .steps-container {
        grid-template-columns: 1fr;
        gap: 20px;
      }

      .step {
        gap: 15px;
      }

      .form-container {
        padding: 25px;
      }

      form {
        gap: 15px;
      }

      .step-number {
        width: 45px;
        height: 45px;
        font-size: 1.1em;
      }

      footer {
        padding: 30px 20px;
      }
    }

    @media (max-width: 480px) {
      body {
        font-size: 14px;
      }

      h2 {
        font-size: 1.4em;
      }

      .container {
        padding: 0 15px;
      }

      header {
        padding: 40px 15px;
      }
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
  <meta name="description" content="Soluciones ágiles y confiables para tu negocio" />
  <title>${esc(boot.brandName)} — Soluciones de negocio</title>
  <style>${css}</style>
</head>
<body>
  ${successMsg}

  ${(resultado.html ?? resultado) as any}

  <footer>
    <div class="container">
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 30px; margin-bottom: 40px;">
        <div>
          <h3 style="color: var(--color-primary); margin-bottom: 15px;">${esc(boot.brandName)}</h3>
          <p style="margin: 0; font-size: 0.95em;">Soluciones ágiles, resultados confiables</p>
        </div>
        <div>
          <h4 style="margin-top: 0; margin-bottom: 10px;">Rápido</h4>
          <p style="margin: 0; color: var(--color-light); font-size: 0.9em;">Procesos optimizados</p>
        </div>
        <div>
          <h4 style="margin-top: 0; margin-bottom: 10px;">Confiable</h4>
          <p style="margin: 0; color: var(--color-light); font-size: 0.9em;">Garantizado</p>
        </div>
        <div>
          <h4 style="margin-top: 0; margin-bottom: 10px;">Contacto</h4>
          <p style="margin: 0; color: var(--color-light); font-size: 0.9em;"><a href="#solicitud" style="color: var(--color-primary); text-decoration: none;">Solicita información</a></p>
        </div>
      </div>
      <div style="border-top: 1px solid var(--color-border); padding-top: 30px; text-align: center;">
        <p style="margin: 0; font-size: 0.9em;">&copy; 2026 ${esc(boot.brandName)}. Todos los derechos reservados.</p>
        <p style="margin: 10px 0 0; font-size: 0.85em; color: var(--color-light);">Hecho con ❤️ — Soluciones deterministas basadas en eventos</p>
      </div>
    </div>
  </footer>
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
