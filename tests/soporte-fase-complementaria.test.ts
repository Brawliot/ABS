/**
 * Tests para módulo de Soporte: Tickets, categorización, SLA, CSAT y base de conocimiento.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { MotorSoporteTickets, type Ticket } from "../policies/soporte-tickets.js";
import { MotorBaseConocimiento } from "../policies/soporte-base-conocimiento.js";
import { MotorSLAMetricas } from "../policies/soporte-sla-metricas.js";
import { MotorCSAT } from "../policies/soporte-csat.js";
import { SqliteSoporteStore } from "../adapters/sqlite-soporte-store.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

describe("Módulo de Soporte - Fase Complementaria", () => {
  describe("MotorSoporteTickets", () => {
    it("crea ticket con categorización automática", () => {
      const motor = new MotorSoporteTickets();

      const ticket = motor.crearTicket(
        "cliente-001",
        "Error al procesar pago",
        "Recibo error 500 cuando intento procesar un pago",
        "chat"
      );

      expect(ticket.id).toBeTruthy();
      expect(ticket.numero).toBeGreaterThanOrEqual(1000);
      expect(ticket.tipo).toBe("bug");
      expect(ticket.estado).toBe("abierto");
      expect(ticket.clienteId).toBe("cliente-001");
    });

    it("categoriza automáticamente como billing", () => {
      const motor = new MotorSoporteTickets();

      const ticket = motor.crearTicket(
        "cliente-001",
        "Problema con facturación",
        "No me aparece la factura de agosto",
        "email"
      );

      expect(ticket.tipo).toBe("billing");
    });

    it("asigna prioridad crítica para datos perdidos", () => {
      const motor = new MotorSoporteTickets();

      const ticket = motor.crearTicket(
        "cliente-001",
        "Urgente: datos perdidos",
        "Todos mis datos han desaparecido, esto es crítico",
        "telefono"
      );

      expect(ticket.prioridad).toBe("crítica");
    });

    it("asigna agente automáticamente por disponibilidad", () => {
      const motor = new MotorSoporteTickets();
      const ticket = motor.crearTicket(
        "cliente-001",
        "Necesito ayuda",
        "No entiendo cómo usar la funcionalidad",
        "chat"
      );

      const agentes = [
        {
          agenteId: "agente-1",
          nombre: "Pedro",
          especialidades: ["técnico"],
          ticketsActivos: 5,
          disponible: true,
        },
        {
          agenteId: "agente-2",
          nombre: "María",
          especialidades: ["billing"],
          ticketsActivos: 2,
          disponible: true,
        },
      ];

      const agenteAsignado = motor.asignarAgenteAutomáticamente(ticket, agentes);
      expect(agenteAsignado).toBe("agente-2"); // Menos ocupada
    });

    it("actualiza estado de ticket", () => {
      const motor = new MotorSoporteTickets();
      let ticket = motor.crearTicket(
        "cliente-001",
        "Test",
        "Descripción",
        "email"
      );

      ticket = motor.actualizarEstado(ticket, "en_progreso");
      expect(ticket.estado).toBe("en_progreso");

      ticket = motor.resolverTicket(ticket);
      expect(ticket.estado).toBe("resuelto");
      expect(ticket.fechaResolución).toBeDefined();
    });

    it("escalada de ticket", () => {
      const motor = new MotorSoporteTickets();
      const ticket = motor.crearTicket(
        "cliente-001",
        "Problema complejo",
        "No se puede resolver en primer nivel",
        "email"
      );

      const { ticket: ticketEscalado, escalada } = motor.escalado(
        ticket,
        "No se pudo resolver en primer nivel",
        "nivel-2"
      );

      expect(ticketEscalado.estado).toBe("escalado");
      expect(escalada.nivelNuevo).toBe("nivel-2");
      expect(escalada.razon).toContain("No se pudo resolver");
    });

    it("reabre ticket si cliente no está satisfecho", () => {
      const motor = new MotorSoporteTickets();
      let ticket = motor.crearTicket(
        "cliente-001",
        "Test",
        "Descripción",
        "email"
      );

      ticket = motor.resolverTicket(ticket);
      ticket = motor.reabrir(ticket, "Cliente dice que el problema persiste");

      expect(ticket.estado).toBe("reabierto");
      expect(ticket.comentarios.length).toBe(1);
    });

    it("verifica vencimiento de SLA", () => {
      const motor = new MotorSoporteTickets();
      const ticket = motor.crearTicket(
        "cliente-001",
        "Test",
        "Descripción",
        "email"
      );

      const vencido = motor.verificarVencimiento(ticket);
      expect(vencido).toBe(false); // Recién creado no está vencido

      const horasRestantes = motor.obtenerHorasRestantes(ticket);
      expect(horasRestantes).toBeGreaterThan(0);
    });
  });

  describe("MotorBaseConocimiento", () => {
    it("crea artículos de conocimiento", () => {
      const motor = new MotorBaseConocimiento();

      const articulo = motor.crearArticulo(
        "¿Cómo cambiar contraseña?",
        "Para cambiar tu contraseña, ve a Configuración > Seguridad...",
        "seguridad",
        ["contraseña", "login"]
      );

      expect(articulo.id).toBeTruthy();
      expect(articulo.titulo).toBe("¿Cómo cambiar contraseña?");
      expect(articulo.utilidad).toBe(50);
    });

    it("busca soluciones por similitud", () => {
      const motor = new MotorBaseConocimiento();

      motor.crearArticulo(
        "¿Cómo cambiar contraseña?",
        "Para cambiar tu contraseña, ve a Configuración > Seguridad...",
        "seguridad",
        ["contraseña"]
      );

      motor.crearArticulo(
        "Recuperar acceso",
        "Si olvidaste tu contraseña, haz clic en Olvidé contraseña...",
        "seguridad",
        ["contraseña", "reset"]
      );

      const resultados = motor.buscarSolución("cómo cambiar mi contraseña");
      expect(resultados.length).toBeGreaterThan(0);
      expect(resultados[0].similitud).toBeGreaterThan(30);
    });

    it("marca artículos como útiles", () => {
      const motor = new MotorBaseConocimiento();
      const articulo = motor.crearArticulo(
        "FAQ",
        "Contenido",
        "general"
      );

      motor.marcarÚtil(articulo.id, true);
      motor.marcarÚtil(articulo.id, true);

      const masUtiles = motor.obtenerArticulosMásÚtiles(1);
      expect(masUtiles[0]?.utilidad).toBeGreaterThan(50);
    });

    it("obtiene artículos más útiles ordenados", () => {
      const motor = new MotorBaseConocimiento();

      const a1 = motor.crearArticulo("Art 1", "Contenido", "general");
      const a2 = motor.crearArticulo("Art 2", "Contenido", "general");

      motor.marcarÚtil(a2.id, true);
      motor.marcarÚtil(a2.id, true);
      motor.marcarÚtil(a2.id, true);

      const masUtiles = motor.obtenerArticulosMásÚtiles(10);
      expect(masUtiles[0]?.id).toBe(a2.id);
    });

    it("incrementa vistas al acceder", () => {
      const motor = new MotorBaseConocimiento();
      const articulo = motor.crearArticulo("FAQ", "Contenido", "general");

      motor.incrementarVistas(articulo.id);
      motor.incrementarVistas(articulo.id);

      const actualizado = motor.obtenerArticulo(articulo.id);
      expect(actualizado?.vistas).toBe(2);
    });
  });

  describe("MotorSLAMetricas", () => {
    it("verifica cumplimiento de SLA", () => {
      const motor = new MotorSLAMetricas();
      const motorTickets = new MotorSoporteTickets();

      const ticket = motorTickets.crearTicket(
        "cliente-001",
        "Urgent issue",
        "Esto es muy urgente",
        "email"
      );

      const cumple = motor.verificarCumplimientoSLA(ticket);
      expect(cumple).toBe(true); // Recién creado
    });

    it("calcula métricas del dashboard", () => {
      const motor = new MotorSLAMetricas();
      const motorTickets = new MotorSoporteTickets();

      const ticket1 = motorTickets.crearTicket("cliente-001", "T1", "Desc", "email");
      const ticket2 = motorTickets.crearTicket("cliente-002", "T2", "Desc", "email");
      const resuelto = motorTickets.resolverTicket(ticket2);

      const metricas = motor.obtenerMetricas([ticket1, resuelto]);

      expect(metricas.totalTickets).toBe(2);
      expect(metricas.ticketsAbiertos).toBe(1);
      expect(metricas.ticketsResueltos).toBe(1);
      expect(metricas.cumplimientoSLAGlobal).toBeGreaterThanOrEqual(0);
    });

    it("calcula eficiencia de agente", () => {
      const motor = new MotorSLAMetricas();
      const motorTickets = new MotorSoporteTickets();

      const ticket = motorTickets.crearTicket("cliente-001", "T1", "Desc", "email");
      const ticketAsignado = {
        ...ticket,
        agenteAsignadoId: "agente-1",
      } as Ticket;

      const metricas = motor.obtenerEficienciaAgente("agente-1", [ticketAsignado]);

      expect(metricas.agenteId).toBe("agente-1");
      expect(metricas.ticketsResueltos).toBe(0);
      expect(metricas.cumplimientoSLA).toBeGreaterThanOrEqual(0);
    });
  });

  describe("MotorCSAT", () => {
    it("solicita encuesta después de resolver ticket", () => {
      const motor = new MotorCSAT();

      const encuesta = motor.solicitarEncuesta("ticket-001", "cliente-001");

      expect(encuesta.id).toBeTruthy();
      expect(encuesta.estado).toBe("pendiente");
      expect(encuesta.ticketId).toBe("ticket-001");
    });

    it("registra respuesta CSAT", () => {
      const motor = new MotorCSAT();
      const encuesta = motor.solicitarEncuesta("ticket-001", "cliente-001");

      const respuesta = motor.registrarCSAT(encuesta.id, 5, "Excelente servicio");

      expect(respuesta).toBeDefined();
      expect(respuesta!.puntuacion).toBe(5);
      expect(respuesta!.comentario).toBe("Excelente servicio");
    });

    it("calcula tendencia de satisfacción", () => {
      const motor = new MotorCSAT();

      const e1 = motor.solicitarEncuesta("ticket-001", "cliente-001");
      const r1 = motor.registrarCSAT(e1.id, 5, "Muy bueno");

      if (r1) {
        const e2 = motor.solicitarEncuesta("ticket-002", "cliente-002");
        motor.registrarCSAT(e2.id, 4, "Bueno");

        const e3 = motor.solicitarEncuesta("ticket-003", "cliente-003");
        motor.registrarCSAT(e3.id, 2, "Malo");
      }

      const tendencia = motor.obtenerTendencia();

      expect(tendencia.totalEncuestas).toBeGreaterThanOrEqual(1);
      expect(tendencia.puntuacionPromedio).toBeGreaterThanOrEqual(0);
      expect(tendencia.porcentajeSatisfacción).toBeGreaterThanOrEqual(0);
    });

    it("alerta si satisfacción baja", () => {
      const motor = new MotorCSAT();

      const e1 = motor.solicitarEncuesta("ticket-001", "cliente-001");
      const e2 = motor.solicitarEncuesta("ticket-002", "cliente-002");

      motor.registrarCSAT(e1.id, 2, "Muy malo");
      motor.registrarCSAT(e2.id, 2, "Muy malo");

      const alerta = motor.alertarSiBajaSatisfacción();
      expect(alerta).toBe(true);
    });

    it("obtiene comentarios negativos", () => {
      const motor = new MotorCSAT();

      const e1 = motor.solicitarEncuesta("ticket-001", "cliente-001");
      motor.registrarCSAT(e1.id, 1, "Terrible");

      const e2 = motor.solicitarEncuesta("ticket-002", "cliente-002");
      motor.registrarCSAT(e2.id, 5, "Excelente");

      const negativos = motor.obtenerComentariosNegativoS();

      // Verify method runs without error
      expect(Array.isArray(negativos)).toBe(true);
      expect(negativos.every(n => n.puntuacion <= 2)).toBe(true);
    });
  });

  describe("SqliteSoporteStore", () => {
    it("almacena y recupera tickets", () => {
      const dir = mkdtempSync(join(tmpdir(), "abs-soporte-"));
      dirs.push(dir);
      const store = new SqliteSoporteStore(join(dir, "db.sqlite"));

      const ticketId = store.crearTicket(
        "cliente-001",
        "Test Ticket",
        "Descripción del ticket",
        "bug",
        "alta",
        "abierto",
        "email",
        new Date()
      );

      const ticket = store.obtenerTicket(ticketId);
      expect(ticket).toBeDefined();
      expect(ticket!.titulo).toBe("Test Ticket");
      expect(ticket!.numero).toBeGreaterThan(0);

      store.close();
    });

    it("registra escaladas (append-only)", () => {
      const dir = mkdtempSync(join(tmpdir(), "abs-soporte-"));
      dirs.push(dir);
      const store = new SqliteSoporteStore(join(dir, "db.sqlite"));

      const ticketId = store.crearTicket(
        "cliente-001",
        "Test",
        "Desc",
        "bug",
        "alta",
        "abierto",
        "email",
        new Date()
      );

      store.registrarEscalada(ticketId, "No resolvible en primer nivel", undefined, "nivel-2");
      store.registrarEscalada(ticketId, "Requiere especialista", "nivel-2", "nivel-3");

      const escaladas = store.obtenerEscaladas(ticketId);
      expect(escaladas.length).toBe(2);
      expect(escaladas[0]!.nivelNuevo).toBe("nivel-2");
      expect(escaladas[1]!.nivelAnterior).toBe("nivel-2");

      store.close();
    });

    it("almacena encuestas CSAT", () => {
      const dir = mkdtempSync(join(tmpdir(), "abs-soporte-"));
      dirs.push(dir);
      const store = new SqliteSoporteStore(join(dir, "db.sqlite"));

      const ticketId = store.crearTicket(
        "cliente-001",
        "Test",
        "Desc",
        "bug",
        "alta",
        "resuelto",
        "email",
        new Date()
      );

      const encuestaId = store.crearEncuestaCSAT(ticketId, "cliente-001");
      store.registrarRespuestaCSAT(encuestaId, ticketId, 5, "Excelente");

      const respuestas = store.obtenerRespuestasCSAT(ticketId);
      expect(respuestas.length).toBe(1);
      expect(respuestas[0]!.puntuacion).toBe(5);

      store.close();
    });

    it("gestiona comentarios de tickets", () => {
      const dir = mkdtempSync(join(tmpdir(), "abs-soporte-"));
      dirs.push(dir);
      const store = new SqliteSoporteStore(join(dir, "db.sqlite"));

      const ticketId = store.crearTicket(
        "cliente-001",
        "Test",
        "Desc",
        "bug",
        "alta",
        "abierto",
        "email",
        new Date()
      );

      store.agregarComentario(ticketId, "agente-1", "Estoy investigando", false);
      store.agregarComentario(ticketId, "agente-1", "Problema identificado", true);

      const comentarios = store.obtenerComentarios(ticketId);
      expect(comentarios.length).toBe(2);
      expect(comentarios[1]!.esInterno).toBe(true);

      store.close();
    });
  });
});
