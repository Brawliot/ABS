/**
 * Arquitectura por Capas: Refactorización modular del generador.
 * Fase 3: Estructura clara y extensible en capas de procesamiento.
 */

import type { GeneratorInput } from "./types.js";
import type { UiSpec } from "../presentation/types.js";
import type { ValidatedUiSpec } from "../presentation/validated.js";
import type { ObservabilityManager } from "./observability.js";
import type { DeductionCache } from "./caching.js";

/**
 * Contexto compartido entre capas.
 */
export interface GeneratorContext {
  observability: ObservabilityManager;
  cache: DeductionCache;
  options?: Record<string, any>;
}

/**
 * Interfaz para una capa del generador.
 */
export interface GeneratorLayer {
  name: string;
  priority: number; // 1-100, ejecutadas en orden descendente
  execute(input: any, context: GeneratorContext): Promise<any>;
  canHandle(input: any): boolean;
  validate(input: any, output: any): boolean;
}

/**
 * Capa de Normalización: Normaliza y valida el input.
 */
export class NormalizationLayer implements GeneratorLayer {
  name = "Normalización";
  priority = 100;

  async execute(_input: any, context: GeneratorContext): Promise<any> {
    context.observability.startPhase("normalize");

    try {
      // Validar que input sea válido
      if (_input === null || _input === undefined || typeof _input !== "object") {
        throw new Error("Input no es un objeto válido");
      }

      if (!_input.caseId || !_input.lifecycles) {
        throw new Error("Input falta caseId o lifecycles");
      }

      // Normalizar estructura
      const normalized = {
        ..._input,
        lifecycles: Array.isArray(_input.lifecycles)
          ? _input.lifecycles
          : [_input.lifecycles],
      };

      context.observability.endPhase("normalize", {
        inputSize: JSON.stringify(_input).length,
        outputSize: JSON.stringify(normalized).length,
      });

      return normalized;
    } catch (error) {
      context.observability.endPhase(
        "normalize",
        {},
        false,
        error instanceof Error ? error.message : "Error desconocido",
      );
      throw error;
    }
  }

  canHandle(input: any): boolean {
    return input !== null && input !== undefined && typeof input === "object";
  }

  validate(_input: any, output: any): boolean {
    return (
      output &&
      typeof output === "object" &&
      output.caseId &&
      Array.isArray(output.lifecycles)
    );
  }
}

/**
 * Capa de Generación de Vistas: Genera vistas desde estados.
 */
export class ViewGenerationLayer implements GeneratorLayer {
  name = "Generación de Vistas";
  priority = 80;

  async execute(input: any, context: GeneratorContext): Promise<any> {
    context.observability.startPhase("generate_views");

    try {
      const views = [];

      // Generar vistas desde cada estado de cada lifecycle
      for (const slice of input.lifecycles || []) {
        if (slice.lifecycle?.states) {
          for (const state of slice.lifecycle.states) {
            views.push({
              id: `view.${slice.id}.${state.id}`,
              kind: "tablero",
              labelKey: `view.${slice.id}.${state.id}`,
              stateId: state.id,
              lifecycleId: slice.id,
              actionIds: [],
            });
          }
        }
      }

      context.observability.recordMetric("viewsGenerated", views.length);
      context.observability.endPhase("generate_views", {
        inputSize: JSON.stringify(input).length,
        outputSize: JSON.stringify(views).length,
      });

      return { ...input, views };
    } catch (error) {
      context.observability.endPhase(
        "generate_views",
        {},
        false,
        error instanceof Error ? error.message : "Error desconocido",
      );
      throw error;
    }
  }

  canHandle(input: any): boolean {
    return (
      input &&
      input.lifecycles &&
      input.lifecycles.some((lc: any) => lc.lifecycle?.states?.length > 0)
    );
  }

  validate(_input: any, output: any): boolean {
    return output && Array.isArray(output.views);
  }
}

