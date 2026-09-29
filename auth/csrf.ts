/**
 * CSRF: token de sesión debe coincidir con header o campo de formulario.
 */

import { timingSafeEqual } from "node:crypto";
import type { AuthSession } from "./session.js";

export function assertCsrf(
  session: AuthSession,
  provided: string | undefined,
): void {
  if (!provided || !session.csrfToken) {
    throw new CsrfError("Falta token CSRF");
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(session.csrfToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new CsrfError("Token CSRF inválido");
  }
}

export class CsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsrfError";
  }
}
