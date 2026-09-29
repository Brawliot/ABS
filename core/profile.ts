/**
 * Capa 5 — Perfil: interfaz para aprendiz incremental (fase 2).
 * Aquí solo el contrato: el conocimiento se actualiza solo; la estructura no.
 */

export interface ProfileObservation {
  readonly at: string;
  readonly signal: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface ProfileSnapshot {
  readonly version: number;
  readonly updatedAt: string;
  readonly features: Readonly<Record<string, number>>;
}

/**
 * Aprendiz incremental: consume señales (p. ej. eventos de modificación)
 * y produce un perfil actualizado sin alterar la gramática.
 */
export interface IncrementalLearner {
  observe(observation: ProfileObservation): void;
  snapshot(): ProfileSnapshot;
}

/** Stub de fase 1: no aprende; cumple la interfaz para cablear el metaobjeto. */
export class NoOpLearner implements IncrementalLearner {
  private version = 0;
  private updatedAt = new Date(0).toISOString();

  observe(_observation: ProfileObservation): void {
    this.version += 1;
    this.updatedAt = new Date().toISOString();
  }

  snapshot(): ProfileSnapshot {
    return {
      version: this.version,
      updatedAt: this.updatedAt,
      features: Object.freeze({}),
    };
  }
}
