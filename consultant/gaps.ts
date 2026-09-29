/**
 * Registro de preguntas no respondidas (métricas que faltan en el catálogo).
 */

import type { UnansweredGap } from "./types.js";

export class UnansweredGapLog {
  private readonly gaps: UnansweredGap[] = [];

  record(gap: UnansweredGap): void {
    this.gaps.push(Object.freeze({ ...gap }));
  }

  all(): readonly UnansweredGap[] {
    return this.gaps;
  }

  byMissingHint(hint: string): readonly UnansweredGap[] {
    return this.gaps.filter((g) => g.missingHint.includes(hint));
  }

  size(): number {
    return this.gaps.length;
  }
}
