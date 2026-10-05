/**
 * Página HTML del Decision Screen del Wizard
 */

export function renderDecisionScreenHtml(draftJson: string): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Revisar Configuración — Wizard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f5f5f5;
      padding: 20px;
      line-height: 1.6;
    }
    .container { max-width: 1000px; margin: 0 auto; }
    header {
      background: white;
      padding: 30px;
      border-radius: 8px;
      margin-bottom: 30px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    h1 { font-size: 28px; margin-bottom: 10px; color: #1f2937; }
    .subtitle { color: #6b7280; font-size: 16px; }

    .section {
      background: white;
      padding: 30px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    h2 {
      font-size: 20px;
      margin-bottom: 20px;
      color: #1f2937;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 10px;
    }

    .modules-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 15px;
    }

    .module-card {
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 15px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .module-card:hover {
      border-color: #3b82f6;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.1);
    }
    .module-card.checked {
      border-color: #10b981;
      background: #f0fdf4;
    }
    .module-card input[type="checkbox"] {
      margin-right: 10px;
    }
    .module-card label {
      cursor: pointer;
      display: flex;
      align-items: center;
    }
    .module-info {
      margin-top: 8px;
      margin-left: 28px;
      font-size: 14px;
      color: #6b7280;
    }

    .design-preview {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }
    .color-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }
    .color-swatch {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .color-box {
      width: 100%;
      height: 60px;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
    }
    .color-label {
      font-size: 12px;
      color: #6b7280;
      text-align: center;
    }

    .controls {
      background: white;
      padding: 30px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      position: sticky;
      bottom: 0;
    }

    button {
      padding: 12px 24px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    button.primary {
      background: #3b82f6;
      color: white;
    }
    button.primary:hover {
      background: #2563eb;
    }
    button.secondary {
      background: #e5e7eb;
      color: #1f2937;
    }
    button.secondary:hover {
      background: #d1d5db;
    }

    .loading {
      opacity: 0.5;
      pointer-events: none;
    }
    .error {
      background: #fee2e2;
      color: #991b1b;
      padding: 15px;
      border-radius: 6px;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>📋 Revisa tu configuración</h1>
      <p class="subtitle">Confirma o edita lo que hemos generado para ti</p>
    </header>

    <div id="error-container"></div>

    <!-- MÓDULOS -->
    <div class="section">
      <h2>📦 Módulos</h2>
      <div class="modules-grid" id="modules-container"></div>
    </div>

    <!-- DISEÑO -->
    <div class="section">
      <h2>🎨 Diseño</h2>
      <div class="design-preview">
        <div>
          <h3 style="font-size: 14px; margin-bottom: 10px; color: #6b7280;">Paleta de colores</h3>
          <div class="color-grid" id="colors-container"></div>
        </div>
        <div>
          <h3 style="font-size: 14px; margin-bottom: 10px; color: #6b7280;">Tipografía</h3>
          <div id="typography-container"></div>
        </div>
      </div>
    </div>

    <!-- CONFIGURACIÓN -->
    <div class="section">
      <h2>⚙️ Configuración</h2>
      <div id="config-container"></div>
    </div>

    <!-- BOTONES DE ACCIÓN -->
    <div class="controls">
      <button class="secondary" onclick="window.location.href='/'">← Volver</button>
      <button class="primary" id="confirm-btn" onclick="submitDecisions()">Confirmar y Generar ✓</button>
    </div>
  </div>

  <script>
    const draft = ${draftJson};

    function renderModules() {
      const container = document.getElementById('modules-container');
      const allModules = [
        ...draft.modules.detected,
        ...draft.modules.recommended,
        ...draft.modules.optional,
      ];

      container.innerHTML = allModules.map(m => \`
        <div class="module-card checked">
          <label>
            <input type="checkbox" name="module-\${m.id}" value="\${m.id}" checked />
            <strong>\${m.name}</strong>
          </label>
          <div class="module-info">
            \${m.description}
            <br/>
            <strong style="color: \${m.importance === 'critical' ? '#ef4444' : m.importance === 'high' ? '#f59e0b' : '#6b7280'}">\${m.importance}</strong>
          </div>
        </div>
      \`).join('');
    }

    function renderDesign() {
      const colorsContainer = document.getElementById('colors-container');
      colorsContainer.innerHTML = Object.entries(draft.design.colors).map(([name, value]) => \`
        <div class="color-swatch">
          <div class="color-box" style="background: \${value};"></div>
          <span class="color-label">\${name}</span>
        </div>
      \`).join('');

      const typographyContainer = document.getElementById('typography-container');
      typographyContainer.innerHTML = \`
        <p><strong>Familia:</strong> \${draft.design.typography.fontFamily}</p>
        <p><strong>Tema:</strong> \${draft.design.theme === 'light' ? '☀️ Claro' : '🌙 Oscuro'}</p>
        <div style="margin-top: 15px; padding: 15px; background: #f9fafb; border-radius: 6px;">
          <p style="font-size: 14px;">Preview:</p>
          <p style="font-family: \${draft.design.typography.fontFamily}; font-size: 16px; margin-top: 8px;">
            Ejemplo de texto con esta tipografía
          </p>
        </div>
      \`;
    }

    function renderConfig() {
      const container = document.getElementById('config-container');
      const config = draft.config;
      const labels = {
        language: '🌐 Idioma',
        timezone: '🕐 Zona horaria',
        currency: '💱 Moneda',
        region: '📍 Región'
      };

      container.innerHTML = \`
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          \${Object.entries(config).map(([key, value]) => \`
            <div>
              <label style="display: block; margin-bottom: 8px; color: #6b7280; font-size: 14px;">
                \${labels[key] || key}
              </label>
              <input type="text" value="\${value}" readonly style="width: 100%; padding: 8px; border: 1px solid #e5e7eb; border-radius: 4px; background: #f9fafb;" />
            </div>
          \`).join('')}
        </div>
      \`;
    }

    async function submitDecisions() {
      const btn = document.getElementById('confirm-btn');
      btn.classList.add('loading');

      const decisions = {
        modules: {
          approved: Array.from(document.querySelectorAll('input[name^="module-"]:checked')).map(e => e.value),
          rejected: Array.from(document.querySelectorAll('input[name^="module-"]:not(:checked)')).map(e => e.value),
          added: []
        }
      };

      try {
        const response = await fetch('/api/wizard/decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(decisions)
        });

        if (!response.ok) {
          throw new Error(\`Error: \${response.statusText}\`);
        }

        const result = await response.json();
        console.log('✅ Decisiones aplicadas:', result);

        // Redirigir a la app con el primer rol
        const roleId = result.roles?.[0]?.id || 'gerente';
        window.location.href = \`/?role=\${roleId}&parte=parte-demo-1\`;
      } catch (error) {
        const errorContainer = document.getElementById('error-container');
        errorContainer.innerHTML = \`<div class="error">❌ Error: \${error.message}</div>\`;
        btn.classList.remove('loading');
      }
    }

    // Renderizar al cargar
    renderModules();
    renderDesign();
    renderConfig();
  </script>
</body>
</html>`;
}
