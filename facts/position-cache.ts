/**
 * SimplePositionCache: Caché LRU para proyecciones en posición histórica.
 *
 * Problema: readAt(pos1) calcula proyección, readAt(pos1) lo recalcula.
 * Solución: cachear últimas N posiciones consultadas.
 *
 * LRU: cuando llena, elimina la menos recientemente usada.
 */

import type { TenantFactProjection } from "./projection.js";

interface CacheEntry {
  position: number;
  projection: TenantFactProjection;
  timestamp: number; // para LRU
}

export class PositionCache {
  private readonly cache = new Map<number, CacheEntry>();
  private readonly maxEntries: number;

  constructor(maxEntries: number = 10) {
    this.maxEntries = maxEntries;
  }

  /**
   * Obtener proyección cacheada para una posición.
   */
  get(position: number): TenantFactProjection | null {
    const entry = this.cache.get(position);
    if (!entry) return null;

    // Actualizar timestamp para LRU
    entry.timestamp = Date.now();
    return entry.projection;
  }

  /**
   * Guardar proyección en caché.
   */
  set(position: number, projection: TenantFactProjection): void {
    // Si ya existe, actualizar timestamp
    if (this.cache.has(position)) {
      const entry = this.cache.get(position)!;
      entry.timestamp = Date.now();
      return;
    }

    // Si está lleno, eliminar LRU
    if (this.cache.size >= this.maxEntries) {
      let lruKey = -1;
      let lruTime = Infinity;

      for (const [key, entry] of this.cache) {
        if (entry.timestamp < lruTime) {
          lruTime = entry.timestamp;
          lruKey = key;
        }
      }

      if (lruKey >= 0) {
        this.cache.delete(lruKey);
      }
    }

    // Insertar nuevo
    this.cache.set(position, {
      position,
      projection,
      timestamp: Date.now(),
    });
  }

  /**
   * Limpiar caché.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Estadísticas para debugging.
   */
  stats(): { entries: number; maxEntries: number } {
    return {
      entries: this.cache.size,
      maxEntries: this.maxEntries,
    };
  }
}
