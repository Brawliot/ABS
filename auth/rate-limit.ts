/**
 * Límite de intentos (login, invitaciones, recuperación).
 */

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    readonly max: number,
    readonly windowMs: number,
  ) {}

  /** @returns true si permitido */
  check(key: string, nowMs = Date.now()): boolean {
    const cut = nowMs - this.windowMs;
    const prev = (this.hits.get(key) ?? []).filter((t) => t >= cut);
    if (prev.length >= this.max) {
      this.hits.set(key, prev);
      return false;
    }
    prev.push(nowMs);
    this.hits.set(key, prev);
    return true;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}

export const loginLimiter = new RateLimiter(8, 15 * 60_000);
export const inviteLimiter = new RateLimiter(20, 60 * 60_000);
export const resetLimiter = new RateLimiter(5, 60 * 60_000);
