/**
 * Propuesta UNA VEZ de plantillas (stand-in LLM). Determinista por entrada.
 */

import { createHash } from "node:crypto";
import { canonicalStringify } from "../../policies/compiler.js";
import type { UiSpec } from "../../presentation/types.js";
import type { TextTone } from "../schema.js";
import type {
  BusinessVocabulary,
  CopyTemplate,
  InterfaceCopyPack,
} from "./types.js";
import { validateCopyPack } from "./validate.js";

export interface ProposeCopyInput {
  readonly spec: UiSpec;
  readonly tone: TextTone;
  readonly locale: string;
  readonly vocabulary?: BusinessVocabulary;
  readonly proposedAt: string;
}

function verbObjectButton(
  transitionId: string,
  labelKey: string,
  tone: TextTone,
): string {
  const hay = `${transitionId} ${labelKey}`.toLowerCase();
  if (/recibir|recepcion/.test(hay)) return "Recibir mercancía";
  if (/aceptar/.test(hay)) {
    return tone === "formal" ? "Aceptar propuesta" : "Aceptar pedido";
  }
  if (/cerrar|pagar/.test(hay)) return "Confirmar cobro";
  if (/cancel/.test(hay)) return "Cancelar pedido";
  if (/comprar|compra/.test(hay)) return "Crear pedido a proveedor";
  if (/entreg/.test(hay)) return "Registrar entrega";
  // Verbo + objeto genérico sin jerga
  const verb = tone === "cercano" ? "Continuar con" : "Procesar";
  return `${verb} pedido`;
}

function emptyScreen(tone: TextTone): string {
  if (tone === "cercano") return "Aquí no hay nada todavía. Cuando haya movimientos, los verás listados.";
  if (tone === "tecnico") return "Sin registros que mostrar para los filtros actuales.";
  return "No hay elementos en esta lista.";
}

function confirmation(tone: TextTone): string {
  if (tone === "cercano") return "¿Seguro que quieres {{accion_label}}?";
  if (tone === "tecnico") return "Confirme la operación: {{accion_label}}.";
  return "¿Desea confirmar «{{accion_label}}»?";
}

function helpBrief(tone: TextTone): string {
  if (tone === "cercano") return "Si dudas, revisa el importe y el plazo antes de seguir.";
  if (tone === "tecnico") return "Complete los campos obligatorios marcados antes de enviar.";
  return "Revise los datos destacados antes de continuar.";
}

const DEFAULT_VOCAB: BusinessVocabulary = {
  "evidencia de entrega": "albarán",
  "evidencia física": "documento adjunto",
  "reference type": "tipo de documento",
};

/**
 * Propone el pack de copy a partir de la especificación (una vez).
 * Misma entrada ⇒ mismas plantillas.
 */
