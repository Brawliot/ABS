/**
 * Procedimiento ante brechas + detección básica de anomalías.
 */

import { listSecurityEvents, logSecurityEvent, type SecurityEvent } from "../auth/security-log.js";

export interface BreachProcedureStep {
  readonly order: number;
  readonly action: string;
  readonly owner: string;
  readonly deadlineHint: string;
}

export const BREACH_PROCEDURE: readonly BreachProcedureStep[] = [
  {
    order: 1,
    action: "Contener: revocar sesiones (logout-all), rotar secretos (ABS_SESSION_SECRET, API keys)",
    owner: "Responsable técnico",
    deadlineHint: "Inmediato",
  },
  {
    order: 2,
    action: "Evaluar riesgo para derechos y libertades de las personas",
    owner: "DPO / responsable tratamiento",
    deadlineHint: "< 24 h",
  },
  {
    order: 3,
    action: "Notificar a la autoridad de control si procede (72 h típicas)",
    owner: "DPO / abogado",
    deadlineHint: "< 72 h — PENDIENTE CRITERIO LEGAL",
  },
  {
    order: 4,
    action: "Comunicar a afectados si el riesgo es alto",
    owner: "DPO / comunicación",
    deadlineHint: "Sin dilación indebida — PENDIENTE CRITERIO LEGAL",
  },
  {
    order: 5,
    action: "Documentar la brecha, medidas y lecciones en el registro interno",
    owner: "Responsable técnico",
    deadlineHint: "Durante el incidente",
  },
];

/** Detección básica: muchos fallos de login o CSRF en ventana corta. */
export function detectAnomalies(windowMs = 15 * 60_000, nowMs = Date.now()): {
  readonly anomalies: readonly string[];
  readonly recent: readonly SecurityEvent[];
} {
  const recent = listSecurityEvents().filter(
    (e) => nowMs - Date.parse(e.at) <= windowMs,
  );
  const fails = recent.filter((e) => e.kind === "login_fail").length;
  const csrf = recent.filter((e) => e.kind === "csrf_reject").length;
  const anomalies: string[] = [];
  if (fails >= 20) {
    anomalies.push(`login_fail×${fails} en ${windowMs / 60000} min`);
  }
  if (csrf >= 10) {
    anomalies.push(`csrf_reject×${csrf} en ${windowMs / 60000} min`);
  }
  if (anomalies.length > 0) {
    logSecurityEvent({
      at: new Date(nowMs).toISOString(),
      kind: "anomaly",
      detail: anomalies.join("; "),
    });
  }
  return { anomalies, recent };
}

export const HOSTING_EU_CHECKLIST = `
# Alojamiento y copias en la UE — checklist técnico

PENDIENTE DE REVISIÓN POR ABOGADO / DECISIÓN DEL USUARIO.

1. Región del proveedor cloud: elegir UE (p. ej. eu-west / europe-west).
2. Bases de datos y object storage en la misma región UE.
3. Backups cifrados, retenidos en UE; probar restauración.
4. Subencargados: inventario + DPA firmados; evitar transferencia a EE.UU. sin SCC/adecuación.
5. Logs y APM: mismo requisito de ubicación o minimización agresiva.
6. LLM: si el proveedor procesa fuera de la EEA, documentar transferencia y bases (SCC).
7. ABS_SESSION_SECRET, OPENAI_API_KEY, SMTP: solo en gestor de secretos / env, nunca en repo.
`.trim();
