/**
 * Fase 2 del Generador: Pruebas de Extensibilidad + Builders
 *
 * 24+ tests que validan:
 * - FormTemplateRegistry (8 tests)
 * - ActionBuilder (6 tests)
 * - ViewBuilder (6 tests)
 * - PluginSystem (3 tests)
 * - Integration (1+ tests)
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
  FormTemplateRegistry,
  ActionBuilder,
  ViewBuilder,
  FormBuilder,
  PluginManager,
  createValidationPlugin,
  createAuditPlugin,
  createRoleFilterPlugin,
} from "../generator/index.js";
import type {
  FormTemplateConfig,
  FieldTemplate,
  GeneratorPlugin,
  GeneratorHooks,
} from "../generator/index.js";

// ============================================================================
// FORMTEMPLATEREGISTRY: 8 TESTS
// ============================================================================

describe("FormTemplateRegistry", () => {
  let registry: FormTemplateRegistry;

  beforeEach(() => {
    registry = new FormTemplateRegistry();
  });

  it("debería registrar y recuperar una plantilla", () => {
    const template: FormTemplateConfig = {
      id: "test.template",
      entityKind: "test_entity",
      fields: [
        {
          id: "field1",
          name: "test_field",
          labelKey: "field.test",
          type: "string",
          required: true,
        },
      ],
    };

    registry.register(template);
    const retrieved = registry.get("test.template");

    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe("test.template");
    expect(retrieved?.entityKind).toBe("test_entity");
  });

  it("debería generar FormSpec desde una plantilla", () => {
    const template: FormTemplateConfig = {
      id: "form.test",
      entityKind: "test",
      fields: [
        {
          id: "field1",
          name: "email",
          labelKey: "field.email",
          type: "string",
          required: true,
        },
        {
          id: "field2",
          name: "age",
          labelKey: "field.age",
          type: "number",
          required: false,
        },
      ],
    };

    registry.register(template);
    const form = registry.generateForm("form.test");

    expect(form.id).toBe("form.test");
    expect(form.entityKind).toBe("test");
    expect(form.fields.length).toBe(2);
    expect(form.fields[0]?.name).toBe("email");
    expect(form.fields[1]?.name).toBe("age");
  });

  it("debería cargar plantillas por defecto", () => {
    const defaultRegistry = FormTemplateRegistry.createDefaults();

    expect(defaultRegistry.has("form.parte")).toBe(true);
    expect(defaultRegistry.has("form.oferta")).toBe(true);
    expect(defaultRegistry.has("form.recurso")).toBe(true);
  });

  it("debería lanzar error si plantilla no existe", () => {
    expect(() => registry.generateForm("no.existe")).toThrow(
      "Plantilla de formulario no encontrada"
    );
  });

  it("debería retornar plantillas por entityKind", () => {
    const defaultRegistry = FormTemplateRegistry.createDefaults();

    const parteTemplates = defaultRegistry.getByEntityKind("parte");
    expect(parteTemplates.length).toBeGreaterThan(0);
    expect(parteTemplates.some((t) => t.id === "form.parte")).toBe(true);
  });

  it("debería validar que id y entityKind sean requeridos", () => {
    const invalidTemplate1 = {
      id: "",
      entityKind: "test",
      fields: [
        {
          id: "f1",
          name: "test",
          labelKey: "test",
          type: "string" as const,
          required: true,
        },
      ],
    } as FormTemplateConfig;

    expect(() => registry.register(invalidTemplate1)).toThrow();
  });

  it("debería validar que fields no esté vacío", () => {
    const invalidTemplate = {
      id: "test",
      entityKind: "test",
      fields: [],
    } as FormTemplateConfig;

    expect(() => registry.register(invalidTemplate)).toThrow(
      "debe tener al menos un campo"
    );
  });

  it("debería retornar todas las plantillas registradas", () => {
    const template1: FormTemplateConfig = {
      id: "t1",
      entityKind: "entity1",
      fields: [
        {
          id: "f1",
          name: "f1",
          labelKey: "f1",
          type: "string",
          required: true,
        },
      ],
    };

    const template2: FormTemplateConfig = {
      id: "t2",
      entityKind: "entity2",
      fields: [
        {
          id: "f2",
          name: "f2",
          labelKey: "f2",
          type: "number",
          required: false,
        },
      ],
    };

    registry.register(template1);
    registry.register(template2);

    const all = registry.getAll();
    expect(all.length).toBe(2);
    expect(all.map((t) => t.id)).toContain("t1");
    expect(all.map((t) => t.id)).toContain("t2");
  });
});

// ============================================================================
// ACTIONBUILDER: 6 TESTS
// ============================================================================

describe("ActionBuilder", () => {
  it("debería construir una acción completa", () => {
    const action = new ActionBuilder()
      .withId("action.test.transition")
      .withLabel("action.transition_label")
      .withTransition("lifecycle1", "t1")
      .withEvidence("documento", [])
      .withVisibleRoles(["admin", "user"])
      .build();

    expect(action.id).toBe("action.test.transition");
    expect(action.labelKey).toBe("action.transition_label");
    expect(action.lifecycleId).toBe("lifecycle1");
    expect(action.transitionId).toBe("t1");
    expect(action.requiredEvidenceKind).toBe("documento");
    expect(action.visibleRoles).toContain("admin");
    expect(action.visibleRoles).toContain("user");
  });

  it("debería soportar encadenamiento fluido", () => {
    const builder = new ActionBuilder();
    const result = builder
      .withId("a1")
      .withLabel("label1")
      .withTransition("lc1", "t1")
      .withEvidence("doc", [])
      .withVisibleRoles(["r1"]);

    expect(result).toBe(builder); // Verify fluent chain
  });

  it("debería permitir agregar roles incrementalmente", () => {
    const action = new ActionBuilder()
      .withId("action.test")
      .withLabel("label")
      .withTransition("lc", "t")
      .withEvidence("doc", [])
      .withVisibleRoles(["admin"])
      .addVisibleRole("user")
      .addVisibleRole("guest")
      .build();

    expect(action.visibleRoles.length).toBe(3);
    expect(action.visibleRoles).toContain("guest");
  });

  it("debería lanzar error si falta id", () => {
    const builder = new ActionBuilder()
      .withLabel("label")
      .withTransition("lc", "t")
      .withEvidence("doc", [])
      .withVisibleRoles(["r1"]);

    expect(() => builder.build()).toThrow("debe establecer id");
  });

  it("debería lanzar error si falta labelKey", () => {
    const builder = new ActionBuilder()
      .withId("id")
      .withTransition("lc", "t")
      .withEvidence("doc", [])
      .withVisibleRoles(["r1"]);

    expect(() => builder.build()).toThrow("debe establecer labelKey");
  });

  it("debería validar que visibleRoles no esté vacío", () => {
    expect(() =>
      new ActionBuilder()
        .withVisibleRoles([])
    ).toThrow("debe tener al menos un rol");
  });
});

// ============================================================================
// VIEWBUILDER: 6 TESTS
// ============================================================================

describe("ViewBuilder", () => {
  it("debería construir una vista completa", () => {
    const view = new ViewBuilder()
      .withId("view.test.state")
      .withLabel("view.test_label")
      .forState("lifecycle1", "state1")
      .withKind("tablero")
      .withActions(["action.1", "action.2"])
      .build();

    expect(view.id).toBe("view.test.state");
    expect(view.labelKey).toBe("view.test_label");
    expect(view.stateId).toBe("state1");
    expect(view.lifecycleId).toBe("lifecycle1");
    expect(view.kind).toBe("tablero");
    expect(view.actionIds).toContain("action.1");
    expect(view.actionIds).toContain("action.2");
  });

  it("debería soportar encadenamiento fluido", () => {
    const builder = new ViewBuilder();
    const result = builder
      .withId("v1")
      .withLabel("l1")
      .forState("lc1", "s1")
      .withKind("tablero");

    expect(result).toBe(builder);
  });

  it("debería permitir agregar acciones incrementalmente", () => {
    const view = new ViewBuilder()
      .withId("view.test")
      .withLabel("label")
      .forState("lc", "s")
      .withKind("tablero")
      .addAction("action.1")
      .addAction("action.2")
      .build();

    expect(view.actionIds.length).toBe(2);
  });

  it("debería retornar actionIds ordenados", () => {
    const view = new ViewBuilder()
      .withId("v")
      .withLabel("l")
      .forState("lc", "s")
      .withKind("tablero")
      .addAction("z_action")
      .addAction("a_action")
      .build();

    expect(view.actionIds[0]).toBe("a_action");
    expect(view.actionIds[1]).toBe("z_action");
  });

  it("debería lanzar error si falta id", () => {
    const builder = new ViewBuilder()
      .withLabel("l")
      .forState("lc", "s")
      .withKind("tablero");

    expect(() => builder.build()).toThrow("debe establecer id");
  });

  it("debería lanzar error si falta kind", () => {
    const builder = new ViewBuilder()
      .withId("v")
      .withLabel("l")
      .forState("lc", "s");

    expect(() => builder.build()).toThrow("debe establecer kind");
  });
});

// ============================================================================
// FORMBUILDER: 2 TESTS
// ============================================================================

describe("FormBuilder", () => {
  it("debería construir un formulario completo", () => {
    const form = new FormBuilder()
      .withId("form.test")
      .forEntity("test_entity")
      .addField({
        name: "field1",
        labelKey: "field1.label",
        type: "string",
        required: true,
      })
      .addField({
        name: "field2",
        labelKey: "field2.label",
        type: "number",
        required: false,
      })
      .build();

    expect(form.id).toBe("form.test");
    expect(form.entityKind).toBe("test_entity");
    expect(form.fields.length).toBe(2);
  });

  it("debería lanzar error si no tiene campos", () => {
    const builder = new FormBuilder()
      .withId("form.test")
      .forEntity("entity");

    expect(() => builder.build()).toThrow("debe tener al menos un campo");
  });
});

// ============================================================================
// PLUGINSYSTEM: 3 TESTS
// ============================================================================

describe("PluginManager", () => {
  let manager: PluginManager;

  beforeEach(() => {
    manager = new PluginManager();
  });

  it("debería registrar y recuperar un plugin", () => {
    const plugin: GeneratorPlugin = {
      id: "test-plugin",
      name: "Test Plugin",
      version: "1.0.0",
      hooks: {},
    };

    manager.register(plugin);
    const retrieved = manager.getPlugin("test-plugin");

    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe("test-plugin");
  });

  it("debería ejecutar hooks en orden de registro (sync)", () => {
    const order: string[] = [];

    const plugin1: GeneratorPlugin = {
      id: "plugin1",
      name: "Plugin 1",
      version: "1.0",
      hooks: {
        onViewGenerated: (view) => {
          order.push("plugin1");
          return view;
        },
      },
    };

    const plugin2: GeneratorPlugin = {
      id: "plugin2",
      name: "Plugin 2",
      version: "1.0",
      hooks: {
        onViewGenerated: (view) => {
          order.push("plugin2");
          return view;
        },
      },
    };

    manager.register(plugin1);
    manager.register(plugin2);

    const testView: any = {
      id: "view.test",
      labelKey: "test",
      kind: "tablero",
      stateId: null,
      lifecycleId: null,
      actionIds: [],
      admittedPatterns: { listados: [], navegacion: [], formularios: [] },
    };

    manager.executeHookSync("onViewGenerated", testView);

    expect(order).toEqual(["plugin1", "plugin2"]);
  });

  it("debería permitir desregistrar plugins", () => {
    const plugin: GeneratorPlugin = {
      id: "plugin1",
      name: "Plugin 1",
      version: "1.0",
      hooks: {},
    };

    manager.register(plugin);
    expect(manager.size()).toBe(1);

    manager.unregister("plugin1");
    expect(manager.size()).toBe(0);
  });

  it("debería retornar todos los plugins", () => {
    const plugin1: GeneratorPlugin = {
      id: "p1",
      name: "P1",
      version: "1.0",
      hooks: {},
    };

    const plugin2: GeneratorPlugin = {
      id: "p2",
      name: "P2",
      version: "1.0",
      hooks: {},
    };

    manager.register(plugin1);
    manager.register(plugin2);

    const all = manager.getAll();
    expect(all.length).toBe(2);
  });

  it("debería lanzar error si plugin falta id", () => {
    const invalidPlugin: any = {
      name: "Invalid",
      version: "1.0",
      hooks: {},
    };

    expect(() => manager.register(invalidPlugin)).toThrow(
      "Plugin debe tener un id"
    );
  });

  it("debería ejecutar hook async correctamente", async () => {
    const plugin: GeneratorPlugin = {
      id: "async-plugin",
      name: "Async Plugin",
      version: "1.0",
      hooks: {
        onViewGenerated: async (view) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { ...view, id: "modified" };
        },
      },
    };

    manager.register(plugin);

    const testView: any = {
      id: "view.test",
      labelKey: "test",
      kind: "tablero",
      stateId: null,
      lifecycleId: null,
      actionIds: [],
      admittedPatterns: { listados: [], navegacion: [], formularios: [] },
    };

    const result = await manager.executeHook(
      "onViewGenerated",
      testView
    );

    expect(result.id).toBe("modified");
  });
});

// ============================================================================
// PLUGINS DE EJEMPLO
// ============================================================================

describe("Example Plugins", () => {
  it("debería usar el plugin de validación", () => {
    const plugin = createValidationPlugin();
    expect(plugin.id).toBe("validation-plugin");
    expect(plugin.hooks.onFormGenerated).toBeDefined();
  });

  it("debería usar el plugin de auditoría", () => {
    const plugin = createAuditPlugin();
    expect(plugin.id).toBe("audit-plugin");
    expect(plugin.hooks.onViewGenerated).toBeDefined();
    expect(plugin.hooks.onActionGenerated).toBeDefined();
  });

  it("debería usar el plugin de filtro de roles", () => {
    const plugin = createRoleFilterPlugin(["admin", "user"]);
    expect(plugin.id).toBe("role-filter-plugin");
    expect(plugin.hooks.onActionsGenerated).toBeDefined();
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe("Integración Fase 2", () => {
  it("debería generar especificación completa con builders", () => {
    // Crear registro de plantillas
    const formRegistry = FormTemplateRegistry.createDefaults();

    // Generar formularios
    const parteForm = formRegistry.generateForm("form.parte");
    expect(parteForm.id).toBe("form.parte");
    expect(parteForm.fields.length).toBeGreaterThan(0);

    // Crear acciones con builder
    const action = new ActionBuilder()
      .withId("action.test.accept")
      .withLabel("action.accept")
      .withTransition("ciclo_propuesta", "aceptar")
      .withEvidence("documento", [])
      .withVisibleRoles(["vendedor"])
      .build();

    expect(action.id).toBe("action.test.accept");

    // Crear vista con builder
    const view = new ViewBuilder()
      .withId("view.test.propuesta")
      .withLabel("view.propuesta")
      .forState("ciclo_propuesta", "propuesta")
      .withKind("tablero")
      .addAction(action.id)
      .build();

    expect(view.actionIds).toContain("action.test.accept");

    // Verificar que todo es congelado (frozen)
    expect(Object.isFrozen(parteForm.fields)).toBe(true);
    expect(Object.isFrozen(view.actionIds)).toBe(true);
  });

  it("debería soportar extensión con plugins", () => {
    const manager = new PluginManager();
    const auditPlugin = createAuditPlugin();
    manager.register(auditPlugin);

    const action = new ActionBuilder()
      .withId("a1")
      .withLabel("l1")
      .withTransition("lc", "t")
      .withEvidence("doc", [])
      .withVisibleRoles(["r"])
      .build();

    // El plugin debería poder procesar la acción
    const processed = manager.executeHookSync(
      "onActionGenerated",
      action
    );
    expect(processed.id).toBe("a1");
  });

  it("debería mantener compatibilidad backwards con Fase 1", () => {
    // Fase 1: hardcoding de entityForms()
    const hardcodedForms = [
      {
        id: "form.parte",
        entityKind: "parte",
        fields: [
          {
            name: "parte_id",
            labelKey: "field.parte_id",
            type: "reference" as const,
            required: true,
            referenceEntity: "parte",
          },
        ],
      },
    ];

    // Fase 2: usando registry
    const registry = FormTemplateRegistry.createDefaults();
    const generatedForms = [
      registry.generateForm("form.parte"),
    ];

    // Ambos deberían tener la misma estructura
    expect(generatedForms[0]?.id).toBe(hardcodedForms[0]?.id);
    expect(generatedForms[0]?.entityKind).toBe(hardcodedForms[0]?.entityKind);
    expect(generatedForms[0]?.fields[0]?.name).toBe(
      hardcodedForms[0]?.fields[0]?.name
    );
  });

  it("debería permitir definir plantillas custom", () => {
    const registry = new FormTemplateRegistry();

    // Definir plantilla custom
    registry.register({
      id: "form.custom",
      entityKind: "custom_entity",
      fields: [
        {
          id: "custom_field",
          name: "custom_value",
          labelKey: "field.custom",
          type: "string",
          required: true,
        },
      ],
    });

    // Generar desde la plantilla custom
    const form = registry.generateForm("form.custom");
    expect(form.id).toBe("form.custom");
    expect(form.entityKind).toBe("custom_entity");
  });

  it("debería tener determinismo en generación", () => {
    // Primera ejecución
    const registry1 = FormTemplateRegistry.createDefaults();
    const forms1 = registry1.getAll().map((t) => registry1.generateForm(t.id));

    // Segunda ejecución
    const registry2 = FormTemplateRegistry.createDefaults();
    const forms2 = registry2.getAll().map((t) => registry2.generateForm(t.id));

    // Ambas deberían ser idénticas
    expect(forms1.length).toBe(forms2.length);
    expect(forms1.map((f) => f.id).sort()).toEqual(
      forms2.map((f) => f.id).sort()
    );
  });
});
