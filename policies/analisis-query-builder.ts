/**
 * Motor Query Builder: Construcción visual de consultas SQL,
 * filtros, agregaciones y ejecución.
 */

export type TipoOperador = "=" | "!=" | ">" | "<" | ">=" | "<=" | "LIKE" | "IN" | "BETWEEN";
export type TipoAgregacion = "COUNT" | "SUM" | "AVG" | "MIN" | "MAX";

export interface Filtro {
  readonly campo: string;
  readonly operador: TipoOperador;
  readonly valor: string | number | (string | number)[];
}

export interface Agregacion {
  readonly tipo: TipoAgregacion;
  readonly campo: string;
  readonly alias: string;
}

export interface ConsultaGuardada {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly tabla: string;
  readonly campos: readonly string[];
  readonly filtros: readonly Filtro[];
  readonly agregaciones: readonly Agregacion[];
  readonly agrupaPor: readonly string[];
  readonly ordenaPor: readonly { campo: string; direccion: "ASC" | "DESC" }[];
  readonly limite?: number;
  readonly fechaCreacion: Date;
  readonly frecuencia: "manual" | "diaria" | "semanal" | "mensual";
}

export class MotorQueryBuilder {
  private consultasGuardadas = new Map<string, ConsultaGuardada>();
  private historicoConsultas: string[] = [];

  crearConsulta(
    nombre: string,
    tabla: string,
    campos: string[],
    descripcion?: string
  ): ConsultaGuardada {
    const id = `consulta-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const consulta: ConsultaGuardada = {
      id,
      nombre,
      descripcion: descripcion || "",
      tabla,
      campos,
      filtros: [],
      agregaciones: [],
      agrupaPor: [],
      ordenaPor: [],
      fechaCreacion: new Date(),
      frecuencia: "manual",
    };

    this.consultasGuardadas.set(id, consulta);
    return consulta;
  }

  agregarFiltro(
    consulta: ConsultaGuardada,
    campo: string,
    operador: TipoOperador,
    valor: string | number | (string | number)[]
  ): ConsultaGuardada {
    const filtro: Filtro = { campo, operador, valor };

    return {
      ...consulta,
      filtros: [...consulta.filtros, filtro],
    };
  }

  agregarAgregacion(
    consulta: ConsultaGuardada,
    tipo: TipoAgregacion,
    campo: string,
    alias: string
  ): ConsultaGuardada {
    const agregacion: Agregacion = { tipo, campo, alias };

    return {
      ...consulta,
      agregaciones: [...consulta.agregaciones, agregacion],
    };
  }

  agruparPor(consulta: ConsultaGuardada, campos: string[]): ConsultaGuardada {
    return {
      ...consulta,
      agrupaPor: campos,
    };
  }

  ordenarPor(
    consulta: ConsultaGuardada,
    campo: string,
    direccion: "ASC" | "DESC" = "ASC"
  ): ConsultaGuardada {
    return {
      ...consulta,
      ordenaPor: [...consulta.ordenaPor, { campo, direccion }],
    };
  }

  establecerLimite(consulta: ConsultaGuardada, limite: number): ConsultaGuardada {
    return {
      ...consulta,
      limite,
    };
  }

  generarSQL(consulta: ConsultaGuardada): string {
    const camposSelect = consulta.campos.length > 0
      ? consulta.campos.join(", ")
      : "*";

    const agregacionesSQL = consulta.agregaciones
      .map(a => `${a.tipo}(${a.campo}) AS ${a.alias}`)
      .join(", ");

    const selectSQL = agregacionesSQL
      ? `SELECT ${camposSelect}, ${agregacionesSQL}`
      : `SELECT ${camposSelect}`;

    let sql = `${selectSQL} FROM ${consulta.tabla}`;

    // WHERE clause
    if (consulta.filtros.length > 0) {
      const where = consulta.filtros
        .map(f => this.construirFiltroSQL(f))
        .join(" AND ");
      sql += ` WHERE ${where}`;
    }

    // GROUP BY
    if (consulta.agrupaPor.length > 0) {
      sql += ` GROUP BY ${consulta.agrupaPor.join(", ")}`;
    }

    // ORDER BY
    if (consulta.ordenaPor.length > 0) {
      const orderClauses = consulta.ordenaPor
        .map(o => `${o.campo} ${o.direccion}`)
        .join(", ");
      sql += ` ORDER BY ${orderClauses}`;
    }

    // LIMIT
    if (consulta.limite) {
      sql += ` LIMIT ${consulta.limite}`;
    }

    return sql;
  }

  private construirFiltroSQL(filtro: Filtro): string {
    const { campo, operador, valor } = filtro;

    if (operador === "LIKE") {
      return `${campo} LIKE '%${valor}%'`;
    }
    if (operador === "IN") {
      const valores = Array.isArray(valor)
        ? valor.map(v => `'${v}'`).join(",")
        : `'${valor}'`;
      return `${campo} IN (${valores})`;
    }
    if (operador === "BETWEEN" && Array.isArray(valor) && valor.length === 2) {
      return `${campo} BETWEEN ${valor[0]} AND ${valor[1]}`;
    }

    return `${campo} ${operador} '${valor}'`;
  }

  ejecutar(consulta: ConsultaGuardada): { resultado: string; sql: string } {
    const sql = this.generarSQL(consulta);
    this.historicoConsultas.push(sql);

    return {
      resultado: `Consulta ejecutada: ${consulta.campos.length} campos de ${consulta.tabla}`,
      sql,
    };
  }

  guardarConsulta(consulta: ConsultaGuardada): void {
    this.consultasGuardadas.set(consulta.id, consulta);
  }

  obtenerConsultasDisponibles(): ConsultaGuardada[] {
    return Array.from(this.consultasGuardadas.values());
  }

  obtenerConsulta(id: string): ConsultaGuardada | undefined {
    return this.consultasGuardadas.get(id);
  }

  eliminarConsulta(id: string): void {
    this.consultasGuardadas.delete(id);
  }

  obtenerHistoricoConsultas(): string[] {
    return [...this.historicoConsultas];
  }
}
