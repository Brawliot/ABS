/**
 * Borrador de Registro de Actividades de Tratamiento (art. 30 RGPD).
 * Generado desde la configuración real del sistema — no es asesoramiento legal.
 */

import { DEFAULT_RETENTION } from "./retention.js";
import { THIRD_PARTY_REGISTRY } from "./third-party.js";

export interface RatEntry {
  readonly purpose: string;
  readonly dataCategories: readonly string[];
  readonly dataSubjects: readonly string[];
  readonly recipients: readonly string[];
  readonly retention: string;
  readonly transfersOutsideEea: string;
  readonly securityMeasures: readonly string[];
}

export function draftRatFromConfig(companyId: string): {
  readonly title: string;
  readonly disclaimer: string;
  readonly companyId: string;
  readonly generatedAt: string;
  readonly entries: readonly RatEntry[];
} {
  return {
    title: "Registro de actividades de tratamiento (borrador automático)",
    disclaimer:
      "PENDIENTE DE REVISIÓN POR ABOGADO. Documento técnico generado por ABS; no constituye asesoramiento jurídico ni RAT definitivo.",
    companyId,
    generatedAt: new Date().toISOString(),
    entries: [
      {
        purpose: "Prestación del software de gestión (expedientes, transiciones)",
        dataCategories: [
          "identificadores de cuenta",
          "rol / sede / equipo",
          "datos de Parte (nombre, contacto) fuera del EventStore",
        ],
        dataSubjects: ["empleados", "clientes (portal)", "invitados"],
        recipients: ["personal autorizado de la empresa", ...THIRD_PARTY_REGISTRY.map((t) => t.provider)],
        retention: DEFAULT_RETENTION.map(
          (r) => `${r.kind}: ${r.retainDays}d (${r.action}${r.legalHold ? ", legalHold" : ""})`,
        ).join("; "),
        transfersOutsideEea:
          "Posible si se usa OpenAI u otro LLM fuera de la UE — documentar SCC / decisión de adecuación",
        securityMeasures: [
          "argon2id",
          "sesiones HttpOnly/Secure/SameSite",
          "CSRF",
          "CSP/HSTS",
          "PII separada del EventStore",
          "minimización LLM",
        ],
      },
      {
        purpose: "Seguridad y control de acceso",
        dataCategories: ["logs de login (huella email)", "IP hasheada opcional", "cambios de rol"],
        dataSubjects: ["usuarios de cuenta"],
        recipients: ["administradores de la empresa", "encargado de hosting"],
        retention: "security_logs según política de retención",
        transfersOutsideEea: "No, salvo proveedor de hosting",
        securityMeasures: ["rate limit", "registro de seguridad", "logout-all"],
      },
    ],
  };
}
