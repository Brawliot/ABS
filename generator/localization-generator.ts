/**
 * LocalizationGenerator: Auto-generación determinística de strings de UI.
 *
 * Elimina hardcoding de 20+ strings y genera automáticamente labels desde
 * estados, acciones y contexto del arquetipo. Soporta i18n (es/en).
 */

import type { BusinessProfile } from "../core/business.js";
import type { Transition } from "../core/lifecycle.js";
import type {
  ActionSpec,
  ProcessGroupSpec,
  ViewSpec,
} from "../presentation/types.js";
import type { ComposedArchetypeSpec } from "../archetypes/types.js";

export interface LocalizationContext {
  readonly businessProfile: Partial<BusinessProfile>;
  readonly archetype: ComposedArchetypeSpec;
  readonly locale: "es" | "en";
}

export class LocalizationGenerator {
  /**
   * Genera automáticamente labels para estados, acciones y campos comunes.
   * Determinista: mismo input → mismo output.
   */
  generateLabels(
    context: LocalizationContext,
    processGroups: readonly ProcessGroupSpec[],
    views: readonly ViewSpec[],
    actions: readonly ActionSpec[],
  ): Record<string, string> {
    const labels: Record<string, string> = {};

    // 1. Etiquetas comunes (siempre presentes)
    this.addCommonLabels(labels, context.locale);

    // 2. Labels de módulos/procesos
    for (const pg of processGroups) {
      if (!labels[pg.labelKey]) {
        labels[pg.labelKey] = this.humanizeName(pg.id, context);
      }
    }

    // 3. Labels de vistas
    for (const view of views) {
      if (!labels[view.labelKey]) {
        if (view.presentation?.vista) {
          labels[view.labelKey] = String(view.presentation.vista);
        } else if (view.stateId) {
          labels[view.labelKey] = `Tablero: ${this.humanizeName(
            view.stateId,
            context,
          )}`;
        } else {
          labels[view.labelKey] = this.humanizeName(view.id, context);
        }
      }
    }

    // 4. Labels de acciones
    for (const action of actions) {
      if (!labels[action.labelKey]) {
        labels[action.labelKey] = this.humanizeTransition(
          action.transitionId,
          context,
        );
      }
    }

    return labels;
  }

  /**
   * Convierte identificadores snake_case a formato legible.
   * Determinista: "propuesta" → "Propuesta", "en_entrega" → "En Entrega"
   */
  private humanizeName(id: string, context: LocalizationContext): string {
    // Remover prefijos comunes
    const cleaned = id
      .replace(/^(state|action|panel|proceso|module)_?/, "")
      .replace(/^t_/, ""); // transiciones

    // Dividir por underscore y capitalizar cada parte
    const parts = cleaned.split("_").map((part) => {
      if (!part) return "";
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    });

    const name = parts.filter((p) => p).join(" ");

    // Traducir si está en el locale
    if (context.locale === "en") {
      return this.translateToEnglish(name);
    }

    return name;
  }

  /**
   * Humaniza un transitionId manteniendo semántica de acción.
   * "t_aceptar" → "Aceptar", "t_entregar_parcial" → "Entregar Parcial"
   */
  private humanizeTransition(
    transitionId: string,
    context: LocalizationContext,
  ): string {
    const cleaned = transitionId.replace(/^t_/, "");
    return this.humanizeName(cleaned, context);
  }

  /**
   * Etiquetas que siempre están presentes en toda UI.
   */
  private addCommonLabels(labels: Record<string, string>, locale: "es" | "en") {
    const common =
      locale === "es"
        ? {
            "common.back": "Atrás",
            "common.next": "Siguiente",
            "common.save": "Guardar",
            "common.cancel": "Cancelar",
            "common.delete": "Eliminar",
            "common.edit": "Editar",
            "common.view": "Ver",
            "common.close": "Cerrar",
            "common.confirm": "Confirmar",
            "common.submit": "Enviar",
            "common.loading": "Cargando...",
            "common.error": "Error",
            "common.success": "Éxito",
            "error.required": "Campo requerido",
            "error.invalid": "Valor inválido",
            "error.network": "Error de conectividad",
            "error.unauthorized": "No autorizado",
            "error.forbidden": "Acceso denegado",
            "error.not_found": "No encontrado",
            "field.evidence_kind": "Tipo de evidencia",
            "field.evidence_reference": "Referencia",
            "field.evidence_recorded_at": "Registrada en",
            "field.parte_id": "Parte",
            "field.parte_ref_label": "Etiqueta",
            "field.oferta_version": "Versión de oferta",
            "field.oferta_desc": "Descripción",
            "field.recurso_id": "Recurso",
            "field.cantidad": "Cantidad",
          }
        : {
            "common.back": "Back",
            "common.next": "Next",
            "common.save": "Save",
            "common.cancel": "Cancel",
            "common.delete": "Delete",
            "common.edit": "Edit",
            "common.view": "View",
            "common.close": "Close",
            "common.confirm": "Confirm",
            "common.submit": "Submit",
            "common.loading": "Loading...",
            "common.error": "Error",
            "common.success": "Success",
            "error.required": "Required field",
            "error.invalid": "Invalid value",
            "error.network": "Network error",
            "error.unauthorized": "Unauthorized",
            "error.forbidden": "Access denied",
            "error.not_found": "Not found",
            "field.evidence_kind": "Evidence type",
            "field.evidence_reference": "Reference",
            "field.evidence_recorded_at": "Recorded at",
            "field.parte_id": "Party",
            "field.parte_ref_label": "Label",
            "field.oferta_version": "Offer version",
            "field.oferta_desc": "Description",
            "field.recurso_id": "Resource",
            "field.cantidad": "Quantity",
          };

    Object.assign(labels, common);
  }

  /**
   * Traduce nombres humanizados comunes de español a inglés.
   * Traducción básica para arquitectetypes estándar.
   */
  private translateToEnglish(name: string): string {
    const translations: Record<string, string> = {
      Propuesta: "Proposal",
      Aceptada: "Accepted",
      Rechazada: "Rejected",
      En: "In",
      Entrega: "Delivery",
      Completada: "Completed",
      Cancelada: "Cancelled",
      Con: "With",
      Problema: "Issue",
      Resuelto: "Resolved",
      Pendiente: "Pending",
      Activo: "Active",
      Inactivo: "Inactive",
      Bloqueado: "Blocked",
      Desbloqueado: "Unblocked",
    };

    // Si existe traducción exacta, usar
    if (translations[name]) {
      return translations[name];
    }

    // Si no, devolver el nombre en español capitalizado
    return name;
  }
}
