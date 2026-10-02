/**
 * Motor de Calendarios: Generación de calendarios HTML, exportación iCal,
 * recordatorios y sincronización con calendarios externos.
 */

import type { Reserva } from "./disponibilidad-motor.js";

export interface Evento {
  readonly id: string;
  readonly titulo: string;
  readonly inicio: Date;
  readonly fin: Date;
  readonly descripcion?: string;
}

export interface Recordatorio {
  readonly id: string;
  readonly reservaId: string;
  readonly tiempoAntes: number; // minutos
  readonly enviado: boolean;
  readonly fechaEnvio?: Date;
}

export class MotorCalendarios {
  private recordatorios = new Map<string, Recordatorio>();

  generarCalendarioHTML(
    reservas: readonly Reserva[],
    mes: number,
    año: number
  ): string {
    const fechaInicio = new Date(año, mes - 1, 1);
    const fechaFin = new Date(año, mes, 0);

    let html = `<div class="calendario">
      <h2>${this.getNombreMes(mes)} ${año}</h2>
      <table border="1" cellpadding="5">
      <tr>
        <th>Dom</th><th>Lun</th><th>Mar</th><th>Mié</th>
        <th>Jue</th><th>Vie</th><th>Sáb</th>
      </tr>`;

    const primerDia = fechaInicio.getDay();
    let celda = 0;

    // Celdas vacías al inicio
    html += "<tr>";
    for (let i = 0; i < primerDia; i++) {
      html += "<td></td>";
      celda++;
    }

    // Días del mes
    for (let dia = 1; dia <= fechaFin.getDate(); dia++) {
      if (celda === 7) {
        html += "</tr><tr>";
        celda = 0;
      }

      const fecha = new Date(año, mes - 1, dia);
      const reservasDelDia = reservas.filter(
        r =>
          r.fechaInicio.toDateString() === fecha.toDateString() &&
          r.estado === "confirmada"
      );

      let contenidoCelda = `<div class="dia">${dia}`;
      if (reservasDelDia.length > 0) {
        contenidoCelda += `<div class="reservas">`;
        for (const reserva of reservasDelDia) {
          contenidoCelda += `<span class="reserva">${reserva.titulo}</span>`;
        }
        contenidoCelda += `</div>`;
      }
      contenidoCelda += `</div>`;

      html += `<td>${contenidoCelda}</td>`;
      celda++;
    }

    // Celdas vacías al final
    while (celda < 7) {
      html += "<td></td>";
      celda++;
    }

    html += `</tr></table></div>`;
    return html;
  }

  exportarAlCalendarioCliente(reservas: readonly Reserva[]): string {
    let ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//ABS//Reservas//ES
CALSCALE:GREGORIAN
METHOD:PUBLISH
`;

    for (const reserva of reservas) {
      if (reserva.estado === "confirmada") {
        const inicioISO = this.fechaAICS(reserva.fechaInicio);
        const finISO = this.fechaAICS(reserva.fechaFin);

        ics += `BEGIN:VEVENT
UID:${reserva.id}@abs-sistema
DTSTART:${inicioISO}
DTEND:${finISO}
SUMMARY:${reserva.titulo}
DESCRIPTION:${reserva.descripcion || ""}
LOCATION:${reserva.contacto}
STATUS:CONFIRMED
END:VEVENT
`;
      }
    }

    ics += `END:VCALENDAR`;
    return ics;
  }

  private fechaAICS(fecha: Date): string {
    const año = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    const dia = String(fecha.getDate()).padStart(2, "0");
    const hora = String(fecha.getHours()).padStart(2, "0");
    const minuto = String(fecha.getMinutes()).padStart(2, "0");
    const segundo = String(fecha.getSeconds()).padStart(2, "0");

    return `${año}${mes}${dia}T${hora}${minuto}${segundo}Z`;
  }

  configurarRecordatorio(
    reservaId: string,
    minutosAntes: number
  ): Recordatorio {
    const id = `recordatorio-${Date.now()}`;

    const recordatorio: Recordatorio = {
      id,
      reservaId,
      tiempoAntes: minutosAntes,
      enviado: false,
    };

    this.recordatorios.set(id, recordatorio);
    return recordatorio;
  }

  obtenerEventosProximos(reservas: readonly Reserva[], diasAdelante: number = 7): Evento[] {
    const ahora = new Date();
    const limite = new Date(ahora.getTime() + diasAdelante * 24 * 60 * 60 * 1000);

    return (reservas
      .filter(
        r =>
          r.estado === "confirmada" &&
          r.fechaInicio >= ahora &&
          r.fechaInicio <= limite
      )
      .map(r => ({
        id: r.id,
        titulo: r.titulo,
        inicio: r.fechaInicio,
        fin: r.fechaFin,
        descripcion: r.descripcion,
      }))
      .sort((a, b) => a.inicio.getTime() - b.inicio.getTime())) as Evento[];
  }

  verificarRecordatoriosPendientes(reservas: readonly Reserva[]): Recordatorio[] {
    const ahora = new Date();
    const pendientes: Recordatorio[] = [];

    for (const recordatorio of this.recordatorios.values()) {
      if (!recordatorio.enviado) {
        const reserva = reservas.find(r => r.id === recordatorio.reservaId);
        if (reserva) {
          const tiempoRecordatorio = new Date(
            reserva.fechaInicio.getTime() - recordatorio.tiempoAntes * 60 * 1000
          );

          if (ahora >= tiempoRecordatorio && ahora < new Date(tiempoRecordatorio.getTime() + 60000)) {
            pendientes.push(recordatorio);
          }
        }
      }
    }

    return pendientes;
  }

  marcarRecordatorioEnviado(recordatorioId: string): void {
    const recordatorio = this.recordatorios.get(recordatorioId);
    if (recordatorio) {
      this.recordatorios.set(recordatorioId, {
        ...recordatorio,
        enviado: true,
        fechaEnvio: new Date(),
      });
    }
  }

  sincronizarConCalendarioExterno(
    tipo: "google" | "outlook" | "apple",
    token: string,
    eventos: readonly Evento[]
  ): { exito: boolean; sincronizados: number } {
    // Simulación de sincronización
    // En producción, usar APIs reales de Google Calendar, Outlook, etc.

    return {
      exito: true,
      sincronizados: eventos.length,
    };
  }

  private getNombreMes(mes: number): string {
    const meses = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];
    return meses[mes - 1] || "";
  }
}
