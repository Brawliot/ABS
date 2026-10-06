/**
 * Plan page: Business plan summary and overview
 */

export function renderPlanHtml(): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Tu Plan de Negocio</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .plan-container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 600px;
      width: 100%;
      padding: 40px;
      text-align: center;
    }

    .plan-header {
      margin-bottom: 30px;
    }

    .plan-title {
      font-size: 28px;
      font-weight: 700;
      color: #1f2937;
      margin-bottom: 10px;
    }

    .plan-subtitle {
      font-size: 14px;
      color: #6b7280;
      line-height: 1.6;
    }

    .plan-progress {
      margin: 30px 0;
      text-align: left;
    }

    .progress-item {
      display: flex;
      align-items: center;
      margin: 12px 0;
      font-size: 14px;
    }

    .progress-icon {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 12px;
      font-weight: 600;
      color: white;
      font-size: 12px;
    }

    .progress-icon.done {
      background: #10b981;
    }

    .progress-icon.current {
      background: #3b82f6;
    }

    .progress-text {
      flex: 1;
    }

    .progress-label {
      font-weight: 600;
      color: #1f2937;
    }

    .progress-desc {
      font-size: 12px;
      color: #9ca3af;
      margin-top: 2px;
    }

    .plan-actions {
      display: flex;
      gap: 12px;
      margin-top: 30px;
    }

    .plan-btn {
      flex: 1;
      padding: 12px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .plan-btn.primary {
      background: #3b82f6;
      color: white;
    }

    .plan-btn.primary:hover {
      background: #2563eb;
      transform: translateY(-2px);
    }

    .plan-btn.secondary {
      background: #f3f4f6;
      color: #1f2937;
      border: 1px solid #e5e7eb;
    }

    .plan-btn.secondary:hover {
      background: #e5e7eb;
    }

    .plan-status {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      padding: 16px;
      margin: 20px 0;
      color: #166534;
      font-size: 13px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="plan-container">
    <div class="plan-header">
      <div class="plan-title">Tu Plan de Negocio</div>
      <div class="plan-subtitle">
        Has completado el análisis estructurado de tu idea.
        Ahora tienes la base para construir tu plan.
      </div>
    </div>

    <div class="plan-status">
      ✓ Análisis en 5 fases completado
      <br>
      ✓ Dimensiones críticas identificadas
      <br>
      ✓ Estructura de departamentos definida
    </div>

    <div class="plan-progress">
      <div class="progress-item">
        <div class="progress-icon done">✓</div>
        <div class="progress-text">
          <div class="progress-label">Fase 1: Clasificación Inicial</div>
          <div class="progress-desc">Sector, localización, timeline</div>
        </div>
      </div>

      <div class="progress-item">
        <div class="progress-icon done">✓</div>
        <div class="progress-text">
          <div class="progress-label">Fase 2-3: Análisis Profundo</div>
          <div class="progress-desc">4 métricas + Modelo de negocio</div>
        </div>
      </div>

      <div class="progress-item">
        <div class="progress-icon done">✓</div>
        <div class="progress-text">
          <div class="progress-label">Fase 4: Dimensiones Críticas</div>
          <div class="progress-desc">Áreas clave del negocio</div>
        </div>
      </div>

      <div class="progress-item">
        <div class="progress-icon done">✓</div>
        <div class="progress-text">
          <div class="progress-label">Fase 5: Estructura Organizativa</div>
          <div class="progress-desc">Departamentos necesarios</div>
        </div>
      </div>

      <div class="progress-item">
        <div class="progress-icon current">→</div>
        <div class="progress-text">
          <div class="progress-label">Próximo: Plan Detallado</div>
          <div class="progress-desc">Roadmap, hitos, recursos</div>
        </div>
      </div>
    </div>

    <div class="plan-actions">
      <button class="plan-btn primary" onclick="window.location.href='/planner'">
        Nuevo Análisis
      </button>
      <button class="plan-btn secondary" onclick="window.history.back()">
        Atrás
      </button>
    </div>
  </div>
</body>
</html>`;
}
