/**
 * Contabilidad: visualización de asientos, mayor, balance, P&L y cierre de período.
 *
 *   GET /contabilidad?role=...&parte=...
 */

import type { IncomingMessage } from "node:http";
import { formatCentimos } from "../elements/oferta.js";
import {
  esc,
  fecha,
  html,
  identifyGet,
  page,
  text,
  withDev,
  type MaestrosContext,
  type MaestrosResponse,
  type Viewer,
} from "./maestros.js";

export function isContabilidadPath(path: string): boolean {
  return path === "/contabilidad" || path.startsWith("/contabilidad?");
}

export async function handleContabilidad(
  ctx: MaestrosContext,
  req: IncomingMessage,
): Promise<MaestrosResponse> {
  const url = new URL(req.url ?? "/", "http://local");
  const query = Object.fromEntries(url.searchParams.entries());
  const who = identifyGet(ctx, req, query);
  if ("response" in who) return who.response;
  const viewer = who.viewer;

  const desde = query.desde || null;
  const hasta = query.hasta || null;
  const cuentaParam = query.cuenta || null;

  // Asientos contables
  const asientos = ctx.runtime.asientos?.todos(ctx.boot.tenantId, desde, hasta) ?? [];

  // Cuadre
  const cuadre = ctx.runtime.verificarCuadre?.() ?? { cuadrado: false, debitos: 0, creditos: 0 };

  // Balance (Estado de situación)
  const balance = ctx.runtime.obtenerBalance?.() ?? { activo: 0, pasivo: 0, capital: 0 };

  // P&L (Estado de resultados)
  const pyL = ctx.runtime.obtenerResultado?.(desde, hasta) ?? { ingresos: 0, gastos: 0 };

  // Mayor contable (por cuenta seleccionada)
  const cuentas = new Set<string>(asientos.flatMap((a) => [a.cuentaDeudora, a.cuentaAcreedora]));
  const cuentaSeleccionada = cuentaParam || (cuentas.size > 0 ? [...cuentas][0] : null);
  const mayor = cuentaSeleccionada ? (ctx.runtime.obtenerMayor?.(cuentaSeleccionada, desde, hasta) ?? []) : [];

  // Períodos cerrados
  const periodos = ctx.runtime.periodos?.obtenerPeriodos?.() ?? [];

  const html_asientos = renderAsientos(asientos, desde, hasta);
  const html_mayor = renderMayor(mayor, cuentaSeleccionada, [...cuentas]);
  const html_cuadre = renderCuadre(cuadre);
  const html_balance = renderBalance(balance);
  const html_pyL = renderPyL(pyL);
  const html_exportar = renderExportar(desde, hasta);
  const html_periodos = renderPeriodos(periodos);

  const contabilidadHtml = html`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Contabilidad</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: system-ui, sans-serif; background: #f5f5f5; color: #333; }
        .header { background: #fff; border-bottom: 1px solid #ddd; padding: 20px; }
        .nav { max-width: 1200px; margin: 0 auto; display: flex; gap: 30px; }
        .nav a { color: #0066cc; text-decoration: none; }
        .nav a:hover { text-decoration: underline; }
        .container { max-width: 1200px; margin: 20px auto; padding: 0 20px; }
        .section { background: #fff; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .section h2 { border-bottom: 2px solid #0066cc; padding-bottom: 10px; margin-bottom: 15px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 14px; }
        th { background: #f0f0f0; text-align: left; padding: 10px; border-bottom: 2px solid #ddd; font-weight: 600; }
        td { padding: 10px; border-bottom: 1px solid #eee; }
        tr:hover { background: #f9f9f9; }
        .cuadrado { color: green; font-weight: bold; }
        .desbalanceado { color: red; font-weight: bold; }
        .info-box { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 15px; }
        .info-item { background: #f9f9f9; padding: 15px; border-radius: 4px; border-left: 4px solid #0066cc; }
        .info-item strong { display: block; margin-bottom: 5px; }
        .form-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 15px; }
        input[type="date"], select { padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
        button { background: #0066cc; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 14px; }
        button:hover { background: #0052a3; }
        .export-btn { background: #666; margin-right: 10px; }
        .export-btn:hover { background: #555; }
        .close-btn { background: #28a745; }
        .close-btn:hover { background: #218838; }
        .empty { color: #999; font-style: italic; text-align: center; padding: 20px; }
        .texto-derecha { text-align: right; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="nav">
          <a href="${withDev(viewer, "/")}">${text("ABS")}</a>
          <a href="${withDev(viewer, "/contabilidad")}">${text("Contabilidad")}</a>
          <a href="${withDev(viewer, "/dinero")}">${text("Dinero")}</a>
        </div>
      </div>

      <div class="container">
        <h1 style="margin-bottom: 20px;">Contabilidad</h1>

        ${html_cuadre}
        ${html_asientos}
        ${html_mayor}
        ${html_balance}
        ${html_pyL}
        ${html_exportar}
        ${html_periodos}
      </div>
    </body>
    </html>
  `;

  return html(200, page(ctx, viewer, "Contabilidad", contabilidadHtml));
}