/**
 * Capa de Generación de Acciones: Genera acciones desde transiciones.
 */
export class ActionGenerationLayer implements GeneratorLayer {
  name = "Generación de Acciones";
  priority = 75;

  async execute(input: any, context: GeneratorContext): Promise<any> {
    context.observability.startPhase("generate_actions");

    try {
      const actions = [];

      // Generar acciones desde cada transición
      for (const slice of input.lifecycles || []) {
        if (slice.lifecycle?.transitions) {
          for (const transition of slice.lifecycle.transitions) {
            actions.push({
              id: `action.${slice.id}.${transition.id}`,
              transitionId: transition.id,
              lifecycleId: slice.id,
              labelKey: `action.${transition.id}`,
              visibleRoles: [],
              requiredEvidenceKind: transition.requiredEvidence,
            });
          }
        }
      }

      context.observability.recordMetric("actionsGenerated", actions.length);
      context.observability.endPhase("generate_actions", {
        inputSize: JSON.stringify(input).length,
        outputSize: JSON.stringify(actions).length,
      });

      return { ...input, actions };
    } catch (error) {
      context.observability.endPhase(
        "generate_actions",
        {},
        false,
        error instanceof Error ? error.message : "Error desconocido",
      );
      throw error;
    }
  }

  canHandle(input: any): boolean {
    return (
      input &&
      input.lifecycles &&
      input.lifecycles.some((lc: any) => lc.lifecycle?.transitions?.length > 0)
    );
  }

  validate(_input: any, output: any): boolean {
    return output && Array.isArray(output.actions);
  }
}

/**
 * Capa de Generación de Formas: Genera formularios.
 */
export class FormGenerationLayer implements GeneratorLayer {
  name = "Generación de Formas";
  priority = 70;

  async execute(input: any, context: GeneratorContext): Promise<any> {
    context.observability.startPhase("generate_forms");

    try {
      // Crear formas básicas
      const forms = [
        {
          id: "form.parte",
          entityKind: "parte",
          fields: [
            {
              name: "parte_id",
              labelKey: "field.parte_id",
              type: "string",
              required: true,
            },
          ],
        },
      ];

      context.observability.recordMetric("formsGenerated", forms.length);
      context.observability.endPhase("generate_forms", {
        inputSize: JSON.stringify(input).length,
        outputSize: JSON.stringify(forms).length,
      });

      return { ...input, forms };
    } catch (error) {
      context.observability.endPhase(
        "generate_forms",
        {},
        false,
        error instanceof Error ? error.message : "Error desconocido",
      );
      throw error;
    }
  }

  canHandle(_input: any): boolean {
    return true;
  }

  validate(_input: any, output: any): boolean {
    return output && Array.isArray(output.forms);
  }
}

/**
 * Capa de Construcción de Módulos: Agrupa vistas y acciones en módulos.
 */
export class ModuleConstructionLayer implements GeneratorLayer {
  name = "Construcción de Módulos";
  priority = 60;

  async execute(input: any, context: GeneratorContext): Promise<any> {
    context.observability.startPhase("build_modules");

    try {
      const modules = [];

      // Crear módulos básicos
      if (input.views && input.views.length > 0) {
        modules.push({
          id: "mod.principal",
          labelKey: "module.main",
          roleIds: [],
          viewIds: input.views.map((v: any) => v.id).slice(0, 5),
          actionIds: input.actions ? input.actions.map((a: any) => a.id) : [],
        });
      }

      context.observability.recordMetric("modulesGenerated", modules.length);
      context.observability.endPhase("build_modules", {
        inputSize: JSON.stringify(input).length,
        outputSize: JSON.stringify(modules).length,
      });

      return { ...input, modules };
    } catch (error) {
      context.observability.endPhase(
        "build_modules",
        {},
        false,
        error instanceof Error ? error.message : "Error desconocido",
      );
      throw error;
    }
  }

  canHandle(input: any): boolean {
    return input && input.views && input.views.length > 0;
  }

