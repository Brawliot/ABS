/**
 * Organización de capa 1: sede, equipo, rol y jerarquía → atributos de Actor.
 */

export interface OrgUnit {
  readonly id: string;
  readonly label: string;
}

export interface OrgTeam extends OrgUnit {
  readonly sedeId: string;
}

/** Vinculación de un actor a la organización (se compila a atributos). */
export interface ActorOrgAssignment {
  readonly actorId: string;
  readonly sedeId: string;
  readonly equipoId: string;
  readonly roleId: string;
  /** Superior directo (actorId). */
  readonly reportsTo?: string;
}

export interface OrganizationDef {
  readonly sedes: readonly OrgUnit[];
  readonly equipos: readonly OrgTeam[];
  readonly assignments: readonly ActorOrgAssignment[];
}

/** Atributos de Actor derivados de la organización. */
export interface ActorAttributes {
  readonly actorId: string;
  readonly sedeId: string;
  readonly equipoId: string;
  readonly roleId: string;
  readonly reportsTo?: string;
}

export class OrganizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationError";
  }
}

/**
 * Valida y materializa el directorio de actores (atributos compilados).
 */
export function compileOrganization(
  org: OrganizationDef,
  roleIds: ReadonlySet<string>,
): Readonly<Record<string, ActorAttributes>> {
  const sedeIds = new Set(org.sedes.map((s) => s.id));
  const equipos = new Map(org.equipos.map((e) => [e.id, e]));
  const actorIds = new Set(org.assignments.map((a) => a.actorId));

  for (const e of org.equipos) {
    if (!sedeIds.has(e.sedeId)) {
      throw new OrganizationError(
        `Equipo ${e.id}: sede inexistente "${e.sedeId}"`,
      );
    }
  }

  const directory: Record<string, ActorAttributes> = {};
  for (const a of org.assignments) {
    if (!roleIds.has(a.roleId)) {
      throw new OrganizationError(
        `Actor ${a.actorId}: rol inexistente "${a.roleId}"`,
      );
    }
    if (!sedeIds.has(a.sedeId)) {
      throw new OrganizationError(
        `Actor ${a.actorId}: sede inexistente "${a.sedeId}"`,
      );
    }
    const team = equipos.get(a.equipoId);
    if (!team) {
      throw new OrganizationError(
        `Actor ${a.actorId}: equipo inexistente "${a.equipoId}"`,
      );
    }
    if (team.sedeId !== a.sedeId) {
      throw new OrganizationError(
        `Actor ${a.actorId}: equipo ${a.equipoId} no pertenece a sede ${a.sedeId}`,
      );
    }
    if (a.reportsTo !== undefined && !actorIds.has(a.reportsTo)) {
      throw new OrganizationError(
        `Actor ${a.actorId}: superior "${a.reportsTo}" no está en la organización`,
      );
    }
    if (a.reportsTo === a.actorId) {
      throw new OrganizationError(
        `Actor ${a.actorId}: no puede reportar a sí mismo`,
      );
    }
    directory[a.actorId] = {
      actorId: a.actorId,
      sedeId: a.sedeId,
      equipoId: a.equipoId,
      roleId: a.roleId,
      ...(a.reportsTo !== undefined ? { reportsTo: a.reportsTo } : {}),
    };
  }

  // Detectar ciclos simples en jerarquía
  for (const id of Object.keys(directory)) {
    const seen = new Set<string>();
    let cur: string | undefined = id;
    while (cur) {
      if (seen.has(cur)) {
        throw new OrganizationError(`Ciclo en jerarquía detectado en ${id}`);
      }
      seen.add(cur);
      cur = directory[cur]?.reportsTo;
    }
  }

  return Object.freeze(directory);
}

/** Superior directo de un actor, o undefined si es raíz. */
export function directSuperior(
  directory: Readonly<Record<string, ActorAttributes>>,
  actorId: string,
): string | undefined {
  return directory[actorId]?.reportsTo;
}

/**
 * ¿es `candidateId` el superior directo de `subordinateId`?
 */
export function isDirectSuperior(
  directory: Readonly<Record<string, ActorAttributes>>,
  subordinateId: string,
  candidateId: string,
): boolean {
  return directory[subordinateId]?.reportsTo === candidateId;
}
