/**
 * Fase 2: Sistema de Plantillas de Formularios (FormTemplateRegistry)
 * Reemplaza hardcoding de entityForms() con registro extensible y reutilizable.
 */

import type { FormFieldSpec, FormSpec } from "../presentation/types.js";

/**
 * Configuración de una plantilla de formulario reutilizable.
 */
export interface FormTemplateConfig {
  readonly id: string;
  readonly entityKind: string; // "parte", "oferta", "recurso"
  readonly fields: readonly FieldTemplate[];
  readonly sections?: readonly FormSection[];
  readonly description?: string;
}

/**
 * Definición de un campo en una plantilla.
 */
export interface FieldTemplate {
  readonly id: string;
  readonly name: string;
  readonly labelKey: string;
  readonly type:
    | "string"
    | "number"
    | "boolean"
    | "date"
    | "enum"
    | "reference";
  readonly required: boolean;
  readonly validation?: readonly string[];
  readonly enumValues?: readonly string[];
  readonly referenceEntity?: string;
  readonly description?: string;
}

/**
 * Sección lógica en un formulario (agrupa campos).
 */
export interface FormSection {
  readonly id: string;
  readonly labelKey: string;
  readonly fieldIds: readonly string[];
  readonly collapsible?: boolean;
}

/**
 * Registro extensible de plantillas de formularios.
 * Permite:
 * - Registrar plantillas custom sin modificar código del generador
 * - Generar FormSpec a partir de plantillas
 * - Reutilizar plantillas en múltiples contextos
 */
export class FormTemplateRegistry {
  private templates: Map<string, FormTemplateConfig> = new Map();

  /**
   * Registra una nueva plantilla de formulario.
   * Si ya existe, la reemplaza.
   */
  register(template: FormTemplateConfig): void {
    if (!template.id) {
      throw new Error("FormTemplateConfig debe tener un id definido");
    }
    if (!template.entityKind) {
      throw new Error(
        "FormTemplateConfig debe tener un entityKind definido"
      );
    }
    if (template.fields.length === 0) {
      throw new Error("FormTemplateConfig debe tener al menos un campo");
    }
    this.templates.set(template.id, template);
  }

  /**
   * Recupera una plantilla por su id.
   * Retorna undefined si no existe.
   */
  get(id: string): FormTemplateConfig | undefined {
    return this.templates.get(id);
  }

  /**
   * Verifica si una plantilla existe.
   */
  has(id: string): boolean {
    return this.templates.has(id);
  }

  /**
   * Retorna todas las plantillas registradas.
   */
  getAll(): readonly FormTemplateConfig[] {
    return Array.from(this.templates.values());
  }

  /**
   * Retorna plantillas de un entity kind específico.
   */
  getByEntityKind(entityKind: string): readonly FormTemplateConfig[] {
    return Array.from(this.templates.values()).filter(
      (t) => t.entityKind === entityKind
    );
  }

  /**
   * Genera un FormSpec a partir de una plantilla.
   */
  generateForm(templateId: string): FormSpec {
    const template = this.get(templateId);
    if (!template) {
      throw new Error(
        `Plantilla de formulario no encontrada: ${templateId}`
      );
    }

    const fields = template.fields.map((ft) => ({
      name: ft.name,
      labelKey: ft.labelKey,
      type: ft.type,
      required: ft.required,
      ...(ft.enumValues && { enumValues: ft.enumValues }),
      ...(ft.referenceEntity && { referenceEntity: ft.referenceEntity }),
    })) as FormFieldSpec[];

    return {
      id: templateId,
      entityKind: template.entityKind,
      fields: Object.freeze(fields),
    };
  }

  /**
   * Crea un registro con las plantillas por defecto.
   * Estos defaults reemplazan el hardcoding de entityForms().
   */
  static createDefaults(): FormTemplateRegistry {
    const registry = new FormTemplateRegistry();

    // Template: Parte
    registry.register({
      id: "form.parte",
      entityKind: "parte",
      fields: [
        {
          id: "parte_id",
          name: "parte_id",
          labelKey: "field.parte_id",
          type: "reference",
          required: true,
          referenceEntity: "parte",
          description: "Identificador único de la parte",
        },
        {
          id: "nombre_ref",
          name: "nombre_ref",
          labelKey: "field.parte_ref_label",
          type: "string",
          required: false,
          description: "Etiqueta opcional para la referencia",
        },
      ],
      description: "Plantilla para referencias a partes",
    });

    // Template: Oferta
    registry.register({
      id: "form.oferta",
      entityKind: "oferta",
      fields: [
        {
          id: "oferta_version",
          name: "oferta_version",
          labelKey: "field.oferta_version",
          type: "number",
          required: true,
          description: "Versión de la oferta",
        },
        {
          id: "descripcion",
          name: "descripcion",
          labelKey: "field.oferta_desc",
          type: "string",
          required: false,
          description: "Descripción opcional de la oferta",
        },
      ],
      description: "Plantilla para ofertas",
    });

    // Template: Recurso
    registry.register({
      id: "form.recurso",
      entityKind: "recurso",
      fields: [
        {
          id: "recurso_id",
          name: "recurso_id",
          labelKey: "field.recurso_id",
          type: "reference",
          required: true,
          referenceEntity: "recurso",
          description: "Identificador único del recurso",
        },
        {
          id: "cantidad",
          name: "cantidad",
          labelKey: "field.cantidad",
          type: "number",
          required: false,
          description: "Cantidad del recurso",
        },
      ],
      description: "Plantilla para recursos",
    });

    return registry;
  }
}