  validate(_input: any, output: any): boolean {
    return output && Array.isArray(output.modules);
  }
}

/**
 * Capa de Aplicación de Plugins: Ejecuta plugins registrados.
 */
export class PluginApplicationLayer implements GeneratorLayer {
  name = "Aplicación de Plugins";
  priority = 50;

  async execute(input: any, context: GeneratorContext): Promise<any> {
    context.observability.startPhase("apply_plugins");

    try {
      // Placeholder: extensión para sistema de plugins
      // Por ahora, simplemente retornar el input sin cambios
      context.observability.recordMetric("pluginsExecuted", 0);
      context.observability.endPhase("apply_plugins", {
        inputSize: JSON.stringify(input).length,
        outputSize: JSON.stringify(input).length,
      });

      return input;
    } catch (error) {
      context.observability.endPhase(
        "apply_plugins",
        {},
        false,
        error instanceof Error ? error.message : "Error desconocido",
      );
      throw error;
    }
  }

  canHandle(_input: any): boolean {
    return true;
  }

  validate(_input: any, output: any): boolean {
    return !!output && typeof output === "object";
  }
}

/**
 * Capa de Validación: Valida la especificación completa.
 */
export class ValidationLayer implements GeneratorLayer {
  name = "Validación";
  priority = 40;

  async execute(input: any, context: GeneratorContext): Promise<any> {
    context.observability.startPhase("validate");

    try {
      // Validar estructura mínima
      if (!input.views || !Array.isArray(input.views)) {
        throw new Error("Falta views en output");
      }

      if (!input.actions || !Array.isArray(input.actions)) {
        throw new Error("Falta actions en output");
      }

      if (!input.forms || !Array.isArray(input.forms)) {
        throw new Error("Falta forms en output");
      }

      context.observability.endPhase("validate", {
        inputSize: JSON.stringify(input).length,
        outputSize: JSON.stringify(input).length,
      });

      return input;
    } catch (error) {
      context.observability.recordMetric("validationErrors", 1);
      context.observability.endPhase(
        "validate",
        {},
        false,
        error instanceof Error ? error.message : "Error desconocido",
      );
      throw error;
    }
  }

  canHandle(input: any): boolean {
    return !!input && typeof input === "object";
  }

  validate(_input: any, output: any): boolean {
    return (
      output &&
      Array.isArray(output.views) &&
      Array.isArray(output.actions) &&
      Array.isArray(output.forms)
    );
  }
}

/**
 * Orquestador de capas: ejecuta capas en orden de prioridad.
 */
export class GeneratorArchitecture {
  private layers: GeneratorLayer[] = [];

  /**
   * Registra una capa en la arquitectura.
   */
  registerLayer(layer: GeneratorLayer): void {
    this.layers.push(layer);
    // Ordenar por prioridad descendente
    this.layers.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Obtiene todas las capas registradas.
   */
  getLayers(): readonly GeneratorLayer[] {
    return [...this.layers];
  }

  /**
   * Ejecuta todas las capas en orden.
   */
  async execute(input: any, context: GeneratorContext): Promise<any> {
    let result = input;

    for (const layer of this.layers) {
      if (layer.canHandle(result)) {
        result = await layer.execute(result, context);

        // Validar output
        if (!layer.validate(input, result)) {
          throw new Error(
            `Validación falló para capa ${layer.name}: output inválido`,
          );
        }
      }
    }

    return result;
  }

  /**
   * Ejecuta solo una capa específica.
   */
  async executeLayer(
    layerName: string,
    input: any,
    context: GeneratorContext,
  ): Promise<any> {
    const layer = this.layers.find((l) => l.name === layerName);
    if (!layer) {
      throw new Error(`Capa no encontrada: ${layerName}`);
    }

    if (!layer.canHandle(input)) {
      throw new Error(`Capa ${layerName} no puede manejar el input`);
    }

    return await layer.execute(input, context);
  }
}