function renderAsientos(asientos: any[], desde: string | null, hasta: string | null): string {
  return html`
    <div class="section">
      <h2>Asientos Contables</h2>
      <form method="get" style="margin-bottom: 15px;">
        <div class="form-row">
          <label>Desde <input type="date" name="desde" value="${desde || ""}" /></label>
          <label>Hasta <input type="date" name="hasta" value="${hasta || ""}" /></label>
          <div><button type="submit">Filtrar</button></div>
        </div>
      </form>

      ${asientos.length === 0
        ? html`<p class="empty">Sin asientos registrados en este período.</p>`
        : html`
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Asiento</th>
                  <th>Cuenta Deudora</th>
                  <th>Cuenta Acreedora</th>
                  <th class="texto-derecha">Debe</th>
                  <th class="texto-derecha">Haber</th>
                  <th>Concepto</th>
                </tr>
              </thead>
              <tbody>
                ${asientos.map((a) => html`
                  <tr>
                    <td>${esc(fecha(a.fecha))}</td>
                    <td>${esc(String(a.numeroAsiento))}</td>
                    <td>${esc(a.cuentaDeudora)}</td>
                    <td>${esc(a.cuentaAcreedora)}</td>
                    <td class="texto-derecha">${formatCentimos(a.debeCentimos)}</td>
                    <td class="texto-derecha">${formatCentimos(a.haberCentimos)}</td>
                    <td>${esc(a.concepto)}</td>
                  </tr>
                `)}
              </tbody>
            </table>
          `}
    </div>
  `;
}

function renderMayor(mayor: any[], cuentaSeleccionada: string | null, cuentas: string[]): string {
  return html`
    <div class="section">
      <h2>Mayor Contable</h2>
      <form method="get" style="margin-bottom: 15px;">
        <div class="form-row">
          <label>Cuenta
            <select name="cuenta">
              ${cuentas.map((c) => html`
                <option value="${esc(c)}" ${c === cuentaSeleccionada ? "selected" : ""}>${esc(c)}</option>
              `)}
            </select>
          </label>
          <div></div>
          <div><button type="submit">Cargar</button></div>
        </div>
      </form>

      ${!cuentaSeleccionada || mayor.length === 0
        ? html`<p class="empty">Seleccione una cuenta para ver su mayor.</p>`
        : html`
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Asiento</th>
                  <th>Concepto</th>
                  <th class="texto-derecha">Debe</th>
                  <th class="texto-derecha">Haber</th>
                  <th class="texto-derecha">Saldo</th>
                </tr>
              </thead>
              <tbody>
                ${mayor.map((m) => html`
                  <tr>
                    <td>${esc(fecha(m.fecha))}</td>
                    <td>${esc(String(m.numeroAsiento))}</td>
                    <td>${esc(m.concepto)}</td>
                    <td class="texto-derecha">${formatCentimos(m.debeCentimos)}</td>
                    <td class="texto-derecha">${formatCentimos(m.haberCentimos)}</td>
                    <td class="texto-derecha"><strong>${formatCentimos(m.saldoCentimos)}</strong></td>
                  </tr>
                `)}
              </tbody>
            </table>
          `}
    </div>
  `;
}

