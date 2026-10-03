import crypto from 'node:crypto';
import { randomUUID } from 'crypto';

export interface WebhookConfiguracion {
  readonly id: string;
  readonly url: string;
  readonly eventos: string[];
  readonly activo: boolean;
  readonly secret: string | undefined;
  readonly createdAt: Date;
}

export interface EventoWebhook {
  readonly id: string;
  readonly tipo: string;
  readonly timestamp: Date;
  readonly datos: Record<string, any>;
}

export interface WebhookEnCola {
  id: string;
  webhookId: string;
  evento: EventoWebhook;
  intento: number;
  proximaEjecucion: Date;
  createdAt: Date;
}

export class GestorWebhooksSalientes {
  private readonly configuraciones = new Map<string, WebhookConfiguracion>();
  private readonly cola: WebhookEnCola[] = [];
  private readonly intentosMaximos = 3;
  private readonly tiemposReintento = [5000, 10000, 30000];

  registrarWebhook(url: string, eventos: string[], secret?: string): WebhookConfiguracion {
    const id = randomUUID();
    const config: WebhookConfiguracion = {
      id,
      url,
      eventos,
      activo: true,
      secret,
      createdAt: new Date(),
    };

    this.configuraciones.set(id, config);
    return config;
  }

  async enviarEvento(evento: EventoWebhook): Promise<void> {
    const configuracionesInteresadas = Array.from(this.configuraciones.values()).filter(
      config => config.activo && config.eventos.includes(evento.tipo),
    );

    for (const config of configuracionesInteresadas) {
      const enCola: WebhookEnCola = {
        id: randomUUID(),
        webhookId: config.id,
        evento,
        intento: 1,
        proximaEjecucion: new Date(),
        createdAt: new Date(),
      };

      this.cola.push(enCola);
    }
  }

  async procesarColaWebhooks(): Promise<void> {
    const ahora = new Date();
    const paraProcesar = this.cola.filter(item => item.proximaEjecucion <= ahora);

    for (const item of paraProcesar) {
      const config = this.configuraciones.get(item.webhookId);
      if (!config) continue;

      try {
        const payload = JSON.stringify(item.evento);
        const signature = this.firmarPayload(payload, config.secret);

        const response = await fetch(config.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Id': config.id,
          },
          body: payload,
        });

        if (response.ok) {
          const index = this.cola.indexOf(item);
          if (index > -1) this.cola.splice(index, 1);
        } else if (item.intento < this.intentosMaximos) {
          item.intento += 1;
          const idx = Math.min(item.intento - 2, this.tiemposReintento.length - 1);
          const tiempoEspera = this.tiemposReintento[idx] ?? 30000;
          item.proximaEjecucion = new Date(Date.now() + tiempoEspera);
        } else {
          const index = this.cola.indexOf(item);
          if (index > -1) this.cola.splice(index, 1);
        }
      } catch {
        if (item.intento < this.intentosMaximos) {
          item.intento += 1;
          const idx = Math.min(item.intento - 2, this.tiemposReintento.length - 1);
          const tiempoEspera = this.tiemposReintento[idx] ?? 30000;
          item.proximaEjecucion = new Date(Date.now() + tiempoEspera);
        } else {
          const index = this.cola.indexOf(item);
          if (index > -1) this.cola.splice(index, 1);
        }
      }
    }
  }

  private firmarPayload(payload: string, secret?: string): string {
    if (!secret) return '';

    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  listarWebhooks(): WebhookConfiguracion[] {
    return Array.from(this.configuraciones.values());
  }

  async probarWebhook(webhookId: string): Promise<{ ok: boolean; statusCode?: number; error?: string }> {
    const config = this.configuraciones.get(webhookId);
    if (!config) return { ok: false, error: 'Webhook no encontrado' };

    const eventoTest: EventoWebhook = {
      id: randomUUID(),
      tipo: 'webhook.test',
      timestamp: new Date(),
      datos: { mensaje: 'Esta es una prueba' },
    };

    try {
      const payload = JSON.stringify(eventoTest);
      const signature = this.firmarPayload(payload, config.secret);

      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Id': config.id,
        },
        body: payload,
      });

      return {
        ok: response.ok,
        statusCode: response.status,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  obtenerEstadoCola(): { pendientes: number; procesandose: number } {
    return {
      pendientes: this.cola.length,
      procesandose: 0,
    };
  }
}
