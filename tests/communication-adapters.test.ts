/**
 * Tests de los adaptadores de canales.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { AdaptadorEmail } from "../communication/adapters/email-adapter.js";
import { AdaptadorSMS } from "../communication/adapters/sms-adapter.js";
import { AdaptadorWhatsApp } from "../communication/adapters/whatsapp-adapter.js";
import { AdaptadorPush } from "../communication/adapters/push-adapter.js";
import { AdaptadorSlack } from "../communication/adapters/slack-adapter.js";
import { AdaptadorWebhook } from "../communication/adapters/webhook-adapter.js";
import { AdaptadorTelnyx } from "../communication/adapters/telnyx-adapter.js";
import type { NotificacionParaEnviar } from "../communication/types.js";

const notificacionEjemplo: NotificacionParaEnviar = {
  id: "notif_1",
  ruleId: "rule_1",
  evento: "expediente_cerrado",
  canal: "email",
  destinatario: "cliente",
  plantilla: "venta-confirmada",
  contacto: "cliente@example.com",
  datos: { monto: 100, referencia: "P001" },
  createdAt: new Date().toISOString(),
};

describe("Adaptadores de Canales", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
  });

  describe("AdaptadorEmail", () => {
    it("valida configuración faltante", () => {
      const adaptador = new AdaptadorEmail();
      adaptador["host"] = "";
      const resultado = adaptador.validar();
      expect(resultado.ok).toBe(false);
    });

    it("envía email en modo test", async () => {
      const adaptador = new AdaptadorEmail();
      const resultado = await adaptador.enviar(notificacionEjemplo);
      expect(resultado.ok).toBe(true);
      expect(resultado.detalle).toContain("test");
    });
  });

  describe("AdaptadorSMS", () => {
    it("valida configuración faltante", () => {
      const adaptador = new AdaptadorSMS();
      adaptador["accountSid"] = "";
      const resultado = adaptador.validar();
      expect(resultado.ok).toBe(false);
    });

    it("envía SMS en modo test", async () => {
      const adaptador = new AdaptadorSMS();
      const resultado = await adaptador.enviar({
        ...notificacionEjemplo,
        canal: "sms",
        contacto: "+34666555444",
      });
      expect(resultado.ok).toBe(true);
      expect(resultado.detalle).toContain("test");
    });
  });

  describe("AdaptadorWhatsApp", () => {
    it("valida configuración faltante", () => {
      const adaptador = new AdaptadorWhatsApp();
      adaptador["businessPhoneId"] = "";
      const resultado = adaptador.validar();
      expect(resultado.ok).toBe(false);
    });

    it("envía WhatsApp en modo test", async () => {
      const adaptador = new AdaptadorWhatsApp();
      const resultado = await adaptador.enviar({
        ...notificacionEjemplo,
        canal: "whatsapp",
      });
      expect(resultado.ok).toBe(true);
      expect(resultado.detalle).toContain("test");
    });
  });

  describe("AdaptadorPush", () => {
    it("valida configuración faltante", () => {
      const adaptador = new AdaptadorPush();
      adaptador["projectId"] = "";
      const resultado = adaptador.validar();
      expect(resultado.ok).toBe(false);
    });

    it("envía push en modo test", async () => {
      const adaptador = new AdaptadorPush();
      const resultado = await adaptador.enviar({
        ...notificacionEjemplo,
        canal: "push",
        contacto: "user_id_123",
      });
      expect(resultado.ok).toBe(true);
      expect(resultado.detalle).toContain("test");
    });
  });

  describe("AdaptadorSlack", () => {
    it("valida configuración faltante", () => {
      const adaptador = new AdaptadorSlack();
      adaptador["webhookUrl"] = "";
      const resultado = adaptador.validar();
      expect(resultado.ok).toBe(false);
    });

    it("envía mensaje Slack en modo test", async () => {
      const adaptador = new AdaptadorSlack();
      const resultado = await adaptador.enviar({
        ...notificacionEjemplo,
        canal: "slack",
      });
      expect(resultado.ok).toBe(true);
      expect(resultado.detalle).toContain("test");
    });
  });

  describe("AdaptadorWebhook", () => {
    it("rechaza URLs inválidas", async () => {
      const adaptador = new AdaptadorWebhook();
      const resultado = await adaptador.enviar({
        ...notificacionEjemplo,
        canal: "webhook",
        contacto: "url-invalida",
      });
      expect(resultado.ok).toBe(false);
    });

    it("valida webhook correctamente", () => {
      const adaptador = new AdaptadorWebhook();
      const resultado = adaptador.validar();
      expect(resultado.ok).toBe(true);
    });

    it("llama webhook en modo test", async () => {
      const adaptador = new AdaptadorWebhook();
      const resultado = await adaptador.enviar({
        ...notificacionEjemplo,
        canal: "webhook",
        contacto: "https://example.com/webhook",
      });
      expect(resultado.ok).toBe(true);
      expect(resultado.detalle).toContain("test");
    });
  });

  describe("AdaptadorTelnyx", () => {
    it("valida configuración faltante", () => {
      const adaptador = new AdaptadorTelnyx();
      adaptador["apiKey"] = "";
      const resultado = adaptador.validar();
      expect(resultado.ok).toBe(false);
    });

    it("devuelve placeholder para llamadas", async () => {
      const adaptador = new AdaptadorTelnyx();
      const resultado = await adaptador.enviar({
        ...notificacionEjemplo,
        canal: "llamada",
        contacto: "+34666555444",
      });
      expect(resultado.ok).toBe(true);
      expect(resultado.detalle).toContain("futura");
    });
  });
});
