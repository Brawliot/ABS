/**
 * Motor de Soporte: Gestión de tickets con SLA automático, categorización,
 * asignación inteligente de agentes y flujo de resolución.
 */

export type TipoTicket = "técnico" | "billing" | "bug" | "feature" | "otro";
export type NivelPrioridad = "baja" | "media" | "alta" | "crítica";
export type EstadoTicket = "abierto" | "en_progreso" | "en_espera" | "resuelto" | "reabierto" | "escalado" | "cerrado";
export type CanalContacto = "email" | "chat" | "telefono" | "presencial";

export interface Ticket {
  readonly id: string;
  readonly numero: number; // Correlativo visible al cliente
  readonly clienteId: string;
  readonly titulo: string;
  readonly descripcion: string;
  readonly tipo: TipoTicket;
  readonly prioridad: NivelPrioridad;
  readonly estado: EstadoTicket;
  readonly agenteAsignadoId?: string;
  readonly canalContacto: CanalContacto;
  readonly fechaCreacion: Date;
  readonly fechaVencimiento: Date; // SLA deadline
  readonly fechaResolución?: Date;
  readonly comentarios: readonly ComentarioTicket[];
  readonly tags: readonly string[];
}

export interface ComentarioTicket {
  readonly id: string;
  readonly ticketId: string;
  readonly autorId: string;
  readonly contenido: string;
  readonly esInterno: boolean;
  readonly fechaCreacion: Date;
}

export interface Escalada {
  readonly id: string;
  readonly ticketId: string;
  readonly razon: string;
  readonly nivelAnterior: string | null;
  readonly nivelNuevo: string;
  readonly fechaEscalada: Date;
}

export interface AgenteDisponibilidad {
  readonly agenteId: string;
  readonly nombre: string;
  readonly especialidades: readonly string[];
  readonly ticketsActivos: number;
  readonly disponible: boolean;
}

export class MotorSoporteTickets {
  private siguienteNumeroTicket = 1000;

  crearTicket(
    clienteId: string,
    titulo: string,
    descripcion: string,
    canalContacto: CanalContacto,
    tags?: string[]
  ): Ticket {
    const id = `ticket-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const ahora = new Date();
    const tipo = this.categorizarAutomáticamente(descripcion);
    const prioridad = this.asignarPrioridad(tipo, descripcion);
    const diasSLA = this.obtenerDiasSLA(prioridad);
    const fechaVencimiento = new Date(ahora);
    fechaVencimiento.setDate(fechaVencimiento.getDate() + diasSLA);

    return {
      id,
      numero: this.siguienteNumeroTicket++,
      clienteId,
      titulo,
      descripcion,
      tipo,
      prioridad,
      estado: "abierto",
      canalContacto,
      fechaCreacion: ahora,
      fechaVencimiento,
      comentarios: [],
      tags: tags || [],
    };
  }

  categorizarAutomáticamente(descripcion: string): TipoTicket {
    const texto = descripcion.toLowerCase();

    if (texto.includes("error") || texto.includes("no funciona") || texto.includes("bug")) {
      return "bug";
    }
    if (texto.includes("factura") || texto.includes("pago") || texto.includes("cobro")) {
      return "billing";
    }
    if (texto.includes("solicito") || texto.includes("necesito") || texto.includes("quiero")) {
      return "feature";
    }
    if (texto.includes("problema") || texto.includes("help") || texto.includes("ayuda")) {
      return "técnico";
    }
    return "otro";
  }

  asignarPrioridad(tipo: TipoTicket, descripcion: string): NivelPrioridad {
    const texto = descripcion.toLowerCase();

    if (texto.includes("urgente") || texto.includes("crítico") ||
        texto.includes("no puedo trabajar") || texto.includes("datos perdidos")) {
      return "crítica";
    }

    if (tipo === "bug") return "alta";
    if (tipo === "billing") return "media";
    if (texto.includes("importante")) return "alta";

    return "baja";
  }

  private obtenerDiasSLA(prioridad: NivelPrioridad): number {
    const slas: Record<NivelPrioridad, number> = {
      crítica: 0.5, // 12 horas
      alta: 1,
      media: 3,
      baja: 7,
    };
    return slas[prioridad];
  }

  asignarPrioridad_(prioridad: NivelPrioridad): NivelPrioridad {
    // Método para cambiar prioridad manualmente
    return prioridad;
  }

  asignarAgenteAutomáticamente(
    ticket: Ticket,
    agentesDisponibles: readonly AgenteDisponibilidad[]
  ): string | undefined {
    // Filtrar agentes disponibles
    const disponibles = agentesDisponibles.filter(a => a.disponible);
    if (disponibles.length === 0) return undefined;

    // Preferir agentes con especialidad en el tipo de ticket
    const conEspecialidad = disponibles.filter(a =>
      a.especialidades.includes(ticket.tipo)
    );

    if (conEspecialidad.length > 0) {
      // Asignar al menos ocupado
      return conEspecialidad.reduce((a, b) =>
        a.ticketsActivos < b.ticketsActivos ? a : b
      ).agenteId;
    }

    // Asignar al menos ocupado sin especialidad
    return disponibles.reduce((a, b) =>
      a.ticketsActivos < b.ticketsActivos ? a : b
    ).agenteId;
  }

  actualizarEstado(ticket: Ticket, nuevoEstado: EstadoTicket): Ticket {
    return {
      ...ticket,
      estado: nuevoEstado,
    };
  }

  resolverTicket(ticket: Ticket): Ticket {
    return {
      ...ticket,
      estado: "resuelto",
      fechaResolución: new Date(),
    };
  }

  escalado(ticket: Ticket, razonEscalada: string, nivelNuevo: string): {
    ticket: Ticket;
    escalada: Escalada;
  } {
    const escalada: Escalada = {
      id: `escalada-${Date.now()}`,
      ticketId: ticket.id,
      razon: razonEscalada,
      nivelAnterior: ticket.agenteAsignadoId || null,
      nivelNuevo,
      fechaEscalada: new Date(),
    };

    return {
      ticket: {
        ...ticket,
        estado: "escalado",
      },
      escalada,
    };
  }

  reabrir(ticket: Ticket, razon: string): Ticket {
    const comentario: ComentarioTicket = {
      id: `comment-${Date.now()}`,
      ticketId: ticket.id,
      autorId: "sistema",
      contenido: `Ticket reabierto: ${razon}`,
      esInterno: false,
      fechaCreacion: new Date(),
    };

    return {
      ...ticket,
      estado: "reabierto",
      comentarios: [...ticket.comentarios, comentario],
    };
  }

  verificarVencimiento(ticket: Ticket): boolean {
    const ahora = new Date();
    return ahora >= ticket.fechaVencimiento;
  }

  obtenerHorasRestantes(ticket: Ticket): number {
    const ahora = new Date();
    const msRestantes = ticket.fechaVencimiento.getTime() - ahora.getTime();
    return Math.max(0, Math.floor(msRestantes / (1000 * 60 * 60)));
  }
}
