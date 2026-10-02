/**
 * Fase 2: Sistema de Plugins para Extensibilidad
 * Permite registrar comportamientos custom sin modificar el generador.
 */

import type { ActionSpec, FormSpec, ViewSpec } from "../presentation/types.js";

/**
 * Hook de ciclo de vida disponibles en el generador.
 */
export interface GeneratorHooks {
  /**
   * Se ejecuta después de generar una vista.
   * El plugin puede modificar la vista antes de que se añada al spec.
   */
  onViewGenerated?: (view: ViewSpec) => Promise<ViewSpec> | ViewSpec;

  /**
   * Se ejecuta después de generar una acción.
   * El plugin puede modificar la acción antes de que se añada al spec.
   */
  onActionGenerated?: (action: ActionSpec) => Promise<ActionSpec> | ActionSpec;

  /**
   * Se ejecuta después de generar un formulario.
   * El plugin puede añadir validaciones o campos custom.
   */
  onFormGenerated?: (form: FormSpec) => Promise<FormSpec> | FormSpec;

  /**
   * Se ejecuta después de generar todas las acciones de un ciclo.
   * Permite hacer transformaciones globales.
   */
  onActionsGenerated?: (
    actions: readonly ActionSpec[]
  ) => Promise<readonly ActionSpec[]> | readonly ActionSpec[];

  /**
   * Se ejecuta después de generar todas las vistas de un ciclo.
   * Permite hacer transformaciones globales.
   */
  onViewsGenerated?: (
    views: readonly ViewSpec[]
  ) => Promise<readonly ViewSpec[]> | readonly ViewSpec[];
}

/**
 * Interface para un plugin del generador.
 * Un plugin es una unidad reutilizable de extensión que se registra en el PluginManager.
 */
export interface GeneratorPlugin {
  /** Identificador único del plugin */
  readonly id: string;

  /** Nombre amigable del plugin */
  readonly name: string;

  /** Versión del plugin (para tracking) */
  readonly version: string;

  /** Descripción opcional */
  readonly description?: string;

  /** Los hooks que este plugin implementa */
  readonly hooks: GeneratorHooks;
}

/**
 * Gestor de plugins para el generador.
 * Responsabilidades:
 * - Registrar plugins
 * - Ejecutar hooks en orden de registro
 * - Manejo de errores seguro
 */
export class PluginManager {
  private plugins: Map<string, GeneratorPlugin> = new Map();
  private executionOrder: string[] = [];

  /**
   * Registra un nuevo plugin.
   * Los plugins se ejecutan en orden de registro.
   */
  register(plugin: GeneratorPlugin): void {
    if (!plugin.id) {
      throw new Error("Plugin debe tener un id");
    }
    if (!plugin.name) {
      throw new Error("Plugin debe tener un name");
    }
    if (!plugin.version) {
      throw new Error("Plugin debe tener una version");
    }

    this.plugins.set(plugin.id, plugin);
    this.executionOrder.push(plugin.id);
  }

  /**
   * Desregistra un plugin por id.
   */
  unregister(pluginId: string): void {
    this.plugins.delete(pluginId);
    this.executionOrder = this.executionOrder.filter(
      (id) => id !== pluginId
    );
  }

  /**
   * Obtiene un plugin registrado.
   */
  getPlugin(pluginId: string): GeneratorPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Retorna todos los plugins registrados.
   */
  getAll(): readonly GeneratorPlugin[] {
    return this.executionOrder
      .map((id) => this.plugins.get(id)!)
      .filter((p) => p !== undefined);
  }

  /**
   * Ejecuta un hook específico en todos los plugins.
   * Los plugins se ejecutan en orden de registro.
   * Si un plugin no implementa el hook, se salta.
   */
  async executeHook<T extends keyof GeneratorHooks>(
    hookName: T,
    data: Parameters<Exclude<GeneratorHooks[T], undefined>>[0]
  ): Promise<typeof data> {
    let result = data;

    for (const pluginId of this.executionOrder) {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) continue;

      const hook = plugin.hooks[hookName];
      if (!hook) continue;

      try {
        result = (await (hook as any)(result)) ?? result;
      } catch (error) {
        console.error(
          `Error ejecutando hook ${hookName} en plugin ${plugin.id}:`,
          error
        );
        throw error;
      }
    }

    return result;
  }

  /**
   * Versión sincrónica de executeHook.
   * Lanza error si algún hook es async.
   */
  executeHookSync<T extends keyof GeneratorHooks>(
    hookName: T,
    data: Parameters<Exclude<GeneratorHooks[T], undefined>>[0]
  ): typeof data {
    let result = data;

    for (const pluginId of this.executionOrder) {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) continue;

      const hook = plugin.hooks[hookName];
      if (!hook) continue;

      try {
        const hookResult = (hook as any)(result);
        // Verificar si es una Promise
        if (hookResult && typeof hookResult.then === "function") {
          throw new Error(
            `Hook ${hookName} en plugin ${plugin.id} es async pero se llamó sync`
          );
        }
        result = hookResult ?? result;
      } catch (error) {
        console.error(
          `Error ejecutando hook ${hookName} en plugin ${plugin.id}:`,
          error
        );
        throw error;
      }
    }

    return result;
  }

  /**
   * Limpia todos los plugins registrados.
   */
  clear(): void {
    this.plugins.clear();
    this.executionOrder = [];
  }

  /**
   * Retorna el número de plugins registrados.
   */
  size(): number {
    return this.plugins.size;
  }
}

/**
 * Ejemplo de plugin: Validación Custom
 *
 * Este plugin añade validaciones adicionales a los formularios.
 */
export const createValidationPlugin = (): GeneratorPlugin => ({
  id: "validation-plugin",
  name: "Custom Validation",
  version: "1.0.0",
  description: "Añade validaciones custom a formularios",
  hooks: {
    onFormGenerated: (form) => {
      // El plugin podría transformar campos según reglas custom
      // Por ejemplo, marcar campos de referencia como required
      const updatedFields = form.fields.map((f) => {
        if (f.type === "reference" && !f.required) {
          return {
            ...f,
            required: true,
          };
        }
        return f;
      });

      return {
        ...form,
        fields: Object.freeze(updatedFields),
      };
    },
  },
});

/**
 * Ejemplo de plugin: Registro de Auditoría
 *
 * Este plugin registra cada elemento generado (para debugging).
 */
export const createAuditPlugin = (): GeneratorPlugin => ({
  id: "audit-plugin",
  name: "Audit Logging",
  version: "1.0.0",
  description: "Registra elementos generados para auditoría",
  hooks: {
    onViewGenerated: (view) => {
      console.debug(`[Audit] Vista generada: ${view.id}`);
      return view;
    },
    onActionGenerated: (action) => {
      console.debug(`[Audit] Acción generada: ${action.id}`);
      return action;
    },
    onFormGenerated: (form) => {
      console.debug(`[Audit] Formulario generado: ${form.id}`);
      return form;
    },
  },
});

/**
 * Ejemplo de plugin: Transformaciones de Rol
 *
 * Este plugin filtra vistas y acciones por rol.
 */
export const createRoleFilterPlugin = (
  allowedRoles: readonly string[]
): GeneratorPlugin => ({
  id: "role-filter-plugin",
  name: "Role Filter",
  version: "1.0.0",
  description: "Filtra vistas y acciones por roles permitidos",
  hooks: {
    onActionsGenerated: (actions) => {
      return actions.filter((a) =>
        a.visibleRoles.some((r) => allowedRoles.includes(r))
      );
    },
  },
});