function renderCuadre(cuadre: any): string {
  const estado = cuadre.cuadrado ? "CUADRADO ✓" : "DESBALANCEADO ✗";
  const clase = cuadre.cuadrado ? "cuadrado" : "desbalanceado";
  const diferencia = Math.abs(cuadre.debitos - cuadre.creditos);

  return html`
    <div class="section">
      <h2>Cuadre Contable</h2>
      <div class="info-box">
        <div class="info-item">
          <strong>Estado</strong>
          <span class="${clase}">${estado}</span>
        </div>
        <div class="info-item">
          <strong>Total Débitos</strong>
          ${formatCentimos(cuadre.debitos)}
        </div>
        <div class="info-item">
          <strong>Total Créditos</strong>
          ${formatCentimos(cuadre.creditos)}
        </div>
      </div>
      ${!cuadre.cuadrado
        ? html`
            <p style="color: red; font-weight: bold;">
              ⚠️ Diferencia: ${formatCentimos(diferencia)}
            </p>
          `
        : html``}
    </div>
  `;
}

function renderBalance(balance: any): string {
  return html`
    <div class="section">
      <h2>Balance (Estado de Situación)</h2>
      <table>
        <thead>
          <tr>
            <th>Concepto</th>
            <th class="texto-derecha">Valor</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>ACTIVO</strong> (Cuentas 1xxx)</td>
            <td class="texto-derecha"><strong>${formatCentimos(balance.activo)}</strong></td>
          </tr>
          <tr>
            <td><strong>PASIVO</strong> (Cuentas 2xxx)</td>
            <td class="texto-derecha"><strong>${formatCentimos(balance.pasivo)}</strong></td>
          </tr>
          <tr>
            <td><strong>CAPITAL</strong> (Cuentas 3xxx)</td>
            <td class="texto-derecha"><strong>${formatCentimos(balance.capital)}</strong></td>
          </tr>
          <tr style="border-top: 2px solid #0066cc;">
            <td><strong>VERIFICACIÓN: Activo = Pasivo + Capital</strong></td>
            <td class="texto-derecha">
              ${balance.activo === balance.pasivo + balance.capital ? "✓ CUADRA" : "✗ NO CUADRA"}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderPyL(pyL: any): string {
  const resultado = pyL.ingresos - pyL.gastos;
  const clase = resultado >= 0 ? "cuadrado" : "desbalanceado";

  return html`
    <div class="section">
      <h2>P&L (Estado de Resultados)</h2>
      <table>
        <thead>
          <tr>
            <th>Concepto</th>
            <th class="texto-derecha">Valor</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>INGRESOS</strong> (Cuentas 4xxx)</td>
            <td class="texto-derecha"><strong>${formatCentimos(pyL.ingresos)}</strong></td>
          </tr>
          <tr>
            <td><strong>GASTOS</strong> (Cuentas 5xxx)</td>
            <td class="texto-derecha"><strong>${formatCentimos(pyL.gastos)}</strong></td>
          </tr>
          <tr style="border-top: 2px solid #0066cc;">
            <td><strong>RESULTADO NETO</strong></td>
            <td class="texto-derecha"><strong class="${clase}">${formatCentimos(resultado)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderExportar(desde: string | null, hasta: string | null): string {
  return html`
    <div class="section">
      <h2>Exportación</h2>
      <form method="get" style="margin-bottom: 15px;">
        <div class="form-row">
          <label>Desde <input type="date" name="desde" value="${desde || ""}" /></label>
          <label>Hasta <input type="date" name="hasta" value="${hasta || ""}" /></label>
          <div></div>
        </div>
      </form>
      <button class="export-btn" onclick="alert('Función no implementada')">📥 Descargar CSV</button>
      <button class="export-btn" onclick="alert('Función no implementada')">📥 Descargar JSON</button>
    </div>
  `;
}

function renderPeriodos(periodos: any[]): string {
  return html`
    <div class="section">
      <h2>Cierre de Período</h2>
      <form method="post" action="/contabilidad/cerrar" style="margin-bottom: 15px;">
        <div class="form-row">
          <label>Fecha de cierre <input type="date" name="fechaCierre" required /></label>
          <div></div>
          <div><button type="submit" class="close-btn">Cerrar Período</button></div>
        </div>
      </form>

      ${periodos.length === 0
        ? html`<p class="empty">Sin períodos cerrados.</p>`
        : html`
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Asiento de Cierre</th>
                </tr>
              </thead>
              <tbody>
                ${periodos.map((p) => html`
                  <tr>
                    <td>${esc(fecha(p.fecha))}</td>
                    <td><strong>${esc(p.estado)}</strong></td>
                    <td>${p.asientoCierre ? esc(String(p.asientoCierre)) : "—"}</td>
                  </tr>
                `)}
              </tbody>
            </table>
          `}
    </div>
  `;
}
