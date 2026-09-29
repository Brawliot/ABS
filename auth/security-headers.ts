/**
 * Cabeceras de seguridad HTTP.
 */

import { isProduction } from "./env.js";

export function securityHeaders(): Record<string, string> {
  // En prod: script-src estricto. En dev/test: unsafe-inline para axe/E2E
  // (no editar pruebas existentes) y SW de demostración.
  const scriptSrc = isProduction()
    ? "script-src 'self'"
    : "script-src 'self' 'unsafe-inline'";
  const csp = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  const h: Record<string, string> = {
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  if (isProduction()) {
    h["Strict-Transport-Security"] =
      "max-age=63072000; includeSubDomains; preload";
  }
  return h;
}
