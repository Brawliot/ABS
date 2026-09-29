/**
 * Retención configurable por tipo de dato.
 */

export type RetentionDataKind =
  | "parte_pii"
  | "security_logs"
  | "session"
  | "factura_legal"
  | "llm_call_logs"
  | "invitations";

export interface RetentionPolicy {
  readonly kind: RetentionDataKind;
  readonly retainDays: number;
  /** Si true, no se borra automáticamente (obligación legal). */
  readonly legalHold: boolean;
  readonly action: "delete" | "anonymize" | "retain";
  readonly note: string;
}

export const DEFAULT_RETENTION: readonly RetentionPolicy[] = [
  {
    kind: "parte_pii",
    retainDays: 365 * 3,
    legalHold: false,
    action: "anonymize",
    note: "Tras fin de relación; facturas pueden exigir conservar referencias fiscales por separado",
  },
  {
    kind: "security_logs",
    retainDays: 365,
    legalHold: false,
    action: "delete",
    note: "Logs de seguridad sin PII en claro",
  },
  {
    kind: "session",
    retainDays: 30,
    legalHold: false,
    action: "delete",
    note: "Sesiones revocadas / caducadas",
  },
  {
    kind: "factura_legal",
    retainDays: 365 * 10,
    legalHold: true,
    action: "retain",
    note: "Obligación mercantil/fiscal típica ES — confirmar con abogado",
  },
  {
    kind: "llm_call_logs",
    retainDays: 90,
    legalHold: false,
    action: "delete",
    note: "Solo hashes/tokens; sin texto de usuario",
  },
  {
    kind: "invitations",
    retainDays: 90,
    legalHold: false,
    action: "delete",
    note: "Invitaciones caducadas o aceptadas",
  },
];

export function dueForAction(
  policy: RetentionPolicy,
  createdAtIso: string,
  nowMs = Date.now(),
): boolean {
  if (policy.legalHold || policy.action === "retain") return false;
  const created = Date.parse(createdAtIso);
  return nowMs - created >= policy.retainDays * 86400_000;
}
