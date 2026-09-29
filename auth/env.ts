/**
 * Modo de entorno: producción vs desarrollo.
 * El selector de rol NUNCA está disponible en producción.
 */

export function isProduction(): boolean {
  const abs = (process.env.ABS_ENV ?? "").toLowerCase();
  if (abs === "production" || abs === "prod") return true;
  if (abs === "development" || abs === "dev" || abs === "test") return false;
  return process.env.NODE_ENV === "production";
}

/**
 * Selector / bootstrap DevSession solo si NO es producción.
 * Imposible activar en prod aunque se pase ABS_ALLOW_DEV_SESSION=1.
 */
export function allowDevSession(): boolean {
  if (isProduction()) return false;
  return process.env.ABS_ALLOW_DEV_SESSION !== "0";
}

const MIN_SESSION_SECRET_LEN = 32;

export function sessionSecret(): string {
  const s = process.env.ABS_SESSION_SECRET;
  if (s && s.length >= MIN_SESSION_SECRET_LEN) return s;
  if (isProduction()) {
    throw new Error(
      `ABS_SESSION_SECRET (≥${MIN_SESSION_SECRET_LEN} caracteres aleatorios) es obligatorio en producción`,
    );
  }
  return "dev-only-session-secret-do-not-use-in-prod";
}

/** Rechaza arranque en producción si la configuración de seguridad es insuficiente. */
export function assertProductionSecurityConfig(): void {
  if (!isProduction()) return;
  const s = process.env.ABS_SESSION_SECRET ?? "";
  if (s.length < MIN_SESSION_SECRET_LEN) {
    throw new Error(
      `Arranque abortado: ABS_SESSION_SECRET debe tener al menos ${MIN_SESSION_SECRET_LEN} caracteres aleatorios en producción (actual: ${s.length})`,
    );
  }
  const weak = new Set([
    "change-me",
    "secret",
    "password",
    "dev-only-session-secret-do-not-use-in-prod",
  ]);
  if (weak.has(s.toLowerCase()) || /^(.)\1{7,}$/.test(s)) {
    throw new Error(
      "Arranque abortado: ABS_SESSION_SECRET demasiado predecible para producción",
    );
  }
}

export function assertNoSecretInLogs(text: string): void {
  const forbidden = [
    process.env.OPENAI_API_KEY,
    process.env.ABS_SESSION_SECRET,
    process.env.ABS_SMTP_PASS,
    process.env.DATABASE_URL,
  ].filter((x): x is string => Boolean(x && x.length > 8));
  for (const secret of forbidden) {
    if (text.includes(secret)) {
      throw new Error("Intento de registrar un secreto en logs");
    }
  }
}
