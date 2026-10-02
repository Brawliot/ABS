/**
 * Fase 2: Builder Pattern para Acciones y Vistas
 * Proporciona APIs fluidas para construir especificaciones de manera legible y extensible.
 */

import type { ActionSpec, ViewSpec, ViewKind } from "../presentation/types.js";
import { admittedPatternsForView } from "../presentation/patterns.js";

/**
 * Constructor fluido para ActionSpec.
 * Reduce boilerplate y hace el código más legible.
 *
 * Uso:
 *   const action = new ActionBuilder()
 *     .withId("action.flow.transition")
 *     .withLabel("action.transition_label")
 *     .withTransition("flow", "transitionId")
 *     .withEvidence("documento", [...fields])
 *     .withVisibleRoles(["vendedor", "gerente"])
 *     .build();
 */
export class ActionBuilder {
  private actionData: {
    id?: string;
    labelKey?: string;
    lifecycleId?: string;
    transitionId?: string;
    requiredEvidenceKind?: string;
    evidenceFields: readonly any[];
    visibleRoles: string[];
    formId?: string;
  } = {
    visibleRoles: [],
    evidenceFields: [],
  };

  /**
   * Establece el ID de la acción.
   */
  withId(id: string): this {
    if (!id) {
      throw new Error("ActionBuilder: id no puede estar vacío");
    }
    this.actionData.id = id;
    return this;
  }

  /**
   * Establece el label key (clave de localización).
   */
  withLabel(labelKey: string): this {
    if (!labelKey) {
      throw new Error("ActionBuilder: labelKey no puede estar vacío");
    }
    this.actionData.labelKey = labelKey;
    return this;
  }

  /**
   * Establece la transición y lifecycle que esta acción representa.
   */
  withTransition(lifecycleId: string, transitionId: string): this {
    if (!lifecycleId || !transitionId) {
      throw new Error(
        "ActionBuilder: lifecycleId y transitionId no pueden estar vacíos"
      );
    }
    this.actionData.lifecycleId = lifecycleId;
    this.actionData.transitionId = transitionId;
    return this;
  }

  /**
   * Establece el tipo de evidencia requerida.
   */
  withEvidence(
    requiredEvidenceKind: string,
    evidenceFields: readonly any[]
  ): this {
    if (!requiredEvidenceKind) {
      throw new Error(
        "ActionBuilder: requiredEvidenceKind no puede estar vacío"
      );
    }
    this.actionData.requiredEvidenceKind = requiredEvidenceKind;
    this.actionData.evidenceFields = evidenceFields;
    return this;
  }

  /**
   * Establece los roles visibles para esta acción.
   */
  withVisibleRoles(roles: readonly string[]): this {
    if (!roles || roles.length === 0) {
      throw new Error("ActionBuilder: visibleRoles debe tener al menos un rol");
    }
    this.actionData.visibleRoles = Array.from(roles);
    return this;
  }

  /**
   * Añade un rol visible a la acción.
   */
  addVisibleRole(role: string): this {
    if (!role) {
      throw new Error("ActionBuilder: role no puede estar vacío");
    }
    if (!this.actionData.visibleRoles.includes(role)) {
      this.actionData.visibleRoles.push(role);
    }
    return this;
  }

  /**
   * Establece el formulario asociado (opcional).
   */
  withFormId(formId: string): this {
    this.actionData.formId = formId;
    return this;
  }

  /**
   * Construye la ActionSpec.
   */
  build(): ActionSpec {
    if (!this.actionData.id) {
      throw new Error("ActionBuilder: debe establecer id antes de build()");
    }
    if (!this.actionData.labelKey) {
      throw new Error(
        "ActionBuilder: debe establecer labelKey antes de build()"
      );
    }
    if (!this.actionData.lifecycleId) {
      throw new Error(
        "ActionBuilder: debe establecer transición antes de build()"
      );
    }
    if (!this.actionData.requiredEvidenceKind) {
      throw new Error(
        "ActionBuilder: debe establecer evidencia antes de build()"
      );
    }

    return {
      id: this.actionData.id,
      labelKey: this.actionData.labelKey,
      transitionId: this.actionData.transitionId!,
      lifecycleId: this.actionData.lifecycleId,
      visibleRoles: Object.freeze([...this.actionData.visibleRoles]),
      requiredEvidenceKind: this.actionData.requiredEvidenceKind,
      evidenceFields: Object.freeze([...this.actionData.evidenceFields]),
      ...(this.actionData.formId && { formId: this.actionData.formId }),
    } as ActionSpec;
  }
}

/**
 * Constructor fluido para ViewSpec.
 * Simplifica la creación de vistas manteniendo validez estructural.
 *
 * Uso:
 *   const view = new ViewBuilder()
 *     .withId("view.lifecycle.state")
 *     .forState("lifecycle", "estado")
 *     .withKind("tablero")
 *     .addActions(["action.1", "action.2"])
 *     .build();
 */
export class ViewBuilder {
  private viewData: {
    id?: string;
    labelKey?: string;
    lifecycleId?: string;
    stateId?: string;
    kind?: ViewKind;
    actionIds: string[];
    formId?: string;
  } = {
    actionIds: [],
  };

