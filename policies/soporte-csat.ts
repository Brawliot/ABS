/**
 * Motor CSAT (Customer Satisfaction): Encuestas de satisfacción,
 * registro de respuestas y análisis de tendencias.
 */

export interface EncuestaCSAT {
  readonly id: string;
  readonly ticketId: string;
  readonly clienteId: string;
  readonly estado: "pendiente" | "respondida" | "expirada";
  readonly fechaEnvio: Date;
  readonly fechaRespuesta?: Date;
}

export interface RespuestaCSAT {
  readonly id: string;
  readonly encuestaId: string;
  readonly ticketId: string;
  readonly puntuacion: 1 | 2 | 3 | 4 | 5;
  readonly comentario: string;
  readonly fechaRespuesta: Date;
}

export interface TendenciaCSAT {
  readonly puntuacionPromedio: number; // 1-5
  readonly totalEncuestas: number;
  readonly porcentajeSatisfacción: number; // % con puntuación >= 4
  readonly porcentajeInsatisfacción: number; // % con puntuación < 3
}

export class MotorCSAT {
  private encuestas = new Map<string, EncuestaCSAT>();
  private respuestas = new Map<string, RespuestaCSAT>();

  solicitarEncuesta(ticketId: string, clienteId: string): EncuestaCSAT {
    const id = `encuesta-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const encuesta: EncuestaCSAT = {
      id,
      ticketId,
      clienteId,
      estado: "pendiente",
      fechaEnvio: new Date(),
    };

    this.encuestas.set(id, encuesta);
    return encuesta;
  }

  registrarCSAT(
    encuestaId: string,
    puntuacion: 1 | 2 | 3 | 4 | 5,
    comentario: string
  ): RespuestaCSAT | null {
    const encuesta = this.encuestas.get(encuestaId);
    if (!encuesta) return null;

    const respuestaId = `respuesta-${Date.now()}`;
    const respuesta: RespuestaCSAT = {
      id: respuestaId,
      encuestaId,
      ticketId: encuesta.ticketId,
      puntuacion,
      comentario,
      fechaRespuesta: new Date(),
    };

    this.respuestas.set(respuestaId, respuesta);

    // Actualizar estado de encuesta
    this.encuestas.set(encuestaId, {
      ...encuesta,
      estado: "respondida",
      fechaRespuesta: new Date(),
    });

    return respuesta;
  }

  obtenerTendencia(): TendenciaCSAT {
    const respuestasArray = Array.from(this.respuestas.values());

    if (respuestasArray.length === 0) {
      return {
        puntuacionPromedio: 0,
        totalEncuestas: 0,
        porcentajeSatisfacción: 0,
        porcentajeInsatisfacción: 0,
      };
    }

    const sumaPuntuaciones = respuestasArray.reduce((sum, r) => sum + r.puntuacion, 0);
    const puntuacionPromedio = sumaPuntuaciones / respuestasArray.length;

    const satisfechos = respuestasArray.filter(r => r.puntuacion >= 4).length;
    const insatisfechos = respuestasArray.filter(r => r.puntuacion < 3).length;

    return {
      puntuacionPromedio: Math.round(puntuacionPromedio * 10) / 10,
      totalEncuestas: respuestasArray.length,
      porcentajeSatisfacción: Math.round((satisfechos / respuestasArray.length) * 100),
      porcentajeInsatisfacción: Math.round((insatisfechos / respuestasArray.length) * 100),
    };
  }

  alertarSiBajaSatisfacción(): boolean {
    const tendencia = this.obtenerTendencia();
    return tendencia.puntuacionPromedio < 3.5;
  }

  obtenerRespuestasDeTicket(ticketId: string): RespuestaCSAT[] {
    return Array.from(this.respuestas.values())
      .filter(r => r.ticketId === ticketId);
  }

  obtenerPuntuacionTicket(ticketId: string): number | null {
    const respuesta = Array.from(this.respuestas.values())
      .find(r => r.ticketId === ticketId);
    return respuesta ? respuesta.puntuacion : null;
  }

  obtenerComentariosNegativoS(): RespuestaCSAT[] {
    return Array.from(this.respuestas.values())
      .filter(r => r.puntuacion <= 2)
      .sort((a, b) => b.fechaRespuesta.getTime() - a.fechaRespuesta.getTime());
  }
}
