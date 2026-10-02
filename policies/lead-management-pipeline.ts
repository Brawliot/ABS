/**
 * Motor de Pipeline de Leads
 * Análisis de conversión, reportes de ROI
 */

import type { Lead } from "../elements/lead-management.js";

export interface EstadoPipeline {
  readonly nuevo: number;
  readonly contactado: number;
  readonly prospecto: number;
  readonly cliente: number;
  readonly perdido: number;
}

export interface ReporteLead {
  readonly leadId: string;
  readonly email: string;
  readonly nombre: string;
  readonly estado: string;
  readonly puntuación: number;
  readonly temperatura: string;
  readonly fechaCaptura: Date;
  readonly fechaÚltimoContacto: Date | undefined;
  readonly emailsEnviados: number;
  readonly emailsAbiertos: number;
  readonly clicks: number;
  readonly probabilidadConversión: number;
}

export interface ReporteLeadManagement {
  readonly período: string;
  readonly leadsCapturados: number;
  readonly leadsConvertidos: number;
  readonly tasaConversión: number;
  readonly tasaRetención: number;
  readonly leadsTotales: number;
  readonly estadoPipeline: EstadoPipeline;
  readonly leadsCualificados: number;
  readonly leadsPerdidos: number;
  readonly emailsEnviados: number;
  readonly tasaApertura: number;
  readonly tasaClick: number;
  readonly costoAdquisición: number;
  readonly valordaVidaCliente: number;
  readonly roi: number;
}

export class MotorPipelineLeads {
  obtenerPipeline(leads: Lead[]): EstadoPipeline {
    const pipeline = {
      nuevo: 0,
      contactado: 0,
      prospecto: 0,
      cliente: 0,
      perdido: 0,
    };

    for (const lead of leads) {
      switch (lead.estado) {
        case "nuevo":
          pipeline.nuevo++;
          break;
        case "contactado":
          pipeline.contactado++;
          break;
        case "prospecto":
          pipeline.prospecto++;
          break;
        case "cliente":
          pipeline.cliente++;
          break;
        case "perdido":
          pipeline.perdido++;
          break;
      }
    }

    return pipeline;
  }

  calcularTasaConversión(pipeline: EstadoPipeline): {
    nuevo_contactado: number;
    contactado_prospecto: number;
    prospecto_cliente: number;
    total: number;
  } {
    const total = pipeline.nuevo + pipeline.contactado + pipeline.prospecto + pipeline.cliente;

    return {
      nuevo_contactado:
        pipeline.nuevo > 0
          ? (pipeline.contactado / pipeline.nuevo) * 100
          : 0,
      contactado_prospecto:
        pipeline.contactado > 0
          ? (pipeline.prospecto / pipeline.contactado) * 100
          : 0,
      prospecto_cliente:
        pipeline.prospecto > 0
          ? (pipeline.cliente / pipeline.prospecto) * 100
          : 0,
      total:
        total > 0
          ? (pipeline.cliente / total) * 100
          : 0,
    };
  }

  calcularTasaRetención(leads: Lead[]): number {
    const clientes = leads.filter((l) => l.estado === "cliente").length;
    const total = leads.length;

    return total > 0 ? (clientes / total) * 100 : 0;
  }

  generarReporteLead(
    lead: Lead,
    emailsEnviados: number = 0,
    emailsAbiertos: number = 0,
    clicks: number = 0,
    probabilidadConversión: number = 0
  ): ReporteLead {
    return {
      leadId: lead.id,
      email: lead.email,
      nombre: lead.nombre,
      estado: lead.estado,
      puntuación: lead.puntuación,
      temperatura: lead.temperatura,
      fechaCaptura: lead.fechaCaptura,
      fechaÚltimoContacto: lead.fechaÚltimoContacto,
      emailsEnviados,
      emailsAbiertos,
      clicks,
      probabilidadConversión,
    };
  }

  generarReporteLeadManagement(
    leads: Lead[],
    período: string = "mensual",
    metricas?: {
      emailsEnviados?: number;
      emailsAbiertos?: number;
      clicks?: number;
      costoAdquisición?: number;
      valorVidaCliente?: number;
    }
  ): ReporteLeadManagement {
    const pipeline = this.obtenerPipeline(leads);
    const tasasConversión = this.calcularTasaConversión(pipeline);
    const tasaRetención = this.calcularTasaRetención(leads);

    const leadsCualificados = leads.filter(
      (l) => l.puntuación >= 70
    ).length;
    const leadsPerdidos = leads.filter((l) => l.estado === "perdido").length;
    const leadsConvertidos = pipeline.cliente;
    const leadsCapturados = leads.filter(
      (l) => l.estado === "nuevo"
    ).length;

    const emailsEnviados = metricas?.emailsEnviados || 0;
    const emailsAbiertos = metricas?.emailsAbiertos || 0;
    const clicks = metricas?.clicks || 0;

    const tasaApertura =
      emailsEnviados > 0 ? (emailsAbiertos / emailsEnviados) * 100 : 0;
    const tasaClick =
      emailsAbiertos > 0 ? (clicks / emailsAbiertos) * 100 : 0;

    const costoAdquisición = metricas?.costoAdquisición || 0;
    const valorVidaCliente = metricas?.valorVidaCliente || 0;

    const roi =
      costoAdquisición > 0
        ? ((valorVidaCliente - costoAdquisición) / costoAdquisición) * 100
        : 0;

    return {
      período,
      leadsCapturados,
      leadsConvertidos,
      tasaConversión: tasasConversión.total,
      tasaRetención,
      leadsTotales: leads.length,
      estadoPipeline: pipeline,
      leadsCualificados,
      leadsPerdidos,
      emailsEnviados,
      tasaApertura,
      tasaClick,
      costoAdquisición,
      valordaVidaCliente: valorVidaCliente,
      roi,
    };
  }

  proyectarCrecimiento(
    leads: Lead[],
    tasaMensual: number = 0.1
  ): Array<{ mes: number; leadsProyectados: number; clientesProyectados: number }> {
    const proyecciones: Array<{ mes: number; leadsProyectados: number; clientesProyectados: number }> = [];
    const leadsActuales = leads.length;
    const clientesActuales = leads.filter((l) => l.estado === "cliente").length;

    for (let mes = 0; mes < 12; mes++) {
      const leadsProyectados = Math.round(
        leadsActuales * Math.pow(1 + tasaMensual, mes)
      );
      const clientesProyectados = Math.round(
        clientesActuales * Math.pow(1 + tasaMensual, mes)
      );

      proyecciones.push({
        mes,
        leadsProyectados,
        clientesProyectados,
      });
    }

    return proyecciones;
  }
}
