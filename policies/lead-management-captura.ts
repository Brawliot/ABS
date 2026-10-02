/**
 * Motor de Captura de Leads
 * Validación, duplicados, captura desde formularios
 */

import { randomUUID } from "crypto";
import type {
  Campo,
  Formulario,
  EnvíoFormulario,
  Lead,
  EstadoLead,
} from "../elements/lead-management.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class MotorCapturaLeads {
  private formularios: Map<string, Formulario> = new Map();
  private leads: Map<string, Lead> = new Map();
  private envíosFormulario: Map<string, EnvíoFormulario> = new Map();
  private emailIndex: Map<string, string> = new Map(); // email -> leadId (para detectar duplicados)

  // ========== FORMULARIOS ==========

  crearFormulario(
    nombre: string,
    descripción: string,
    campos: Campo[],
    ctaTexto: string = "Enviar",
    ctaColor: string = "#007bff"
  ): Formulario {
    const id = randomUUID();
    const ahora = new Date();

    const formulario: Formulario = {
      id,
      nombre,
      descripción,
      campos,
      estado: "borrador",
      ctaTexto,
      ctaColor,
      fechaCreación: ahora,
      fechaActualización: ahora,
    };

    this.formularios.set(id, formulario);
    return formulario;
  }

  publicarFormulario(formularioId: string): boolean {
    const formulario = this.formularios.get(formularioId);
    if (!formulario) return false;

    (formulario as any).estado = "publicado";
    return true;
  }

  actualizarFormulario(
    formularioId: string,
    actualizaciones: Partial<Formulario>
  ): boolean {
    const formulario = this.formularios.get(formularioId);
    if (!formulario) return false;

    Object.assign(formulario, actualizaciones, {
      fechaActualización: new Date(),
    });
    return true;
  }

  obtenerFormulario(formularioId: string): Formulario | undefined {
    return this.formularios.get(formularioId);
  }

  // ========== VALIDACIONES ==========

  validarEmail(email: string): boolean {
    return EMAIL_REGEX.test(email);
  }

  evitarDuplicados(email: string): boolean {
    return !this.emailIndex.has(email);
  }

  // ========== CAPTURA DE LEADS ==========

  capturarLead(
    email: string,
    nombre: string,
    empresa?: string,
    teléfono?: string,
    fuente: string = "formulario",
    etiquetas: string[] = []
  ): Lead | null {
    // Validar email
    if (!this.validarEmail(email)) {
      return null;
    }

    // Detectar duplicados
    if (!this.evitarDuplicados(email)) {
      return null;
    }

    const id = randomUUID();
    const ahora = new Date();

    const lead: Lead = {
      id,
      email,
      nombre,
      empresa: empresa || undefined,
      teléfono: teléfono || undefined,
      estado: "nuevo",
      puntuación: 0,
      temperatura: "fría",
      fechaCaptura: ahora,
      fechaÚltimoContacto: undefined,
      fuente,
      etiquetas,
      notas: undefined,
    };

    this.leads.set(id, lead);
    this.emailIndex.set(email, id);
    return lead;
  }

  enviarFormulario(
    formularioId: string,
    datos: Record<string, string>,
    ipOrigen: string = "127.0.0.1",
    userAgent: string = ""
  ): EnvíoFormulario | null {
    const formulario = this.formularios.get(formularioId);
    if (!formulario || formulario.estado !== "publicado") {
      return null;
    }

    // Validar campos requeridos
    for (const campo of formulario.campos) {
      if (campo.requerido && !datos[campo.nombre]) {
        return null;
      }
    }

    // Extraer email del formulario si existe
    const emailField = formulario.campos.find((c) => c.tipo === "email");
    const email = emailField ? datos[emailField.nombre] : null;
    const nameField = formulario.campos.find((c) => c.nombre === "nombre");
    const nombre = nameField ? datos[nameField.nombre] : "Sin nombre";

    // Capturar lead si hay email válido
    if (email) {
      this.capturarLead(
        email,
        nombre,
        datos["empresa"],
        datos["teléfono"],
        "formulario"
      );
    }

    const id = randomUUID();
    const envío: EnvíoFormulario = {
      id,
      formularioId,
      datos,
      fechaEnvío: new Date(),
      ipOrigen,
      userAgent,
    };

    this.envíosFormulario.set(id, envío);
    return envío;
  }

  // ========== LEADS ==========

  obtenerLead(leadId: string): Lead | undefined {
    return this.leads.get(leadId);
  }

  obtenerLeads(filtros?: {
    estado?: EstadoLead;
    temperatura?: "fría" | "tibia" | "caliente";
    desdeScore?: number;
    fuente?: string;
  }): Lead[] {
    const leads = Array.from(this.leads.values());

    if (!filtros) return leads;

    return leads.filter((lead) => {
      if (filtros.estado && lead.estado !== filtros.estado) return false;
      if (filtros.temperatura && lead.temperatura !== filtros.temperatura)
        return false;
      if (
        filtros.desdeScore !== undefined &&
        lead.puntuación < filtros.desdeScore
      )
        return false;
      if (filtros.fuente && lead.fuente !== filtros.fuente) return false;
      return true;
    });
  }

  cambiarEstadoLead(leadId: string, nuevoEstado: EstadoLead): boolean {
    const lead = this.leads.get(leadId);
    if (!lead) return false;

    (lead as any).estado = nuevoEstado;
    if (nuevoEstado !== "nuevo") {
      (lead as any).fechaÚltimoContacto = new Date();
    }

    return true;
  }

  agregarEtiquetaLead(leadId: string, etiqueta: string): boolean {
    const lead = this.leads.get(leadId);
    if (!lead) return false;

    if (!lead.etiquetas.includes(etiqueta)) {
      lead.etiquetas.push(etiqueta);
    }

    return true;
  }

  agregarNotaLead(leadId: string, nota: string): boolean {
    const lead = this.leads.get(leadId);
    if (!lead) return false;

    (lead as any).notas = (lead.notas ? lead.notas + "\n" : "") + nota;
    return true;
  }

  buscarLeadPorEmail(email: string): Lead | undefined {
    const leadId = this.emailIndex.get(email);
    return leadId ? this.leads.get(leadId) : undefined;
  }

  obtenerTotalLeads(): number {
    return this.leads.size;
  }

  obtenerEnvíosFormulario(formularioId?: string): EnvíoFormulario[] {
    const envíos = Array.from(this.envíosFormulario.values());
    return formularioId
      ? envíos.filter((e) => e.formularioId === formularioId)
      : envíos;
  }
}
