/**
 * Motor de Nurturing de Leads
 * Secuencias de email automáticas, registro de aperturas y clics
 */

import { randomUUID } from "crypto";
import type {
  Email,
  MailingSecuencia,
  TipoSecuencia,
  AsignacionSecuencia,
  RegistroNurturing,
} from "../elements/lead-management.js";

export class MotorNurturing {
  private secuencias: Map<string, MailingSecuencia> = new Map();
  private asignaciones: Map<string, AsignacionSecuencia> = new Map();
  private registros: Map<string, RegistroNurturing> = new Map();

  // ========== SECUENCIAS ==========

  crearSecuencia(
    nombre: string,
    tipo: TipoSecuencia,
    descripción: string,
    emails: Email[],
    intervalosDías: number[]
  ): MailingSecuencia {
    const id = randomUUID();

    const secuencia: MailingSecuencia = {
      id,
      nombre,
      tipo,
      descripción,
      emails,
      intervalosDías,
      activa: true,
    };

    this.secuencias.set(id, secuencia);
    return secuencia;
  }

  obtenerSecuencia(secuenciaId: string): MailingSecuencia | undefined {
    return this.secuencias.get(secuenciaId);
  }

  listarSecuencias(): MailingSecuencia[] {
    return Array.from(this.secuencias.values());
  }

  desactivarSecuencia(secuenciaId: string): boolean {
    const secuencia = this.secuencias.get(secuenciaId);
    if (!secuencia) return false;

    (secuencia as any).activa = false;
    return true;
  }

  // ========== ASIGNACIONES ==========

  asignarSecuencia(leadId: string, secuenciaId: string): AsignacionSecuencia | null {
    const secuencia = this.secuencias.get(secuenciaId);
    if (!secuencia || !secuencia.activa) {
      return null;
    }

    const id = randomUUID();
    const asignación: AsignacionSecuencia = {
      id,
      leadId,
      secuenciaId,
      fechaInicio: new Date(),
      emailActualIndex: 0,
      completada: false,
    };

    this.asignaciones.set(id, asignación);
    return asignación;
  }

  obtenerAsignacion(asignacionId: string): AsignacionSecuencia | undefined {
    return this.asignaciones.get(asignacionId);
  }

  obtenerAsignacionesLead(leadId: string): AsignacionSecuencia[] {
    return Array.from(this.asignaciones.values()).filter(
      (a) => a.leadId === leadId
    );
  }

  completarAsignacion(asignacionId: string): boolean {
    const asignación = this.asignaciones.get(asignacionId);
    if (!asignación) return false;

    (asignación as any).completada = true;
    (asignación as any).fechaFin = new Date();
    return true;
  }

  // ========== EJECUCIÓN DE SECUENCIAS ==========

  ejecutarSecuencias(): { enviados: number; errores: number } {
    let enviados = 0;
    let errores = 0;

    for (const asignación of this.asignaciones.values()) {
      if (asignación.completada) continue;

      const secuencia = this.secuencias.get(asignación.secuenciaId);
      if (!secuencia || !secuencia.activa) continue;

      // Verificar si es hora de enviar el siguiente email
      const emailActual = secuencia.emails[asignación.emailActualIndex];
      if (!emailActual) {
        this.completarAsignacion(asignación.id);
        continue;
      }

      // Calcular intervalo
      const intervaloMs =
        (secuencia.intervalosDías[asignación.emailActualIndex] || 1) *
        24 *
        60 *
        60 *
        1000;
      const tiempoTranscurrido =
        new Date().getTime() - asignación.fechaInicio.getTime();

      if (tiempoTranscurrido >= intervaloMs) {
        // Registrar envío
        this.registrarEnvío(
          asignación.leadId,
          asignación.id,
          emailActual.id
        );
        enviados++;

        // Avanzar al siguiente email
        (asignación as any).emailActualIndex++;

        if (
          asignación.emailActualIndex >= secuencia.emails.length
        ) {
          this.completarAsignacion(asignación.id);
        }
      }
    }

    return { enviados, errores };
  }

  // ========== REGISTRO DE EVENTOS ==========

  private registrarEnvío(
    leadId: string,
    asignacionId: string,
    emailId: string
  ): void {
    const id = randomUUID();
    const registro: RegistroNurturing = {
      id,
      leadId,
      asignacionId,
      emailId,
      tipo: "enviado",
      fechaRegistro: new Date(),
    };

    this.registros.set(id, registro);
  }

  registrarApertura(leadId: string, emailId: string): boolean {
    const id = randomUUID();
    const registro: RegistroNurturing = {
      id,
      leadId,
      asignacionId: "", // Sin asignación específica
      emailId,
      tipo: "abierto",
      fechaRegistro: new Date(),
    };

    this.registros.set(id, registro);
    return true;
  }

  registrarClick(leadId: string, emailId: string, url: string): boolean {
    const id = randomUUID();
    const registro: RegistroNurturing = {
      id,
      leadId,
      asignacionId: "", // Sin asignación específica
      emailId,
      tipo: "click",
      fechaRegistro: new Date(),
      metadatos: { url },
    };

    this.registros.set(id, registro);
    return true;
  }

  registrarRebote(leadId: string, emailId: string): boolean {
    const id = randomUUID();
    const registro: RegistroNurturing = {
      id,
      leadId,
      asignacionId: "",
      emailId,
      tipo: "rebote",
      fechaRegistro: new Date(),
    };

    this.registros.set(id, registro);
    return true;
  }

  // ========== REPORTES ==========

  obtenerReporteNurturing(secuenciaId?: string): {
    enviados: number;
    abiertos: number;
    clicks: number;
    tasaApertura: number;
    tasaClick: number;
    rebotes: number;
  } {
    const registrosFiltered = secuenciaId
      ? Array.from(this.registros.values()).filter((r) => {
          const asignación = this.asignaciones.get(r.asignacionId);
          return asignación && asignación.secuenciaId === secuenciaId;
        })
      : Array.from(this.registros.values());

    const enviados = registrosFiltered.filter((r) => r.tipo === "enviado").length;
    const abiertos = registrosFiltered.filter((r) => r.tipo === "abierto").length;
    const clicks = registrosFiltered.filter((r) => r.tipo === "click").length;
    const rebotes = registrosFiltered.filter((r) => r.tipo === "rebote").length;

    return {
      enviados,
      abiertos,
      clicks,
      tasaApertura: enviados > 0 ? (abiertos / enviados) * 100 : 0,
      tasaClick: abiertos > 0 ? (clicks / abiertos) * 100 : 0,
      rebotes,
    };
  }

  obtenerRegistrosLead(leadId: string): RegistroNurturing[] {
    return Array.from(this.registros.values()).filter((r) => r.leadId === leadId);
  }

  obtenerEstadísticasLead(leadId: string): {
    emailesEnviados: number;
    emailesAbiertos: number;
    clicks: number;
    tasaApertura: number;
  } {
    const registros = this.obtenerRegistrosLead(leadId);
    const enviados = registros.filter((r) => r.tipo === "enviado").length;
    const abiertos = registros.filter((r) => r.tipo === "abierto").length;
    const clicks = registros.filter((r) => r.tipo === "click").length;

    return {
      emailesEnviados: enviados,
      emailesAbiertos: abiertos,
      clicks,
      tasaApertura: enviados > 0 ? (abiertos / enviados) * 100 : 0,
    };
  }
}
