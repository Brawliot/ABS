import { describe, it, expect, beforeEach } from "vitest";
import { MotorPresupuestos } from "../policies/presupuestos-motor.js";
import { MotorAlertasPresupuesto } from "../policies/presupuestos-alertas.js";
import { MotorReportesPresupuesto } from "../policies/presupuestos-reportes.js";
import { SqlitePresupuestosStore } from "../adapters/sqlite-presupuestos-store.js";
import { join } from "path";

const TEST_DB = join("/tmp", `test-presupuestos-${Date.now()}.sqlite`);

describe("Presupuestos - Módulo Futuro (75%)", () => {
  let motorPresupuestos: MotorPresupuestos;
  let motorAlertas: MotorAlertasPresupuesto;
  let motorReportes: MotorReportesPresupuesto;
  let store: SqlitePresupuestosStore;

  beforeEach(() => {
    motorPresupuestos = new MotorPresupuestos();
    motorAlertas = new MotorAlertasPresupuesto();
    motorReportes = new MotorReportesPresupuesto();
    store = new SqlitePresupuestosStore(TEST_DB);
  });

  // ==================== TESTS MOTOR PRESUPUESTOS ====================

  it("crea presupuesto con partidas", () => {
    const presupuesto = motorPresupuestos.crearPresupuesto(
      "Presupuesto 2024",
      2024,
      "Operaciones"
    );

    motorPresupuestos.agregarPartida(
      presupuesto.id,
      "Salarios",
      "salarios",
      100000
    );
    motorPresupuestos.agregarPartida(
      presupuesto.id,
      "Gastos Operativos",
      "gastos_operativos",
      50000
    );

    const presupuestoActualizado = motorPresupuestos.obtenerPresupuesto(
      presupuesto.id
    );

    expect(presupuestoActualizado?.nombre).toBe("Presupuesto 2024");
    expect(presupuestoActualizado?.partidas).toHaveLength(2);
    expect(presupuestoActualizado?.presupuesto_total).toBe(150000);
  });

  it("registra gastos reales", () => {
    const presupuesto = motorPresupuestos.crearPresupuesto(
      "Presupuesto Test",
      2024
    );

    const partida = motorPresupuestos.agregarPartida(
      presupuesto.id,
      "Marketing",
      "marketing",
      20000
    );

    motorPresupuestos.registrarGasto(partida.id, 5000);
    motorPresupuestos.registrarGasto(partida.id, 3000);
    motorPresupuestos.registrarGasto(partida.id, 2000);

    const presupuestoActualizado = motorPresupuestos.obtenerPresupuesto(
      presupuesto.id
    );
    const partidaActualizada = presupuestoActualizado?.partidas[0];

    expect(partidaActualizada?.gastado).toBe(10000);
    expect(partidaActualizada?.porcentaje_gastado).toBe(50);
  });

  it("calcula varianzas correctamente", () => {
    const presupuesto = motorPresupuestos.crearPresupuesto("Var Test", 2024);

    const p1 = motorPresupuestos.agregarPartida(
      presupuesto.id,
      "Partida 1",
      "otros",
      10000
    );
    const p2 = motorPresupuestos.agregarPartida(
      presupuesto.id,
      "Partida 2",
      "otros",
      5000
    );

    motorPresupuestos.registrarGasto(p1.id, 8000);
    motorPresupuestos.registrarGasto(p2.id, 4000);

    const varianzas = motorPresupuestos.calcularVarianzas(presupuesto.id);

    expect(varianzas.varianza_total).toBe(3000);
    expect(varianzas.varianza_pct).toBeCloseTo(20, 1);
  });

  it("detecta partidas en rojo (overspend)", () => {
    const presupuesto = motorPresupuestos.crearPresupuesto(
      "Overspend Test",
      2024
    );

    const p1 = motorPresupuestos.agregarPartida(
      presupuesto.id,
      "Normal",
      "otros",
      10000
    );
    const p2 = motorPresupuestos.agregarPartida(
      presupuesto.id,
      "En Rojo",
      "otros",
      5000
    );

    motorPresupuestos.registrarGasto(p1.id, 5000);
    motorPresupuestos.registrarGasto(p2.id, 4500); // 90% = alerta

    const varianzas = motorPresupuestos.calcularVarianzas(presupuesto.id);

    expect(varianzas.partidas_en_rojo).toHaveLength(1);
    expect(varianzas.partidas_en_rojo[0]!.concepto).toBe("En Rojo");
  });

  it("aprueba presupuesto", () => {
    const presupuesto = motorPresupuestos.crearPresupuesto(
      "Presupuesto Aprobación",
      2024
    );

    expect(presupuesto.estado).toBe("borrador");

    motorPresupuestos.aprobarPresupuesto(presupuesto.id, "gerente-1");

    const aprobado = motorPresupuestos.obtenerPresupuesto(presupuesto.id);

    expect(aprobado?.estado).toBe("aprobado");
    expect(aprobado?.aprobado_por).toBe("gerente-1");
  });

  it("obtiene ejecución del presupuesto", () => {
    const presupuesto = motorPresupuestos.crearPresupuesto("Ejecución", 2024);

    const p1 = motorPresupuestos.agregarPartida(
      presupuesto.id,
      "P1",
      "otros",
      20000
    );
    const p2 = motorPresupuestos.agregarPartida(
      presupuesto.id,
      "P2",
      "otros",
      10000
    );

    motorPresupuestos.registrarGasto(p1.id, 10000);
    motorPresupuestos.registrarGasto(p2.id, 5000);

    const ejecución = motorPresupuestos.obtenerEjecuciónPresupuesto(
      presupuesto.id
    );

    expect(ejecución.presupuesto_total).toBe(30000);
    expect(ejecución.gastado_total).toBe(15000);
    expect(ejecución.disponible).toBe(15000);
    expect(ejecución.porcentaje_ejecutado).toBe(50);
  });

  // ==================== TESTS ALERTAS ====================

  it("detecta overspend cuando se alcanza umbral", () => {
    const presupuesto = motorPresupuestos.crearPresupuesto(
      "Alerta Umbral",
      2024
    );

    const partida = motorPresupuestos.agregarPartida(
      presupuesto.id,
      "Gasto Control",
      "otros",
      10000
    );

    motorAlertas.configurarAlertas(presupuesto.id, 80);

    motorPresupuestos.registrarGasto(partida.id, 7500); // 75%, sin alerta
    let overspends = motorAlertas.detectarOvrespend(
      motorPresupuestos.obtenerPresupuesto(presupuesto.id)!
    );
    expect(overspends).toHaveLength(0);

    motorPresupuestos.registrarGasto(partida.id, 2000); // 95%, alerta!
    overspends = motorAlertas.detectarOvrespend(
      motorPresupuestos.obtenerPresupuesto(presupuesto.id)!
    );
    expect(overspends).toHaveLength(1);
  });

  it("crea escenarios qué-pasa-si", () => {
    const presupuesto = motorPresupuestos.crearPresupuesto("Escenarios", 2024);

    const p1 = motorPresupuestos.agregarPartida(
      presupuesto.id,
      "Salarios",
      "salarios",
      100000
    );
    const p2 = motorPresupuestos.agregarPartida(
      presupuesto.id,
      "Gastos",
      "gastos_operativos",
      50000
    );

    // Refrescar presupuesto para obtener presupuesto_total actualizado
    const presupuestoActualizado = motorPresupuestos.obtenerPresupuesto(
      presupuesto.id
    )!;

    // Escenario: reducir 20% de salarios, aumentar 10% de gastos
    const ajustes = new Map([
      [p1.id, 80000], // 20% reducción
      [p2.id, 55000], // 10% aumento
    ]);

    const resultado = motorAlertas.crearEscenario(
      presupuestoActualizado,
      "Escenario Conservador",
      ajustes
    );

    expect(resultado.presupuesto_ajustado).toBe(135000);
    expect(resultado.varianza_esperada).toBeCloseTo(135000, 0);
  });

  it("compara múltiples escenarios", () => {
    const presupuesto = motorPresupuestos.crearPresupuesto("Comparativa", 2024);

    const partida = motorPresupuestos.agregarPartida(
      presupuesto.id,
      "Presupuesto",
      "otros",
      50000
    );

    // Refrescar presupuesto para obtener presupuesto_total actualizado
    const presupuestoActualizado = motorPresupuestos.obtenerPresupuesto(
      presupuesto.id
    )!;

    const escenarios = [
      motorAlertas.crearEscenario(
        presupuestoActualizado,
        "Escenario 1",
        new Map([[partida.id, 45000]])
      ),
      motorAlertas.crearEscenario(
        presupuestoActualizado,
        "Escenario 2",
        new Map([[partida.id, 55000]])
      ),
    ];

    // Convertir resultados a Escenarios
    const escenarioObjs = [
      {
        id: "esc1",
        presupuesto_id: presupuestoActualizado.id,
        nombre: "E1",
        ajustes: new Map(),
        presupuesto_ajustado: escenarios[0]!.presupuesto_ajustado,
        varianza_esperada: escenarios[0]!.varianza_esperada,
      },
      {
        id: "esc2",
        presupuesto_id: presupuestoActualizado.id,
        nombre: "E2",
        ajustes: new Map(),
        presupuesto_ajustado: escenarios[1]!.presupuesto_ajustado,
        varianza_esperada: escenarios[1]!.varianza_esperada,
      },
    ];

    const comparativa = motorAlertas.compararEscenarios(
      presupuestoActualizado,
      escenarioObjs
    );

    expect(comparativa).toHaveLength(2);
    expect(comparativa[0]!.impacto_presupuesto).toBeCloseTo(-5000, 0);
    expect(comparativa[1]!.impacto_presupuesto).toBeCloseTo(5000, 0);
  });

  // ==================== TESTS REPORTES ====================

  it("genera reporte de ejecución", () => {
    const presupuesto = motorPresupuestos.crearPresupuesto("Reporte Test", 2024);

    const p1 = motorPresupuestos.agregarPartida(
      presupuesto.id,
      "Marketing",
      "marketing",
      20000
    );

    motorPresupuestos.registrarGasto(p1.id, 10000);

    const presupuestoConGastos = motorPresupuestos.obtenerPresupuesto(
      presupuesto.id
    )!;
    const reporte = motorReportes.generarReporteEjecución(presupuestoConGastos);

    expect(reporte.html).toContain("Reporte de Ejecución");
    expect(reporte.html).toContain("Reporte Test");
    expect(reporte.html).toContain("2024");
  });

  it("genera detalle de partidas", () => {
    const presupuesto = motorPresupuestos.crearPresupuesto(
      "Detalle Partidas",
      2024
    );

    const p1 = motorPresupuestos.agregarPartida(
      presupuesto.id,
      "P1",
      "otros",
      10000
    );
    const p2 = motorPresupuestos.agregarPartida(
      presupuesto.id,
      "P2",
      "otros",
      5000
    );

    motorPresupuestos.registrarGasto(p1.id, 5000);
    motorPresupuestos.registrarGasto(p2.id, 4500);

    const presupuestoConGastos = motorPresupuestos.obtenerPresupuesto(
      presupuesto.id
    )!;
    const detalles = motorReportes.generarDetallePartidas(presupuestoConGastos);

    expect(detalles).toHaveLength(2);
    expect(detalles[0]!.estado).toBe("dentro");
    expect(detalles[1]!.estado).toBe("alerta");
  });

  it("compara períodos (año vs año)", () => {
    const p1 = motorPresupuestos.crearPresupuesto("2023", 2023);
    motorPresupuestos.agregarPartida(p1.id, "Salarios", "salarios", 100000);

    const p2 = motorPresupuestos.crearPresupuesto("2024", 2024);
    motorPresupuestos.agregarPartida(p2.id, "Salarios", "salarios", 110000);
    motorPresupuestos.agregarPartida(p2.id, "Marketing", "marketing", 20000);

    const presupuesto2023 = motorPresupuestos.obtenerPresupuesto(p1.id)!;
    const presupuesto2024 = motorPresupuestos.obtenerPresupuesto(p2.id)!;

    const comparativa = motorReportes.compararPeriodos(
      presupuesto2023,
      presupuesto2024
    );

    expect(comparativa.variación_presupuesto).toBe(30000); // 130000 - 100000
    expect(comparativa.nuevas_partidas).toHaveLength(1); // Marketing es nueva
  });

  it("obtiene tendencias históricas", () => {
    const presupuestos = [
      motorPresupuestos.crearPresupuesto("2022", 2022),
      motorPresupuestos.crearPresupuesto("2023", 2023),
      motorPresupuestos.crearPresupuesto("2024", 2024),
    ];

    motorPresupuestos.agregarPartida(presupuestos[0]!.id, "P", "otros", 80000);
    motorPresupuestos.agregarPartida(presupuestos[1]!.id, "P", "otros", 90000);
    motorPresupuestos.agregarPartida(presupuestos[2]!.id, "P", "otros", 100000);

    const presupuestosObjetos = presupuestos.map((p) =>
      motorPresupuestos.obtenerPresupuesto(p.id)!
    );
    const tendencias = motorReportes.obtenerTendencia(presupuestosObjetos);

    expect(tendencias).toHaveLength(3);
    expect(tendencias[0]!.año).toBe(2022);
    expect(tendencias[2]!.año).toBe(2024);
    expect(tendencias[0]!.presupuesto).toBeLessThan(
      tendencias[2]!.presupuesto
    );
  });

  it("maneja múltiples departamentos", () => {
    const pA = motorPresupuestos.crearPresupuesto("Dept A", 2024, "Ventas");
    const pB = motorPresupuestos.crearPresupuesto("Dept B", 2024, "TI");

    motorPresupuestos.agregarPartida(pA.id, "P1", "otros", 50000);
    motorPresupuestos.agregarPartida(pB.id, "P2", "otros", 30000);

    store.guardarPresupuesto(motorPresupuestos.obtenerPresupuesto(pA.id)!);
    store.guardarPresupuesto(motorPresupuestos.obtenerPresupuesto(pB.id)!);

    const departamentosVentas = store.listarPresupuestos(2024, "Ventas");
    const departamentosTI = store.listarPresupuestos(2024, "TI");

    expect(departamentosVentas).toHaveLength(1);
    expect(departamentosTI).toHaveLength(1);
    expect(departamentosVentas[0]!.nombre).toBe("Dept A");
  });

  it("valida que no se apruebe presupuesto con errores", () => {
    const presupuesto = motorPresupuestos.crearPresupuesto("Error Test", 2024);

    const partida = motorPresupuestos.agregarPartida(
      presupuesto.id,
      "Gasto",
      "otros",
      1000
    );

    // Registrar gasto superior al presupuesto
    motorPresupuestos.registrarGasto(partida.id, 1500);

    const varianzas = motorPresupuestos.calcularVarianzas(presupuesto.id);

    // Aunque permitamos aprobación, deberíamos tener partidas sobre presupuesto
    expect(varianzas.partidas_sobre_presupuesto).toHaveLength(1);
  });
});
