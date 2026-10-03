/**
 * Service Worker Manager - PWA Core Implementation
 * Maneja: caching, offline support, background sync, push notifications
 */

export interface CacheStrategy {
  name: string;
  type: 'stale-while-revalidate' | 'network-first' | 'cache-first';
  cacheName: string;
  ttl?: number; // milliseconds
}

export interface SyncEvent {
  tag: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface PushNotificationConfig {
  title: string;
  options?: NotificationOptions;
}

export class ServiceWorkerManager {
  private cacheName = 'abs-v1';
  private syncQueue: SyncEvent[] = [];
  private strategies: Map<string, CacheStrategy> = new Map();
  private isRegistered = false;

  constructor(private swPath: string = '/sw.js') {
    this.initializeStrategies();
  }

  private initializeStrategies(): void {
    // Estrategia: stale-while-revalidate (sirve del cache mientras actualiza en background)
    this.strategies.set('api', {
      name: 'api',
      type: 'stale-while-revalidate',
      cacheName: `${this.cacheName}-api`,
      ttl: 5 * 60 * 1000, // 5 minutos
    });

    // Estrategia: network-first (intenta red, fallback a cache)
    this.strategies.set('html', {
      name: 'html',
      type: 'network-first',
      cacheName: `${this.cacheName}-html`,
      ttl: 24 * 60 * 60 * 1000, // 1 día
    });

    // Estrategia: cache-first (sirve del cache, fallback a red)
    this.strategies.set('assets', {
      name: 'assets',
      type: 'cache-first',
      cacheName: `${this.cacheName}-assets`,
      ttl: 30 * 24 * 60 * 60 * 1000, // 30 días
    });
  }

  /**
   * Registra el Service Worker en el navegador
   */
  async register(): Promise<ServiceWorkerRegistration> {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Workers no soportados en este navegador');
    }

    try {
      const registration = await navigator.serviceWorker.register(this.swPath);
      this.isRegistered = true;

      // Escuchar mensajes del SW
      navigator.serviceWorker.onmessage = (event) => {
        this.handleSWMessage(event.data);
      };

      return registration;
    } catch (error) {
      console.error('Error registrando Service Worker:', error);
      throw error;
    }
  }

  /**
   * Maneja mensajes del Service Worker
   */
  private handleSWMessage(data: Record<string, unknown>): void {
    if (data.type === 'sync-complete') {
      this.syncQueue = this.syncQueue.filter((e) => e.tag !== data.tag);
      this.onSyncComplete?.(data);
    } else if (data.type === 'notification-click') {
      this.onNotificationClick?.(data);
    }
  }

  /**
   * Offline support: retorna true si hay conexión
   */
  isOnline(): boolean {
    return navigator.onLine;
  }

  /**
   * Registra un evento para sincronizar cuando vuelve online
   */
  async queueSync(tag: string, data: Record<string, unknown>): Promise<void> {
    const event: SyncEvent = {
      tag,
      data,
      timestamp: new Date().toISOString(),
    };

    this.syncQueue.push(event);
    this.persistSyncQueue();

    // Si hay SW registrado, pedir background sync
    if (this.isRegistered && 'serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if ('SyncManager' in window) {
          await (registration as any).sync.register(tag);
        }
      } catch (error) {
        console.error('Error registrando background sync:', error);
      }
    }
  }

  /**
   * Persiste la cola de sync en localStorage
   */
  private persistSyncQueue(): void {
    try {
      localStorage.setItem('abs-sync-queue', JSON.stringify(this.syncQueue));
    } catch (error) {
      console.error('Error persistiendo sync queue:', error);
    }
  }

  /**
   * Restaura la cola de sync desde localStorage
   */
  private restoreSyncQueue(): void {
    try {
      const stored = localStorage.getItem('abs-sync-queue');
      if (stored) {
        this.syncQueue = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Error restaurando sync queue:', error);
    }
  }

  /**
   * Obtiene eventos pendientes para sincronizar
   */
  getPendingSyncEvents(): SyncEvent[] {
    return [...this.syncQueue];
  }

  /**
   * Marca un evento como sincronizado
   */
  markSyncEventAsComplete(tag: string): void {
    this.syncQueue = this.syncQueue.filter((e) => e.tag !== tag);
    this.persistSyncQueue();
  }

  /**
   * Solicita permiso de notificaciones
   */
  async requestNotificationPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      throw new Error('Notificaciones no soportadas');
    }

    if (Notification.permission === 'granted') {
      return 'granted';
    }

    if (Notification.permission !== 'denied') {
      return await Notification.requestPermission();
    }

    throw new Error('Permisos de notificación denegados');
  }

  /**
   * Envía una push notification (requiere Service Worker)
   */
  async sendNotification(config: PushNotificationConfig): Promise<void> {
    try {
      const permission = Notification.permission;
      if (permission !== 'granted') {
        throw new Error('Notificaciones no permitidas');
      }

      if (this.isRegistered && 'serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(config.title, config.options);
      }
    } catch (error) {
      console.error('Error enviando notificación:', error);
    }
  }

  /**
   * Limpia caches obsoletos
   */
  async cleanupCaches(): Promise<void> {
    if (!('caches' in window)) return;

    try {
      const cacheNames = await caches.keys();
      const activeCaches = Array.from(this.strategies.values()).map(
        (s) => s.cacheName
      );

      for (const name of cacheNames) {
        if (!activeCaches.includes(name) && name.startsWith(this.cacheName)) {
          await caches.delete(name);
        }
      }
    } catch (error) {
      console.error('Error limpiando caches:', error);
    }
  }

  /**
   * Obtiene información de caché
   */
  async getCacheInfo(): Promise<Record<string, { keys: string[]; size: number }>> {
    if (!('caches' in window)) return {};

    const info: Record<string, { keys: string[]; size: number }> = {};

    try {
      for (const [name, strategy] of this.strategies) {
        const cache = await caches.open(strategy.cacheName);
        const keys = await cache.keys();
        const urls = keys.map((k) => k.url);

        info[name] = {
          keys: urls,
          size: urls.length,
        };
      }
    } catch (error) {
      console.error('Error obteniendo cache info:', error);
    }

    return info;
  }

  /**
   * Unregistra el Service Worker
   */
  async unregister(): Promise<void> {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
      this.isRegistered = false;
    }
  }

  /**
   * Callbacks para eventos
   */
  onSyncComplete?: (data: Record<string, unknown>) => void;
  onNotificationClick?: (data: Record<string, unknown>) => void;
}

/**
 * Singleton global del Service Worker Manager
 */
let swManager: ServiceWorkerManager | null = null;

export function getServiceWorkerManager(): ServiceWorkerManager {
  if (!swManager) {
    swManager = new ServiceWorkerManager();
  }
  return swManager;
}

export function resetServiceWorkerManager(): void {
  swManager = null;
}
