/**
 * Tests para módulo de Análisis: Query builder, exportación y análisis temporal.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { MotorQueryBuilder } from "../policies/analisis-query-builder.js";
import { MotorExportAnalísis, type DatosExportacion } from "../policies/analisis-export.js";
import { MotorAnálisisTemporal, type PuntoSerie } from "../policies/analisis-temporal.js";
import { SqliteAnalisisStore } from "../adapters/sqlite-analisis-store.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

describe("Módulo de Análisis de Datos - Fase Complementaria", () => {
  describe("MotorQueryBuilder", () => {
    it("crea consultas personalizadas", () => {
      const motor = new MotorQueryBuilder();

      const consulta = motor.crearConsulta(
        "Ventas por región",
        "ventas",
        ["region", "total", "cantidad"],
        "Reporte de ventas agregadas"
      );

      expect(consulta.id).toBeTruthy();
      expect(consulta.nombre).toBe("Ventas por región");
      expect(consulta.tabla).toBe("ventas");
      expect(consulta.campos.length).toBe(3);
    });

    it("agrega filtros WHERE a consultas", () => {
      const motor = new MotorQueryBuilder();
      let consulta = motor.crearConsulta("Test", "tabla", ["col1"]);

      consulta = motor.agregarFiltro(consulta, "estado", "=", "activo");
      consulta = motor.agregarFiltro(consulta, "monto", ">", 1000);

      expect(consulta.filtros.length).toBe(2);
      expect(consulta.filtros[0]!.operador).toBe("=");
    });

    it("genera SQL correctamente", () => {
      const motor = new MotorQueryBuilder();
      let consulta = motor.crearConsulta("Test", "pedidos", ["id", "monto", "fecha"]);

      consulta = motor.agregarFiltro(consulta, "estado", "=", "completado");
      consulta = motor.ordenarPor(consulta, "fecha", "DESC");

      const sql = motor.generarSQL(consulta);

      expect(sql).toContain("SELECT");
      expect(sql).toContain("FROM pedidos");
      expect(sql).toContain("WHERE");
      expect(sql).toContain("ORDER BY");
    });

    it("agrega agregaciones", () => {
      const motor = new MotorQueryBuilder();
      let consulta = motor.crearConsulta("Totales", "ventas", []);

      consulta = motor.agregarAgregacion(consulta, "SUM", "monto", "total_ventas");
      consulta = motor.agregarAgregacion(consulta, "COUNT", "id", "total_registros");

      const sql = motor.generarSQL(consulta);

      expect(sql).toContain("SUM(monto)");
      expect(sql).toContain("COUNT(id)");
    });

    it("agrupa resultados", () => {
      const motor = new MotorQueryBuilder();
      let consulta = motor.crearConsulta("Por categoría", "productos", ["categoria"]);

      consulta = motor.agregarAgregacion(consulta, "COUNT", "id", "total");
      consulta = motor.agruparPor(consulta, ["categoria"]);

      const sql = motor.generarSQL(consulta);

      expect(sql).toContain("GROUP BY categoria");
    });

    it("establecer límite de resultados", () => {
      const motor = new MotorQueryBuilder();
      let consulta = motor.crearConsulta("Top 10", "tabla", ["col"]);

      consulta = motor.establecerLimite(consulta, 10);

      const sql = motor.generarSQL(consulta);

      expect(sql).toContain("LIMIT 10");
    });

    it("guarda y recupera consultas", () => {
      const motor = new MotorQueryBuilder();
      const consulta = motor.crearConsulta("Mi consulta", "tabla", ["col"]);

      motor.guardarConsulta(consulta);
      const recuperada = motor.obtenerConsulta(consulta.id);

      expect(recuperada).toBeDefined();
      expect(recuperada!.nombre).toBe("Mi consulta");
    });

    it("ejecuta consultas y genera SQL", () => {
      const motor = new MotorQueryBuilder();
      let consulta = motor.crearConsulta("Test", "tabla", ["col"]);

      const resultado = motor.ejecutar(consulta);

      expect(resultado.sql).toBeTruthy();
      expect(resultado.resultado).toContain("ejecutada");
    });

    it("mantiene histórico de consultas ejecutadas", () => {
      const motor = new MotorQueryBuilder();
      const consulta1 = motor.crearConsulta("C1", "t1", []);
      const consulta2 = motor.crearConsulta("C2", "t2", []);

      motor.ejecutar(consulta1);
      motor.ejecutar(consulta2);

      const historico = motor.obtenerHistoricoConsultas();

      expect(historico.length).toBe(2);
    });
  });

  describe("MotorExportAnalísis", () => {
    const datosEjemplo: DatosExportacion = {
      columnas: ["id", "nombre", "valor"],
      filas: [
        { id: 1, nombre: "Producto A", valor: 100 },
        { id: 2, nombre: "Producto B", valor: 200 },
      ],
    };

    it("exporta a CSV", () => {
      const motor = new MotorExportAnalísis();

      const csv = motor.exportarCSV(datosEjemplo);

      expect(csv).toContain("id,nombre,valor");
      expect(csv).toContain("1,Producto A,100");
      expect(csv).toContain("2,Producto B,200");
    });

    it("exporta a JSON", () => {
      const motor = new MotorExportAnalísis();

      const json = motor.exportarJSON(datosEjemplo);
      const parsed = JSON.parse(json);

      expect(parsed.columnas).toEqual(["id", "nombre", "valor"]);
      expect(parsed.total).toBe(2);
      expect(parsed.datos.length).toBe(2);
    });

    it("exporta a SQL", () => {
      const motor = new MotorExportAnalísis();

      const sql = motor.exportarSQL(datosEjemplo, "productos");

      expect(sql).toContain("INSERT INTO productos");
      expect(sql).toContain("VALUES");
      expect(sql).toContain("Producto A");
    });

    it("exporta código Python con Pandas", () => {
      const motor = new MotorExportAnalísis();

      const python = motor.exportarPython(datosEjemplo);

      expect(python).toContain("import pandas");
      expect(python).toContain("df.to_csv");
      expect(python).toContain("df.to_excel");
    });

    it("exporta formato Power BI", () => {
      const motor = new MotorExportAnalísis();

      const powerBi = motor.exportarPowerBI(datosEjemplo);

      expect(powerBi).toContain("let");
      expect(powerBi).toContain("Fuente");
      expect(powerBi).toContain("Json.Document");
    });

    it("programa exportaciones automáticas", () => {
      const motor = new MotorExportAnalísis();

      const exportacion = motor.programarExportación(
        "Export diario",
        "SELECT * FROM ventas",
        ["CSV", "JSON"],
        "diaria"
      );

      expect(exportacion.id).toBeTruthy();
      expect(exportacion.activa).toBe(true);
      expect(exportacion.frecuencia).toBe("diaria");
    });

    it("desactiva exportaciones", () => {
      const motor = new MotorExportAnalísis();

      const exportacion = motor.programarExportación(
        "Test",
        "SELECT *",
        ["CSV"],
        "diaria"
      );

      motor.desactivarExportacion(exportacion.id);

      const todas = motor.obtenerExportacionesProgramadas();
      const desactivada = todas.find(e => e.id === exportacion.id);

      expect(desactivada!.activa).toBe(false);
    });
  });

  describe("MotorAnálisisTemporal", () => {
    const generarSerie = (n: number, base: number = 100): PuntoSerie[] => {
      const serie: PuntoSerie[] = [];
      const ahora = new Date();
      for (let i = 0; i < n; i++) {
        const fecha = new Date(ahora);
        fecha.setDate(fecha.getDate() - (n - i));
        serie.push({
          fecha,
          valor: base + i * 5 + Math.random() * 10,
        });
      }
      return serie;
    };

    it("analiza tendencias", () => {
      const serie = generarSerie(10, 100);

      const motor = new MotorAnálisisTemporal();
      const tendencia = motor.analizarTendencia(serie);

      expect(tendencia.pendiente).toBeTruthy();
      expect(["ascendente", "descendente", "plana"]).toContain(
        tendencia.direccion
      );
      expect(typeof tendencia.fuerte).toBe("boolean");
    });

    it("detecta anomalías con Z-score", () => {
      const serie: PuntoSerie[] = [];
      const ahora = new Date();
      for (let i = 0; i < 10; i++) {
        const fecha = new Date(ahora);
        fecha.setDate(fecha.getDate() - (10 - i));
        serie.push({
          fecha,
          valor: 100,
        });
      }
      // Agregar anomalía
      const puntoCinco = serie[5]!;
      serie[5] = { fecha: puntoCinco.fecha, valor: 500 };

      const motor = new MotorAnálisisTemporal();
      const anomalias = motor.detectarAnomalías(serie);

      expect(anomalias.length).toBeGreaterThan(0);
      expect(anomalias[0]!.tipo).toBe("pico");
    });

    it("compara periodos", () => {
      const periodo1 = generarSerie(5, 100);
      const periodo2 = generarSerie(5, 120);

      const motor = new MotorAnálisisTemporal();
      const comparacion = motor.compararPeríodos(periodo2, periodo1);

      expect(comparacion.cambioPromedio).toBeTruthy();
      expect(comparacion.cambioMaximo).toBeTruthy();
      expect(comparacion.cambioMinimo).toBeTruthy();
      expect(typeof comparacion.mejora).toBe("boolean");
    });

    it("proyecta tendencias futuras", () => {
      const serie = generarSerie(10, 100);

      const motor = new MotorAnálisisTemporal();
      const proyecciones = motor.proyectarTendencia(serie, 5);

      expect(proyecciones.length).toBe(5);
      expect(proyecciones[0]!.valorEsperado).toBeTruthy();
      expect(proyecciones[0]!.intervaloMin).toBeTruthy();
      expect(proyecciones[0]!.intervaloMax).toBeTruthy();
      expect(proyecciones[0]!.intervaloMin <= proyecciones[0]!.valorEsperado).toBe(
        true
      );
      expect(proyecciones[0]!.valorEsperado <= proyecciones[0]!.intervaloMax).toBe(
        true
      );
    });
  });

  describe("SqliteAnalisisStore", () => {
    it("guarda y recupera consultas", () => {
      const dir = mkdtempSync(join(tmpdir(), "abs-analisis-"));
      dirs.push(dir);
      const store = new SqliteAnalisisStore(join(dir, "db.sqlite"));

      const motor = new MotorQueryBuilder();
      const consulta = motor.crearConsulta("Test", "tabla", ["col"]);

      store.guardarConsulta(consulta);

      const recuperada = store.obtenerConsulta(consulta.id);

      expect(recuperada).toBeDefined();
      expect(recuperada!.nombre).toBe("Test");
      expect(recuperada!.tabla).toBe("tabla");

      store.close();
    });

    it("registra ejecuciones de consultas (append-only)", () => {
      const dir = mkdtempSync(join(tmpdir(), "abs-analisis-"));
      dirs.push(dir);
      const store = new SqliteAnalisisStore(join(dir, "db.sqlite"));

      // Sin consultaId (sin constraint FK)
      store.registrarEjecucionConsulta(
        undefined,
        "SELECT * FROM tabla",
        100,
        50
      );
      store.registrarEjecucionConsulta(
        undefined,
        "SELECT * FROM tabla WHERE id > 50",
        50,
        30
      );

      const historico = store.obtenerHistoricoConsultas();

      expect(historico.length).toBe(2);
      // Verificar que están en orden DESC (más reciente primero)
      expect(historico[0]!.filasProcessadas).toBe(50);
      expect(historico[1]!.filasProcessadas).toBe(100);

      store.close();
    });

    it("guarda datasets para Power BI", () => {
      const dir = mkdtempSync(join(tmpdir(), "abs-analisis-"));
      dirs.push(dir);
      const store = new SqliteAnalisisStore(join(dir, "db.sqlite"));

      const datasetId = store.guardarDatasetBI(
        "Dataset ventas",
        "Datos de ventas mensuales",
        "id,monto,fecha\n1,1000,2026-01-01",
        "CSV"
      );

      const dataset = store.obtenerDataset(datasetId);

      expect(dataset).toBeDefined();
      expect(dataset!.nombre).toBe("Dataset ventas");
      expect(dataset!.contenido).toContain("monto");

      store.close();
    });

    it("lista todos los datasets", () => {
      const dir = mkdtempSync(join(tmpdir(), "abs-analisis-"));
      dirs.push(dir);
      const store = new SqliteAnalisisStore(join(dir, "db.sqlite"));

      store.guardarDatasetBI("DS1", "Desc", "contenido", "CSV");
      store.guardarDatasetBI("DS2", "Desc", "contenido", "JSON");

      const datasets = store.obtenerTodosLosDatasets();

      expect(datasets.length).toBe(2);
      expect(datasets[0]!.nombre).toBeTruthy();

      store.close();
    });
  });
});
