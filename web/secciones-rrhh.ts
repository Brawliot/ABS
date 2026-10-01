/**
 * HR Module - UI sections (Layer 4).
 * Employee management, attendance, and payroll views.
 */

import type { Empleado, Nomina, RegistroAsistencia } from "../elements/index.js";

/**
 * Helper: HTML escape.
 */
function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Helper: Format cents as currency.
 */
function formatCentimos(centimos: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(centimos / 100);
}

/**
 * Helper: Calculate hours worked.
 */
function calcularHoras(registro: RegistroAsistencia): string {
  if (!registro.horaSalida || registro.horaEntrada === "--:--") {
    return "-";
  }
  const entradaParts = registro.horaEntrada.split(":");
  const salidaParts = registro.horaSalida.split(":");

  const entradaH = parseInt(entradaParts[0] ?? "0");
  const entradaM = parseInt(entradaParts[1] ?? "0");
  const salidaH = parseInt(salidaParts[0] ?? "0");
  const salidaM = parseInt(salidaParts[1] ?? "0");

  const entrada = entradaH + entradaM / 60;
  const salida = salidaH + salidaM / 60;
  const horas = Math.max(0, salida - entrada);
  return horas.toFixed(2);
}

/**
 * Employee management section.
 */
export function renderSeccionEmpleados(empleados: Empleado[]): string {
  return `
    <section class="rrhh-empleados">
      <h2>Gestión de Empleados</h2>
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Puesto</th>
            <th>Departamento</th>
            <th>Estado</th>
            <th>Email</th>
          </tr>
        </thead>
        <tbody>
          ${empleados
            .map(
              (e) => `
            <tr>
              <td>${esc(e.nombre)}</td>
              <td>${esc(e.puesto)}</td>
              <td>${esc(e.departamento)}</td>
              <td>${e.estadoContrato}</td>
              <td>${esc(e.email)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
      ${
        empleados.length === 0
          ? "<p>No hay empleados registrados.</p>"
          : ""
      }
    </section>
  `;
}

/**
 * Daily attendance section.
 */
export function renderSeccionAsistencia(
  registrosHoy: RegistroAsistencia[],
  empleadoId: string,
): string {
  return `
    <section class="rrhh-asistencia">
      <h2>Registro de Asistencia</h2>
      <form data-action="registrar-entrada">
        <input type="hidden" name="empleadoId" value="${esc(empleadoId)}" />
        <input type="time" name="horaEntrada" required />
        <button type="submit">Registrar Entrada</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Hora Entrada</th>
            <th>Hora Salida</th>
            <th>Horas</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${registrosHoy
            .map(
              (r) => `
            <tr>
              <td>${r.fecha.toISOString().split("T")[0]}</td>
              <td>${r.horaEntrada}</td>
              <td>${r.horaSalida || "-"}</td>
              <td>${calcularHoras(r)}</td>
              <td>${r.estado}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
      ${
        registrosHoy.length === 0
          ? "<p>Sin registros de asistencia.</p>"
          : ""
      }
    </section>
  `;
}

/**
 * Payroll section.
 */
export function renderSeccionNomina(
  nominas: Nomina[],
  periodoActual: string,
): string {
  const totalAPagar = nominas.reduce((sum, n) => sum + n.salarioNeto, 0);

  return `
    <section class="rrhh-nomina">
      <h2>Nómina del Período ${periodoActual}</h2>
      <button data-action="generar-nomina">Generar Nómina</button>
      <table>
        <thead>
          <tr>
            <th>Empleado ID</th>
            <th>Salario Base</th>
            <th>Horas Trabajadas</th>
            <th>Descuentos</th>
            <th>Bonificaciones</th>
            <th>Neto</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${nominas
            .map(
              (n) => `
            <tr>
              <td>${esc(n.empleadoId)}</td>
              <td>${formatCentimos(n.salarioBase)}</td>
              <td>${n.horasTrabajadas}</td>
              <td>${formatCentimos(n.descuentos.afp + n.descuentos.isapre + n.descuentos.impuestoRenta)}</td>
              <td>${formatCentimos(n.bonificaciones)}</td>
              <td><strong>${formatCentimos(n.salarioNeto)}</strong></td>
              <td>${n.estado}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
      <div class="resumen">
        <p><strong>Total a Pagar:</strong> ${formatCentimos(totalAPagar)}</p>
      </div>
      ${nominas.length === 0 ? "<p>Sin nóminas generadas.</p>" : ""}
    </section>
  `;
}

/**
 * Summary report section.
 */
export function renderReporteMensual(
  reporte: {
    nominasGeneradas: number;
    sumaTotal: number;
    promedioSalario: number;
  },
  periodoActual: string,
): string {
  return `
    <section class="rrhh-reporte">
      <h2>Reporte Mensual - ${periodoActual}</h2>
      <div class="reporte-stats">
        <div class="stat">
          <h3>Nóminas Generadas</h3>
          <p class="valor">${reporte.nominasGeneradas}</p>
        </div>
        <div class="stat">
          <h3>Suma Total</h3>
          <p class="valor">${formatCentimos(reporte.sumaTotal)}</p>
        </div>
        <div class="stat">
          <h3>Promedio por Empleado</h3>
          <p class="valor">${formatCentimos(reporte.promedioSalario)}</p>
        </div>
      </div>
    </section>
  `;
}
