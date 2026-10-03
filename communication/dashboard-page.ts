/**
 * Página HTML del dashboard de notificaciones.
 * Interfaz para ver estado de notificaciones, filtrar y reintentar.
 */

export function renderDashboardNotificacionesHtml(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard de Notificaciones</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }

    .contenedor {
      max-width: 1200px;
      margin: 0 auto;
    }

    .encabezado {
      background: white;
      padding: 30px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .encabezado h1 {
      color: #333;
      margin-bottom: 10px;
    }

    .encabezado .subtitulo {
      color: #666;
      font-size: 14px;
    }

    .estadísticas {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-top: 20px;
    }

    .tarjeta-stat {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }

    .tarjeta-stat .número {
      font-size: 32px;
      font-weight: bold;
      margin: 10px 0;
    }

    .tarjeta-stat .etiqueta {
      font-size: 12px;
      opacity: 0.9;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .filtros {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: flex;
      gap: 10px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .filtro-grupo {
      display: flex;
      flex-direction: column;
    }

    .filtro-grupo label {
      font-size: 12px;
      color: #666;
      margin-bottom: 5px;
      font-weight: 600;
    }

    .filtro-grupo select {
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
      background: white;
    }

    .tabla-contenedor {
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th {
      background: #f5f5f5;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      color: #333;
      border-bottom: 1px solid #ddd;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    td {
      padding: 12px;
      border-bottom: 1px solid #eee;
      font-size: 14px;
    }

    tr:hover {
      background: #fafafa;
    }

    .badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }

    .badge-enviado {
      background: #d4edda;
      color: #155724;
    }

    .badge-pendiente {
      background: #fff3cd;
      color: #856404;
    }

    .badge-fallido {
      background: #f8d7da;
      color: #721c24;
    }

    .botón {
      background: #667eea;
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      transition: all 0.3s;
    }

    .botón:hover {
      background: #764ba2;
      transform: translateY(-2px);
    }

    .botón-pequeño {
      padding: 4px 8px;
      font-size: 11px;
    }

    .cargando {
      text-align: center;
      padding: 40px;
      color: #666;
    }

    .error {
      background: #f8d7da;
      color: #721c24;
      padding: 15px;
      border-radius: 4px;
      margin-bottom: 20px;
    }

    .pestaña-config {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .pestaña-config h3 {
      margin-bottom: 15px;
      color: #333;
    }

    .campo-config {
      margin-bottom: 15px;
    }

    .campo-config label {
      display: block;
      margin-bottom: 5px;
      color: #666;
      font-weight: 600;
      font-size: 12px;
    }

    .campo-config input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="contenedor">
    <div class="encabezado">
      <h1>🔔 Dashboard de Notificaciones</h1>
      <div class="subtitulo">Control centralizado de todos tus canales de comunicación</div>
      <div class="estadísticas" id="stats">
        <div class="cargando">Cargando estadísticas...</div>
      </div>
    </div>

    <div class="filtros">
      <div class="filtro-grupo">
        <label>Estado</label>
        <select id="filtroEstado">
          <option value="">Todos</option>
          <option value="enviado">Enviadas</option>
          <option value="pendiente">Pendientes</option>
          <option value="fallido">Fallidas</option>
        </select>
      </div>
      <div class="filtro-grupo">
        <label>Canal</label>
        <select id="filtroCanal">
          <option value="">Todos</option>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="push">Push</option>
          <option value="slack">Slack</option>
          <option value="webhook">Webhook</option>
        </select>
      </div>
      <button class="botón" onclick="cargarNotificaciones()">Filtrar</button>
    </div>

    <div class="tabla-contenedor">
      <table id="tablaNotificaciones">
        <thead>
          <tr>
            <th>Evento</th>
            <th>Canal</th>
            <th>Plantilla</th>
            <th>Estado</th>
            <th>Intentos</th>
            <th>Fecha</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody id="cuerpoTabla">
          <tr><td colspan="7" class="cargando">Cargando notificaciones...</td></tr>
        </tbody>
      </table>
    </div>

    <div class="pestaña-config">
      <h3>⚙️ Configuración de Canales</h3>
      <div id="configChannels"></div>
    </div>
  </div>

  <script>
    async function cargarEstadísticas() {
      try {
        const res = await fetch('/notificaciones/estadísticas');
        const datos = await res.json();

        const htmlStats = \`
          <div class="tarjeta-stat">
            <div class="etiqueta">Enviadas Hoy</div>
            <div class="número">\${datos.hoy.enviadas}</div>
          </div>
          <div class="tarjeta-stat" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
            <div class="etiqueta">Fallidas</div>
            <div class="número">\${datos.hoy.fallidas}</div>
          </div>
          <div class="tarjeta-stat" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">
            <div class="etiqueta">Pendientes</div>
            <div class="número">\${datos.hoy.pendientes}</div>
          </div>
          <div class="tarjeta-stat" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);">
            <div class="etiqueta">Total</div>
            <div class="número">\${datos.hoy.total}</div>
          </div>
        \`;

        document.getElementById('stats').innerHTML = htmlStats;
      } catch (error) {
        console.error('Error cargando estadísticas:', error);
      }
    }

    async function cargarNotificaciones() {
      try {
        const estado = document.getElementById('filtroEstado').value;
        const canal = document.getElementById('filtroCanal').value;

        let url = '/notificaciones?limite=50';
        if (estado) url += \`&estado=\${estado}\`;
        if (canal) url += \`&canal=\${canal}\`;

        const res = await fetch(url);
        const datos = await res.json();

        const html = datos.notificaciones.map(notif => \`
          <tr>
            <td>\${notif.evento}</td>
            <td><strong>\${notif.canal}</strong></td>
            <td>\${notif.plantilla}</td>
            <td><span class="badge badge-\${notif.estado}">\${notif.estado}</span></td>
            <td>\${notif.intentos}</td>
            <td>\${new Date(notif.timestamp).toLocaleString('es')}</td>
            <td>
              \${notif.estado === 'fallido' ? \`
                <button class="botón botón-pequeño" onclick="reintentarNotificación('\${notif.id}')">Reintentar</button>
              \` : ''}
            </td>
          </tr>
        \`).join('');

        document.getElementById('cuerpoTabla').innerHTML = html || '<tr><td colspan="7" style="text-align: center; color: #999;">No hay notificaciones</td></tr>';
      } catch (error) {
        console.error('Error cargando notificaciones:', error);
        document.getElementById('cuerpoTabla').innerHTML = '<tr><td colspan="7" class="error">Error cargando notificaciones</td></tr>';
      }
    }

    async function reintentarNotificación(id) {
      try {
        const res = await fetch(\`/notificaciones/\${id}/reintentar\`, { method: 'POST' });
        if (res.ok) {
          alert('Reintentando notificación...');
          cargarNotificaciones();
        }
      } catch (error) {
        alert('Error reintentando: ' + error.message);
      }
    }

    // Carga inicial
    cargarEstadísticas();
    cargarNotificaciones();

    // Actualizar cada 30 segundos
    setInterval(() => {
      cargarEstadísticas();
      cargarNotificaciones();
    }, 30000);
  </script>
</body>
</html>`;
}
