import type { EventoEmail } from '../elements/email-marketing.js';
import { MotorTrackingEmail } from './email-tracking.js';

export interface WebhookAperturaPayload {
  readonly campaña_id: string;
  readonly contacto_id: string;
  readonly pixel: string;
}

export interface WebhookClickPayload {
  readonly campaña_id: string;
  readonly contacto_id: string;
  readonly url: string;
}

export interface WebhookBajaPayload {
  readonly email: string;
  readonly campaña_id?: string;
}

export class MotorWebhooksEmail {
  private tracking: MotorTrackingEmail;

  constructor(tracking: MotorTrackingEmail) {
    this.tracking = tracking;
  }

  webhookApertura(payload: WebhookAperturaPayload): EventoEmail {
    return this.tracking.registrarApertura(
      payload.campaña_id,
      payload.contacto_id,
      payload.pixel
    );
  }

  webhookClick(payload: WebhookClickPayload): EventoEmail {
    return this.tracking.registrarClick(
      payload.campaña_id,
      payload.contacto_id,
      payload.url
    );
  }

  webhookBaja(payload: WebhookBajaPayload): EventoEmail {
    const campaña_id = payload.campaña_id || "unknown";
    return this.tracking.registrarBaja(campaña_id, payload.email);
  }
}