export function proposeCopyPack(input: ProposeCopyInput): InterfaceCopyPack {
  const locale = input.locale;
  const vocabulary = {
    ...DEFAULT_VOCAB,
    ...(input.vocabulary ?? {}),
  };
  const templates: CopyTemplate[] = [];

  for (const action of input.spec.actions) {
    const btn = verbObjectButton(
      action.transitionId,
      action.labelKey,
      input.tone,
    );
    templates.push({
      id: `tpl.${action.id}.button`,
      kind: "button",
      key: `${action.id}.button`,
      template: btn,
      requiredVariables: [],
      locale,
    });
    templates.push({
      id: `tpl.${action.id}.label`,
      kind: "label",
      key: `${action.id}.label`,
      template: btn,
      requiredVariables: [],
      locale,
    });
    templates.push({
      id: `tpl.${action.id}.confirm`,
      kind: "confirmation",
      key: `${action.id}.confirmation`,
      template: confirmation(input.tone).replace(
        "{{accion_label}}",
        "{{accion_label}}",
      ),
      requiredVariables: ["accion_label"],
      locale,
    });
  }

  for (const view of input.spec.views) {
    templates.push({
      id: `tpl.${view.id}.empty`,
      kind: "empty",
      key: `${view.id}.empty`,
      template: emptyScreen(input.tone),
      requiredVariables: [],
      locale,
    });
    templates.push({
      id: `tpl.${view.id}.help`,
      kind: "help",
      key: `${view.id}.help`,
      template: helpBrief(input.tone),
      requiredVariables: [],
      locale,
    });
    const title =
      input.spec.content[view.id]?.title ??
      (view.stateId ? `Lista · ${view.stateId}` : "Detalle");
    // Evitar jerga "estado" en label visible: usar "situación" solo si hace falta
    const safeTitle = title.replace(/\bestado\b/gi, "situación");
    templates.push({
      id: `tpl.${view.id}.label`,
      kind: "label",
      key: `${view.id}.label`,
      template: safeTitle.slice(0, 48),
      requiredVariables: [],
      locale,
    });
  }

  // Errores estándar (hechos como variables)
  templates.push({
    id: "tpl.error.credito",
    kind: "error",
    key: "error.credito",
    template:
      input.tone === "cercano"
        ? "No puedes cerrar este pedido: la deuda es {{deuda}} € y el límite es {{limite}} €. Pide aprobación a tu responsable o baja el importe."
        : "Este pedido necesita la aprobación de tu responsable porque supera los {{limite}} €. La deuda actual es {{deuda}} €. Solicita aprobación o reduce el importe.",
    requiredVariables: ["deuda", "limite"],
    locale,
  });
  templates.push({
    id: "tpl.error.aprobacion",
    kind: "error",
    key: "error.aprobacion",
    template:
      "Esta operación requiere la aprobación de tu responsable (importe {{importe}} €). Pídele que la valide o ajusta el importe.",
    requiredVariables: ["importe"],
    locale,
  });
  templates.push({
    id: "tpl.error.permiso",
    kind: "error",
    key: "error.permiso",
    template:
      "No tienes permiso para «{{accion_label}}». Pide a un compañero autorizado que la realice o cambia de perfil.",
    requiredVariables: ["accion_label"],
    locale,
  });
  templates.push({
    id: "tpl.error.generico",
    kind: "error",
    key: "error.generico",
    template:
      "No se pudo completar «{{accion_label}}». Revisa los datos del pedido {{pedido}} e inténtalo de nuevo.",
    requiredVariables: ["accion_label", "pedido"],
    locale,
  });
    // Bloqueos de composición (procesos secundarios)
    templates.push({
      id: "tpl.error.bloqueo_composicion",
      kind: "error",
      key: "error.bloqueo_composicion",
      template:
        input.tone === "cercano"
          ? "No puedes avanzar a «{{estado_destino}}» todavía. Primero completa el proceso de «{{secundario}}» (expediente {{instancia}}) con tu equipo."
          : "Para avanzar a estado «{{estado_destino}}», debe completarse primero el proceso secundario «{{secundario}}» (expediente {{instancia}}). Contacte al responsable o acceda al enlace directo.",
      requiredVariables: ["estado_destino", "secundario", "instancia"],
      locale,
    });

  templates.sort((a, b) => a.key.localeCompare(b.key));

  const pack: InterfaceCopyPack = {
    version: "copy-1.0.0",
    contentHash: "",
    sourceUiSpecHash: input.spec.contentHash,
    locale,
    tone: input.tone,
    templates,
    vocabulary,
    proposedAt: input.proposedAt,
  };
  const contentHash = createHash("sha256")
    .update(
      canonicalStringify({
        sourceUiSpecHash: pack.sourceUiSpecHash,
        locale: pack.locale,
        tone: pack.tone,
        templates: pack.templates,
        vocabulary: pack.vocabulary,
      }),
    )
    .digest("hex")
    .slice(0, 24);

  const finalPack: InterfaceCopyPack = { ...pack, contentHash };
  validateCopyPack(finalPack);
  return finalPack;
}

/** Misma especificación ⇒ mismo hash de copy (sin LLM en runtime). */
export function copyPackHashFromSpec(
  spec: UiSpec,
  tone: TextTone,
  locale: string,
  vocabulary?: BusinessVocabulary,
): string {
  return proposeCopyPack({
    spec,
    tone,
    locale,
    ...(vocabulary ? { vocabulary } : {}),
    proposedAt: "1970-01-01T00:00:00.000Z",
  }).contentHash;
}