  /**
   * Establece el ID de la vista.
   */
  withId(id: string): this {
    if (!id) {
      throw new Error("ViewBuilder: id no puede estar vacío");
    }
    this.viewData.id = id;
    return this;
  }

  /**
   * Establece el label key (clave de localización).
   */
  withLabel(labelKey: string): this {
    if (!labelKey) {
      throw new Error("ViewBuilder: labelKey no puede estar vacío");
    }
    this.viewData.labelKey = labelKey;
    return this;
  }

  /**
   * Asocia esta vista a un estado y lifecycle específicos.
   */
  forState(lifecycleId: string, stateId: string): this {
    if (!lifecycleId || !stateId) {
      throw new Error(
        "ViewBuilder: lifecycleId y stateId no pueden estar vacíos"
      );
    }
    this.viewData.lifecycleId = lifecycleId;
    this.viewData.stateId = stateId;
    return this;
  }

  /**
   * Establece el tipo (kind) de vista.
   */
  withKind(kind: ViewKind): this {
    if (!kind) {
      throw new Error("ViewBuilder: kind no puede estar vacío");
    }
    this.viewData.kind = kind;
    return this;
  }

  /**
   * Añade un ID de acción a la vista.
   */
  addAction(actionId: string): this {
    if (!actionId) {
      throw new Error("ViewBuilder: actionId no puede estar vacío");
    }
    if (!this.viewData.actionIds.includes(actionId)) {
      this.viewData.actionIds.push(actionId);
    }
    return this;
  }

  /**
   * Establece múltiples IDs de acción (reemplaza los existentes).
   */
  withActions(actionIds: readonly string[]): this {
    if (!actionIds) {
      throw new Error("ViewBuilder: actionIds no puede ser null");
    }
    this.viewData.actionIds = Array.from(actionIds);
    return this;
  }

  /**
   * Establece el formulario asociado (opcional).
   */
  withFormId(formId: string): this {
    this.viewData.formId = formId;
    return this;
  }

  /**
   * Construye la ViewSpec.
   */
  build(): ViewSpec {
    if (!this.viewData.id) {
      throw new Error("ViewBuilder: debe establecer id antes de build()");
    }
    if (!this.viewData.labelKey) {
      throw new Error(
        "ViewBuilder: debe establecer labelKey antes de build()"
      );
    }
    if (!this.viewData.kind) {
      throw new Error(
        "ViewBuilder: debe establecer kind antes de build()"
      );
    }

    const kind = this.viewData.kind;
    const admittedPatterns = admittedPatternsForView(kind);

    return {
      id: this.viewData.id,
      labelKey: this.viewData.labelKey,
      kind,
      stateId: this.viewData.stateId ?? null,
      lifecycleId: this.viewData.lifecycleId ?? null,
      actionIds: Object.freeze(
        this.viewData.actionIds.length > 0
          ? [...this.viewData.actionIds].sort()
          : []
      ),
      admittedPatterns,
      ...(this.viewData.formId && { formId: this.viewData.formId }),
    } as ViewSpec;
  }
}

/**
 * Constructor fluido para FormSpec.
 * Simplifica la creación de especificaciones de formularios.
 *
 * Uso:
 *   const form = new FormBuilder()
 *     .withId("form.cliente")
 *     .forEntity("cliente")
 *     .addField({ name: "email", labelKey: "field.email", type: "string", required: true })
 *     .build();
 */
export class FormBuilder {
  private form: Partial<any> & {
    fields: readonly any[];
  } = {
    fields: [],
  };

  /**
   * Establece el ID del formulario.
   */
  withId(id: string): this {
    if (!id) {
      throw new Error("FormBuilder: id no puede estar vacío");
    }
    this.form.id = id;
    return this;
  }

  /**
   * Establece la entidad para la cual es este formulario.
   */
  forEntity(entityKind: string): this {
    if (!entityKind) {
      throw new Error("FormBuilder: entityKind no puede estar vacío");
    }
    this.form.entityKind = entityKind;
    return this;
  }

  /**
   * Añade un campo al formulario.
   */
  addField(field: any): this {
    if (!field || !field.name) {
      throw new Error(
        "FormBuilder: campo debe tener al menos un nombre"
      );
    }
    this.form.fields = [...(this.form.fields || []), field];
    return this;
  }

  /**
   * Establece los campos (reemplaza los existentes).
   */
  withFields(fields: readonly any[]): this {
    if (!fields) {
      throw new Error("FormBuilder: fields no puede ser null");
    }
    this.form.fields = Array.from(fields);
    return this;
  }

  /**
   * Construye el FormSpec.
   */
  build(): any {
    if (!this.form.id) {
      throw new Error("FormBuilder: debe establecer id antes de build()");
    }
    if (!this.form.entityKind) {
      throw new Error(
        "FormBuilder: debe establecer entityKind antes de build()"
      );
    }
    if (!this.form.fields || this.form.fields.length === 0) {
      throw new Error(
        "FormBuilder: debe tener al menos un campo antes de build()"
      );
    }

    return {
      id: this.form.id,
      entityKind: this.form.entityKind,
      fields: Object.freeze([...this.form.fields]),
    };
  }
}
