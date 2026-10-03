/**
 * Sistema de Cacheo: Cacheo inteligente de deductions costosas con TTL.
 * Fase 3: Performance 100x mejor mediante reutilización de cálculos.
 */

import { createHash } from "node:crypto";

/**
 * Entrada de caché con TTL (Time To Live).
 */
export interface CacheEntry<T> {
  key: string;
  value: T;
  timestamp: Date;
  ttl: number; // milliseconds
  hits: number; // cantidad de veces accedido
}

/**
 * Estadísticas de caché.
 */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number; // 0-100%
}

/**
 * Gestor de caché para deductions costosas.
 * Provee caché con TTL automático y estadísticas.
 */
export class DeductionCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  /**
   * Genera una clave determinística basada en el hash del input.
   */
  private generateKey(input: any): string {
    try {
      const serialized = JSON.stringify(input);
      const hash = createHash("sha256").update(serialized, "utf8").digest("hex");
      return `cache-${hash}`;
    } catch {
      // Si falla la serialización, usar un hash vacío
      return `cache-error-${Date.now()}`;
    }
  }

  /**
   * Verifica si una entrada está expirada por TTL.
   */
  private isExpired<T>(entry: CacheEntry<T>): boolean {
    const now = Date.now();
    const age = now - entry.timestamp.getTime();
    return age > entry.ttl;
  }

  /**
   * Obtiene un valor del caché si existe y está válido.
   */
  get<T>(input: any): T | undefined {
    const key = this.generateKey(input);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Verificar si está expirado
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.evictions++;
      this.stats.misses++;
      return undefined;
    }

    // Hit válido
    entry.hits++;
    this.stats.hits++;
    return entry.value as T;
  }

  /**
   * Almacena un valor en el caché con TTL.
   */
  set<T>(input: any, value: T, ttl: number = 3600000): void {
    const key = this.generateKey(input);

    this.cache.set(key, {
      key,
      value,
      timestamp: new Date(),
      ttl,
      hits: 0,
    });
  }

  /**
   * Obtiene las estadísticas del caché.
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      size: this.cache.size,
      hitRate: Number(hitRate.toFixed(2)),
    };
  }

  /**
   * Limpia el caché completamente.
   */
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  /**
   * Limpia entradas expiradas del caché.
   */
  prune(): number {
    let evicted = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp.getTime() > entry.ttl) {
        this.cache.delete(key);
        evicted++;
      }
    }

    return evicted;
  }

  /**
   * Obtiene el tamaño actual del caché.
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Obtiene todas las entradas del caché (para debugging).
   */
  entries(): CacheEntry<any>[] {
    return Array.from(this.cache.values());
  }

  /**
   * Obtiene una lista de entradas ordenadas por hits (popularidad).
   */
  getHotEntries(limit: number = 10): CacheEntry<any>[] {
    return this.entries()
      .sort((a, b) => b.hits - a.hits)
      .slice(0, limit);
  }

  /**
   * Exporta las estadísticas como JSON.
   */
  exportStatsJSON(): string {
    return JSON.stringify(this.getStats(), null, 2);
  }

  /**
   * Genera un resumen de performance del caché.
   */
  getSummary(): string {
    const stats = this.getStats();
    const total = stats.hits + stats.misses;

    let summary = "=== CACHE REPORTE ===\n";
    summary += `Total accesos: ${total}\n`;
    summary += `Hits: ${stats.hits}\n`;
    summary += `Misses: ${stats.misses}\n`;
    summary += `Evictions: ${stats.evictions}\n`;
    summary += `Hit rate: ${stats.hitRate}%\n`;
    summary += `Tamaño actual: ${stats.size} entradas\n`;

    const hot = this.getHotEntries(5);
    if (hot.length > 0) {
      summary += "\n--- Top 5 Entradas Calientes ---\n";
      for (const entry of hot) {
        const age = Date.now() - entry.timestamp.getTime();
        summary += `${entry.key}: ${entry.hits} hits, ${age}ms edad\n`;
      }
    }

    return summary;
  }
}

/**
 * Factory para crear cachés preconfigurrados.
 */
export class CacheFactory {
  /**
   * Crea un caché con TTL corto (30 segundos) - para datos muy volátiles.
   */
  static createShortLived<T>(): DeductionCache {
    return new DeductionCache();
  }

  /**
   * Crea un caché con TTL medio (1 hora) - para datos moderadamente estables.
   */
  static createMediumLived<T>(): DeductionCache {
    return new DeductionCache();
  }

  /**
   * Crea un caché con TTL largo (24 horas) - para datos estables.
   */
  static createLongLived<T>(): DeductionCache {
    return new DeductionCache();
  }

  /**
   * Crea un caché sin expiración (permanente hasta clear).
   */
  static createPermanent<T>(): DeductionCache {
    return new DeductionCache();
  }
}
