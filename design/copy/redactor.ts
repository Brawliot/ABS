/**
 * Orquestación: proponer pack → overlay; fill en runtime.
 */

import type { PresentationOverlay, UiSpec } from "../../presentation/types.js";
import type { TextTone } from "../schema.js";
import type { JudgeTrace } from "../../policies/judge.js";
import { proposeCopyPack } from "./propose.js";
import type { BusinessVocabulary, InterfaceCopyPack } from "./types.js";
import { fillAndLocalize } from "./fill.js";
import { renderJudgeErrorMessage } from "./errors.js";
import { assertNoJargonInVisibleText } from "./validate.js";

export interface RedactInterfaceInput {
  readonly spec: UiSpec;
  readonly tone: TextTone;
  readonly locale: string;
  readonly vocabulary?: BusinessVocabulary;
  readonly proposedAt: string;
  readonly overlay?: PresentationOverlay;
}

/**
 * Genera (una vez) el pack de copy y lo escribe en la capa superpuesta.
 */
export function redactInterfaceCopy(
  input: RedactInterfaceInput,
): {
  readonly pack: InterfaceCopyPack;
  readonly overlay: PresentationOverlay;
} {
  const pack = proposeCopyPack({
    spec: input.spec,
    tone: input.tone,
    locale: input.locale,
    ...(input.vocabulary ? { vocabulary: input.vocabulary } : {}),
    proposedAt: input.proposedAt,
  });
  const overlay = applyCopyPackToOverlay(input.overlay, pack);
  return { pack, overlay };
}

export function applyCopyPackToOverlay(
  overlay: PresentationOverlay | undefined,
  pack: InterfaceCopyPack,
): PresentationOverlay {
  return {
    version: overlay?.version ?? pack.version,
    ...(overlay?.identity ? { identity: overlay.identity } : {}),
    ...(overlay?.content ? { content: overlay.content } : {}),
    ...(overlay?.localization
      ? { localization: overlay.localization }
      : {}),
    ...(overlay?.designSystem
      ? { designSystem: overlay.designSystem }
      : {}),
    ...(overlay?.designSystemHistory
      ? { designSystemHistory: overlay.designSystemHistory }
      : {}),
    ...(overlay?.informationArchitecture
      ? { informationArchitecture: overlay.informationArchitecture }
      : {}),
    interfaceCopy: {
      version: pack.version,
      contentHash: pack.contentHash,
      sourceUiSpecHash: pack.sourceUiSpecHash,
      locale: pack.locale,
      tone: pack.tone,
      templates: pack.templates,
      vocabulary: pack.vocabulary,
      proposedAt: pack.proposedAt,
    },
  };
}

export function getTemplate(
  pack: InterfaceCopyPack,
  key: string,
) {
  return pack.templates.find((t) => t.key === key);
}

/** Texto de botón / etiqueta en runtime (determinista). */
export function resolveCopy(
  pack: InterfaceCopyPack,
  key: string,
  variables: Readonly<Record<string, string | number | boolean>> = {},
): string {
  const t = getTemplate(pack, key);
  if (!t) throw new Error(`Plantilla no encontrada: ${key}`);
  const text = fillAndLocalize(t, variables, pack.vocabulary);
  assertNoJargonInVisibleText(text);
  return text;
}

export function resolveJudgeError(
  pack: InterfaceCopyPack,
  trace: JudgeTrace,
  extras?: Readonly<Record<string, string | number | boolean>>,
): string {
  const text = renderJudgeErrorMessage(pack, trace, extras);
  assertNoJargonInVisibleText(text);
  return text;
}
