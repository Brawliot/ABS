/**
 * JSON Schema (draft-07 style) del documento de políticas de capa 1.
 * Validación estructural antes de compilar.
 */

export const POLICY_DOCUMENT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "abs.policies.document",
  title: "ABS PolicyDocument (capa 1)",
  type: "object",
  additionalProperties: false,
  required: ["id", "version", "companyId", "archetypeId", "roles"],
  properties: {
    id: { type: "string", minLength: 1 },
    version: { type: "string", minLength: 1 },
    companyId: { type: "string", minLength: 1 },
    archetypeId: { type: "string", minLength: 1 },
    roles: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label"],
        properties: {
          id: { type: "string", minLength: 1 },
          label: { type: "string", minLength: 1 },
        },
      },
    },
    organization: {
      type: "object",
      additionalProperties: false,
      required: ["sedes", "equipos", "assignments"],
      properties: {
        sedes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "label"],
            properties: {
              id: { type: "string" },
              label: { type: "string" },
            },
          },
        },
        equipos: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "label", "sedeId"],
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              sedeId: { type: "string" },
            },
          },
        },
        assignments: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["actorId", "sedeId", "equipoId", "roleId"],
            properties: {
              actorId: { type: "string" },
              sedeId: { type: "string" },
              equipoId: { type: "string" },
              roleId: { type: "string" },
              reportsTo: { type: "string" },
            },
          },
        },
      },
    },
    calendar: { type: "object" },
    objectives: { type: "array" },
    classification: { type: "object" },
    permissions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "allowedRoles"],
        properties: {
          id: { type: "string" },
          kind: { const: "permiso" },
          action: {
            enum: ["consultar", "ejecutar", "aprobar", "forzar"],
          },
          transitionId: { type: "string" },
          allowedRoles: {
            type: "array",
            minItems: 1,
            items: { type: "string" },
          },
          visibility: {
            type: "object",
            additionalProperties: false,
            required: ["scope"],
            properties: {
              scope: { enum: ["empresa", "sede", "equipo", "propia"] },
            },
          },
          binding: { $ref: "#/$defs/ruleBinding" },
        },
      },
    },
    policies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "transitionId"],
        properties: {
          id: { type: "string" },
          kind: { const: "politica" },
          transitionId: { type: "string" },
          segment: { type: "string" },
          calculation: {
            type: "object",
            additionalProperties: false,
            required: ["field", "op", "value"],
            properties: {
              field: { type: "string" },
              op: { enum: ["set", "add", "subtract", "multiply"] },
              value: { type: "number" },
              segment: { type: "string" },
            },
          },
          condition: { $ref: "#/$defs/fieldPredicate" },
          restriction: { $ref: "#/$defs/fieldPredicate" },
          factCondition: { $ref: "#/$defs/factBoundCondition" },
          factRestriction: { $ref: "#/$defs/factBoundCondition" },
          requiredFacts: {
            type: "array",
            items: { $ref: "#/$defs/factRequirement" },
          },
          approval: {
            type: "object",
            additionalProperties: false,
            required: ["when"],
            properties: {
              when: { $ref: "#/$defs/fieldPredicate" },
              requiredRole: { type: "string" },
              requiredDirectSuperior: { type: "boolean" },
              transitionId: { type: "string" },
            },
          },
          binding: { $ref: "#/$defs/ruleBinding" },
        },
      },
    },
    compliance: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "transitionId"],
        properties: {
          id: { type: "string" },
          kind: { const: "cumplimiento" },
          transitionId: { type: "string" },
          requiredEvidence: {
            type: "object",
            additionalProperties: false,
            required: ["kind"],
            properties: {
              kind: { enum: ["aceptacion", "sistema", "fisica"] },
              referenceType: { type: "string" },
              requiredRole: { type: "string" },
            },
          },
          invariant: {
            type: "object",
            additionalProperties: false,
            required: ["id", "predicate", "description"],
            properties: {
              id: { type: "string" },
              predicate: { type: "string" },
              appliesInStates: {
                type: "array",
                items: { type: "string" },
              },
              description: { type: "string" },
            },
          },
          binding: { $ref: "#/$defs/ruleBinding" },
        },
      },
    },
  },
  $defs: {
    fieldPredicate: {
      type: "object",
      additionalProperties: false,
      required: ["field", "op"],
      properties: {
        field: { type: "string" },
        op: {
          enum: ["eq", "neq", "gt", "gte", "lt", "lte", "present", "absent"],
        },
        value: {
          oneOf: [
            { type: "number" },
            { type: "string" },
            { type: "boolean" },
          ],
        },
      },
    },
    ruleBinding: {
      type: "object",
      additionalProperties: false,
      required: ["mode"],
      properties: {
        mode: { enum: ["at_create", "on_state", "live"] },
        stateId: { type: "string" },
      },
    },
    factRequirement: {
      type: "object",
      additionalProperties: false,
      required: ["factId", "params"],
      properties: {
        factId: { type: "string" },
        params: {
          type: "object",
          additionalProperties: { type: "string" },
        },
      },
    },
    factBoundCondition: {
      type: "object",
      additionalProperties: false,
      required: ["factId", "params", "op", "value"],
      properties: {
        factId: { type: "string" },
        params: {
          type: "object",
          additionalProperties: { type: "string" },
        },
        amountField: { type: "string" },
        op: { enum: ["eq", "neq", "gt", "gte", "lt", "lte"] },
        value: { type: "number" },
      },
    },
  },
} as const;

/** Claves estructurales prohibidas (intentar mutar la máquina de capa 0). */
export const FORBIDDEN_POLICY_KEYS = [
  "states",
  "transitions",
  "createState",
  "addTransition",
  "newStates",
  "newTransitions",
  "addState",
  "createTransition",
  "lifecycle",
] as const;
