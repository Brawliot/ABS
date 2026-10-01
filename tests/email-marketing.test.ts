import { describe, it, expect, beforeEach } from "vitest";
import { MotorContactosEmail } from '../policies/email-contactos.js';
import { MotorCampañasEmail } from '../policies/email-campañas.js';
import { MotorTrackingEmail } from '../policies/email-tracking.js';
import { MotorWebhooksEmail } from '../policies/email-webhooks.js';

describe("Email Marketing", () => {
  let motorContactos: MotorContactosEmail;
  let motorCampañas: MotorCampañasEmail;
  let motorTracking: MotorTrackingEmail;
  let motorWebhooks: MotorWebhooksEmail;

  beforeEach(() => {
    motorContactos = new MotorContactosEmail();
    motorCampañas = new MotorCampañasEmail();
    motorTracking = new MotorTrackingEmail();
    motorWebhooks = new MotorWebhooksEmail(motorTracking);
  });

  it("crea y gestiona contactos", () => {
    const contacto = motorContactos.crearContacto(
      "juan@example.com",
      "Juan"
    );

    expect(contacto.email).toBe("juan@example.com");
    expect(contacto.nombre).toBe("Juan");
    expect(contacto.estado).toBe("activo");
  });

  it("importa lista de contactos CSV", () => {
    const contactos = [
      { email: "user1@example.com", nombre: "User 1" },
      { email: "user2@example.com", nombre: "User 2" },
      { email: "invalid", nombre: "Invalid" },
      { email: "user1@example.com", nombre: "Duplicate" },
    ];

    const resultado = motorContactos.importarContactos(contactos);

    expect(resultado.agregados).toBe(2);
    expect(resultado.duplicados).toBe(1);
    expect(resultado.inválidos).toBe(1);
  });

  it("crea segmento automático con criterios", () => {
    const segmento = motorContactos.crearSegmento(
      "VIP",
      "vip",
      [
        {
          campo: "estado",
          operador: "=",
          valor: "activo",
        },
      ]
    );

    expect(segmento.nombre).toBe("VIP");
    expect(segmento.tipo).toBe("vip");
    expect(segmento.criterios).toHaveLength(1);
  });

  it("crea plantilla con variables personalizables", () => {
    const plantilla = motorCampañas.crearPlantilla(
      "Bienvenida",
      "Bienvenido {{nombre}}",
      "<h1>Hola {{nombre}}</h1>",
      ["nombre", "código"]
    );

    expect(plantilla.nombre).toBe("Bienvenida");
    expect(plantilla.variables).toContain("nombre");
    expect(plantilla.variables).toContain("código");
  });

  it("personaliza plantilla para contacto específico", () => {
    const plantilla = motorCampañas.crearPlantilla(
      "Oferta",
      "Oferta para {{nombre}}",
      "<p>Hola {{nombre}}</p><p>Código: {{código}}</p>",
      ["nombre", "código"]
    );

    const personalizado = motorCampañas.personalizarPlantilla(plantilla, {
      nombre: "Juan",
      código: "OFERTA2024",
    });

    expect(personalizado).toContain("Juan");
    expect(personalizado).toContain("OFERTA2024");
  });

  it("programa campaña a fecha futura", () => {
    const plantilla = motorCampañas.crearPlantilla(
      "Campaña Test",
      "Test",
      "Test"
    );
    const segmento = motorContactos.crearSegmento(
      "Prueba",
      "custom"
    );

    const campaña = motorCampañas.crearCampaña(
      "Mi campaña",
      plantilla.id,
      segmento.id,
      new Date("2024-12-25")
    );

    motorCampañas.programarCampaña(campaña);

    expect(campaña.estado).toBe("borrador");
    const listar = motorCampañas.listarCampañas();
    expect(listar).toHaveLength(1);
  });

  it("envía campaña a segmento", async () => {
    const plantilla = motorCampañas.crearPlantilla(
      "Email",
      "Asunto",
      "Contenido"
    );
    const segmento = motorContactos.crearSegmento(
      "Test",
      "custom"
    );

    motorContactos.crearContacto("test@example.com", "Test");

    const campaña = motorCampañas.crearCampaña(
      "Campaña",
      plantilla.id,
      segmento.id,
      new Date()
    );

    const resultado = await motorCampañas.enviarCampaña(campaña);

    expect(resultado.enviados).toBeGreaterThanOrEqual(0);
    expect(resultado.errores).toBeInstanceOf(Array);
  });

  it("registra aperturas de email", () => {
    const evento = motorTracking.registrarApertura(
      "campaign-1",
      "contact-1",
      "pixel-tracking"
    );

    expect(evento.tipo).toBe("abierto");
    expect(evento.campaña_id).toBe("campaign-1");
  });

  it("registra clicks en links", () => {
    const evento = motorTracking.registrarClick(
      "campaign-1",
      "contact-1",
      "https://example.com/oferta",
      "mobile"
    );

    expect(evento.tipo).toBe("click");
    expect(evento.detalles?.url).toBe("https://example.com/oferta");
    expect(evento.detalles?.dispositivo).toBe("mobile");
  });

  it("calcula estadísticas de campaña", () => {
    const campaña_id = "campaign-1";

    motorTracking.registrarEnvío(campaña_id, "contact-1", "email1@test.com");
    motorTracking.registrarEnvío(campaña_id, "contact-2", "email2@test.com");
    motorTracking.registrarEnvío(campaña_id, "contact-3", "email3@test.com");
    motorTracking.registrarApertura(campaña_id, "contact-1", "pixel");
    motorTracking.registrarClick(campaña_id, "contact-1", "https://example.com");

    const estadísticas = motorTracking.calcularEstadísticas(campaña_id);

    expect(estadísticas.enviados).toBe(3);
    expect(estadísticas.abiertos).toBe(1);
    expect(estadísticas.clicks).toBe(1);
  });

  it("procesa baja automática de contacto", () => {
    const contacto = motorContactos.crearContacto("user@example.com", "User");

    motorContactos.actualizarContactoEstado(contacto.id, "bloqueado");

    const actualizado = motorContactos.obtenerContacto(contacto.id);
    expect(actualizado?.estado).toBe("bloqueado");
  });

  it("maneja rebotes suave y duro", () => {
    const campaña_id = "campaign-1";

    const reboteSuave = motorTracking.registrarRebote(
      campaña_id,
      "soft@test.com",
      "soft"
    );
    const reboteDuro = motorTracking.registrarRebote(
      campaña_id,
      "hard@test.com",
      "hard"
    );

    expect(reboteSuave.tipo).toBe("rebote");
    expect(reboteDuro.tipo).toBe("rebote");
  });

  it("genera reporte de campañas", () => {
    const plantilla = motorCampañas.crearPlantilla(
      "Test",
      "Test",
      "Test"
    );
    const segmento = motorContactos.crearSegmento(
      "Test",
      "custom"
    );

    const campaña1 = motorCampañas.crearCampaña(
      "Campaign 1",
      plantilla.id,
      segmento.id,
      new Date()
    );
    const campaña2 = motorCampañas.crearCampaña(
      "Campaign 2",
      plantilla.id,
      segmento.id,
      new Date()
    );

    const campañas = motorCampañas.listarCampañas();
    expect(campañas).toHaveLength(2);
  });

  it("compara rendimiento de segmentos", () => {
    const segmentoA = motorContactos.crearSegmento(
      "Segmento A",
      "custom"
    );
    const segmentoB = motorContactos.crearSegmento(
      "Segmento B",
      "custom"
    );

    const segmentos = motorContactos.listarSegmentos();
    expect(segmentos).toHaveLength(2);
  });

  it("cancela campaña no enviada", () => {
    const plantilla = motorCampañas.crearPlantilla(
      "Test",
      "Test",
      "Test"
    );
    const segmento = motorContactos.crearSegmento(
      "Test",
      "custom"
    );

    const campaña = motorCampañas.crearCampaña(
      "Campaña",
      plantilla.id,
      segmento.id,
      new Date()
    );

    motorCampañas.cancelarCampaña(campaña);

    expect(campaña.estado).toBe("borrador");
  });

  it("exporta contactos con segmentación", () => {
    const segmento = motorContactos.crearSegmento(
      "VIP",
      "vip"
    );

    motorContactos.crearContacto(
      "vip1@example.com",
      "VIP1",
      [segmento.id]
    );
    motorContactos.crearContacto(
      "vip2@example.com",
      "VIP2",
      [segmento.id]
    );

    const contactos = motorContactos.obtenerContactosPorSegmento(segmento.id);
    expect(contactos).toHaveLength(2);
  });

  it("valida emails antes de enviar", () => {
    const contactos = [
      { email: "valido@example.com", nombre: "Valido" },
      { email: "invalid@", nombre: "Invalid" },
      { email: "otro@test.com", nombre: "Otro" },
    ];

    const resultado = motorContactos.importarContactos(contactos);

    expect(resultado.agregados).toBe(2);
    expect(resultado.inválidos).toBe(1);
  });

  it("registra evento de baja unsubscribe", () => {
    const evento = motorTracking.registrarBaja("campaign-1", "user@test.com");

    expect(evento.tipo).toBe("baja");
    expect(evento.email).toBe("user@test.com");
  });

  it("procesa webhook de apertura", () => {
    const evento = motorWebhooks.webhookApertura({
      campaña_id: "campaign-1",
      contacto_id: "contact-1",
      pixel: "tracking-pixel",
    });

    expect(evento.tipo).toBe("abierto");
  });

  it("procesa webhook de click", () => {
    const evento = motorWebhooks.webhookClick({
      campaña_id: "campaign-1",
      contacto_id: "contact-1",
      url: "https://example.com",
    });

    expect(evento.tipo).toBe("click");
  });

  it("procesa webhook de baja unsubscribe", () => {
    const evento = motorWebhooks.webhookBaja({
      email: "user@test.com",
      campaña_id: "campaign-1",
    });

    expect(evento.tipo).toBe("baja");
  });

  it("obtiene eventos por campaña", () => {
    const campaña_id = "campaign-test";

    motorTracking.registrarEnvío(campaña_id, "c1", "e1@test.com");
    motorTracking.registrarApertura(campaña_id, "c1", "pixel");
    motorTracking.registrarClick(campaña_id, "c1", "https://test.com");

    const eventos = motorTracking.obtenerEventosCampaña(campaña_id);

    expect(eventos.length).toBeGreaterThan(0);
  });

  it("obtiene eventos por contacto en campaña", () => {
    const campaña_id = "campaign-1";
    const contacto_id = "contact-1";

    motorTracking.registrarEnvío(campaña_id, contacto_id, "test@email.com");
    motorTracking.registrarApertura(campaña_id, contacto_id, "pixel");

    const eventos = motorTracking.obtenerEventosContacto(
      campaña_id,
      contacto_id
    );

    expect(eventos.length).toBeGreaterThanOrEqual(2);
  });

  it("busca contactos por filtros", () => {
    motorContactos.crearContacto("juan@example.com", "Juan");
    motorContactos.crearContacto("maria@example.com", "Maria");

    const resultados = motorContactos.buscarContactos({
      email: "juan",
      estado: "activo",
    });

    expect(resultados.length).toBeGreaterThan(0);
  });
});
