/**
 * Página Planner: Análisis de negocio con Jev + ChatGPT
 */

export function renderPlannerHtml(): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Planner</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    .planner-header {
      padding: 20px 24px;
      border-bottom: 1px solid #e5e7eb;
      flex-shrink: 0;
    }

    .planner-title {
      font-size: 24px;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 4px;
    }

    .planner-subtitle {
      font-size: 14px;
      color: #6b7280;
    }

    .planner-content {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .message {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
    }

    .message.user {
      justify-content: flex-end;
    }

    .message-bubble {
      max-width: 70%;
      padding: 12px 16px;
      border-radius: 12px;
      line-height: 1.5;
      font-size: 14px;
    }

    .message.user .message-bubble {
      background: #3b82f6;
      color: white;
      border-radius: 12px 4px 12px 12px;
    }

    .analysis-message {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
      justify-content: flex-start;
    }

    .analysis-bubble {
      max-width: 85%;
      padding: 16px;
      background: #f3f4f6;
      border-radius: 12px 12px 4px 12px;
      border-left: 4px solid #10b981;
      line-height: 1.6;
    }

    .analysis-header {
      font-size: 14px;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 12px;
    }

    .analysis-metrics {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .metric-item {
      padding: 12px;
      background: white;
      border-radius: 6px;
      border-left: 3px solid #10b981;
    }

    .metric-label {
      font-size: 13px;
      font-weight: 600;
      color: #374151;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    .metric-value {
      font-size: 14px;
      color: #1f2937;
      margin-bottom: 8px;
    }

    .confidence-bar {
      height: 4px;
      background: #e5e7eb;
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 4px;
    }

    .confidence-fill {
      height: 100%;
      background: linear-gradient(90deg, #ef4444, #f97316, #eab308, #22c55e);
      transition: width 0.3s ease;
    }

    .confidence-text {
      font-size: 12px;
      color: #6b7280;
    }

    .question-message {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
      justify-content: flex-start;
    }

    .question-bubble {
      max-width: 85%;
      padding: 16px;
      background: #fef3c7;
      border-radius: 12px 12px 4px 12px;
      border-left: 4px solid #f59e0b;
      line-height: 1.6;
      font-size: 14px;
      color: #78350f;
    }

    .resources-form {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
      justify-content: flex-start;
    }

    .resources-bubble {
      max-width: 85%;
      padding: 16px;
      background: #e0f2fe;
      border-radius: 12px 12px 4px 12px;
      border-left: 4px solid #0284c7;
      line-height: 1.6;
    }

    .resource-field {
      margin-bottom: 16px;
    }

    .resource-label {
      font-size: 13px;
      font-weight: 600;
      color: #1e40af;
      margin-bottom: 6px;
      display: block;
    }

    .resource-input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #0284c7;
      border-radius: 6px;
      font-size: 14px;
      font-family: inherit;
      background: white;
    }

    .resource-input:focus {
      outline: none;
      border-color: #0284c7;
      box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.1);
    }

    .resource-select {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #0284c7;
      border-radius: 6px;
      font-size: 14px;
      font-family: inherit;
      background: white;
      cursor: pointer;
    }

    .resource-range {
      width: 100%;
      cursor: pointer;
    }

    .range-value {
      font-size: 12px;
      color: #0284c7;
      font-weight: 600;
      margin-top: 4px;
    }

    .submit-resources {
      background: #0284c7;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 8px;
    }

    .submit-resources:hover {
      background: #0369a1;
    }

    .submit-resources:disabled {
      background: #cbd5e1;
      cursor: not-allowed;
    }

    .loading {
      display: flex;
      gap: 4px;
      align-items: center;
    }

    .loading-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #9ca3af;
      animation: bounce 1.4s infinite;
    }

    .loading-dot:nth-child(2) {
      animation-delay: 0.2s;
    }

    .loading-dot:nth-child(3) {
      animation-delay: 0.4s;
    }

    @keyframes bounce {
      0%, 80%, 100% { transform: translateY(0); }
      40% { transform: translateY(-8px); }
    }

    .planner-footer {
      padding: 16px 24px;
      border-top: 1px solid #e5e7eb;
      flex-shrink: 0;
    }

    .input-container {
      display: flex;
      gap: 8px;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 24px;
      padding: 8px 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
      transition: all 0.2s ease;
    }

    .input-container:focus-within {
      border-color: #3b82f6;
      box-shadow: 0 4px 16px rgba(59, 130, 246, 0.12);
    }

    .input-container input {
      flex: 1;
      border: none;
      outline: none;
      background: transparent;
      font-size: 14px;
      color: #1f2937;
      padding: 8px 4px;
    }

    .input-container input::placeholder {
      color: #9ca3af;
    }

    .send-btn {
      background: none;
      border: none;
      color: #3b82f6;
      cursor: pointer;
      font-size: 16px;
      padding: 4px 8px;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
    }

    .send-btn:hover:not(:disabled) {
      background: #f3f4f6;
      color: #2563eb;
    }

    .send-btn:disabled {
      color: #d1d5db;
      cursor: not-allowed;
    }

    .error-message {
      background: #fee2e2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 12px;
      font-size: 13px;
      color: #991b1b;
      margin-bottom: 12px;
    }

    .jev-phase2-metrics {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .jev-phase2-metrics .metric-item {
      padding: 10px;
      background: white;
      border-radius: 4px;
      border-left: 3px solid #0284c7;
      font-size: 13px;
    }

    .jev-phase2-metrics strong {
      color: #1f2937;
      margin-right: 6px;
    }
  </style>
</head>
<body>
  <div class="planner-header">
    <h1 class="planner-title">Planner</h1>
    <p class="planner-subtitle">Análisis de tu idea de negocio en 2 fases</p>
  </div>

  <div class="planner-content" id="plannerContent">
  </div>

  <div class="planner-footer">
    <div class="input-container">
      <input
        type="text"
        placeholder="Describe tu idea de negocio..."
        aria-label="Input de analisis"
        id="plannerInput"
      />
      <button class="send-btn" id="sendBtn" aria-label="Enviar">
        ➤
      </button>
    </div>
  </div>

  <script>
    const input = document.getElementById('plannerInput');
    const sendBtn = document.getElementById('sendBtn');
    const content = document.getElementById('plannerContent');

    if (!input || !sendBtn || !content) {
      console.error('Missing required elements: input=' + !!input + ', sendBtn=' + !!sendBtn + ', content=' + !!content);
    }

    let lastJevAnalysis = null;
    let currentPhase1 = null;
    let currentPhase2 = null;
    let currentJevPhase2 = null;
    let currentPhase5 = null;
    let currentQuestion = null;
    let currentMetric = null;
    let originalInput = null;
    let phase5State = null;
    let enrichedResources = null;
    let suggestedSubdepartments = {};

    const saveAnalysisToSession = async () => {
      const analysis = {
        phase1: currentPhase1,
        phase2: currentPhase2,
        jevPhase2: currentJevPhase2,
        phase5: currentPhase5,
        resources: enrichedResources,
        suggestedSubdepartments: suggestedSubdepartments,
        originalInput: originalInput,
        timestamp: new Date().toISOString()
      };
      try {
        // Save to API
        const response = await fetch('/api/plan/analysis/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(analysis)
        });

        if (response.ok) {
          const result = await response.json();
          console.log('Analysis saved to server with ID:', result.id);
          // Also save to sessionStorage and localStorage as fallback
          sessionStorage.setItem('plannerAnalysis', JSON.stringify(analysis));
          localStorage.setItem('plannerAnalysis', JSON.stringify(analysis));
          return result.id;
        } else {
          console.error('Failed to save analysis to server, using sessionStorage/localStorage only');
          sessionStorage.setItem('plannerAnalysis', JSON.stringify(analysis));
          localStorage.setItem('plannerAnalysis', JSON.stringify(analysis));
          return null;
        }
      } catch (e) {
        console.error('Error saving analysis:', e);
        // Fallback to sessionStorage and localStorage
        try {
          sessionStorage.setItem('plannerAnalysis', JSON.stringify(analysis));
          localStorage.setItem('plannerAnalysis', JSON.stringify(analysis));
        } catch (e2) {
          console.error('Error saving to storage:', e2);
        }
        return null;
      }
    };

    const addUserMessage = (text) => {
      const div = document.createElement('div');
      div.className = 'message user';
      div.innerHTML = '<div class="message-bubble">' + text + '</div>';
      content.appendChild(div);
      content.scrollTop = content.scrollHeight;
    };

    const addLoadingMessage = (phase) => {
      const div = document.createElement('div');
      div.className = 'message';
      div.id = 'loadingMessage-' + phase;
      const phaseText = phase === 1 ? 'Jev analiza' : 'ChatGPT profundiza';
      div.innerHTML = '<div class="message-bubble loading"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div><div style="font-size:12px;color:#6b7280;margin-top:4px;">' + phaseText + '...</div>';
      content.appendChild(div);
      content.scrollTop = content.scrollHeight;
      return div.id;
    };

    const removeLoadingMessage = (id) => {
      const loading = document.getElementById(id);
      if (loading) loading.remove();
    };

    const normalizeConfidence = (val) => {
      if (!val && val !== 0) return 0;
      if (val < 1) return Math.round(val * 100);
      return Math.round(val);
    };

    const addAnalysisMessage = (phase1, phase2) => {
      const div = document.createElement('div');
      div.className = 'analysis-message';
      div.id = 'analysis-message';

      let html = '<div class="analysis-bubble">';
      html += '<div class="analysis-header">Análisis Completo</div>';
      html += '<div class="analysis-metrics">';

      html += '<div class="metric-item">';
      html += '<div class="metric-label">Sector</div>';
      html += '<div class="metric-value">' + (phase1.answers.sector.choice || 'N/A') + '</div>';
      html += '</div>';

      const locConf = normalizeConfidence(phase2.localizacion.confidence);
      html += '<div class="metric-item" id="metric-localizacion">';
      html += '<div class="metric-label">Localización</div>';
      html += '<div class="metric-value">' + (phase2.localizacion.value || 'N/A') + '</div>';
      html += '<div class="confidence-bar"><div class="confidence-fill" style="width:' + locConf + '%"></div></div>';
      html += '<div class="confidence-text">' + locConf + '% confianza</div>';
      html += '</div>';

      const subConf = normalizeConfidence(phase2.subsector.confidence);
      html += '<div class="metric-item" id="metric-subsector">';
      html += '<div class="metric-label">Subsector</div>';
      html += '<div class="metric-value">' + (phase2.subsector.value || 'N/A') + '</div>';
      html += '<div class="confidence-bar"><div class="confidence-fill" style="width:' + subConf + '%"></div></div>';
      html += '<div class="confidence-text">' + subConf + '% confianza</div>';
      html += '</div>';

      const flexConf = normalizeConfidence(phase2.flexibilidad_timeline.confidence);
      html += '<div class="metric-item" id="metric-flexibilidad_timeline">';
      html += '<div class="metric-label">Flexibilidad Timeline</div>';
      html += '<div class="metric-value">' + (phase2.flexibilidad_timeline.value || 'N/A') + '</div>';
      html += '<div class="confidence-bar"><div class="confidence-fill" style="width:' + flexConf + '%"></div></div>';
      html += '<div class="confidence-text">' + flexConf + '% confianza</div>';
      html += '</div>';

      const consConf = normalizeConfidence(phase2.constraints.confidence);
      html += '<div class="metric-item" id="metric-constraints">';
      html += '<div class="metric-label">Constraints</div>';
      html += '<div class="metric-value">' + (phase2.constraints.dinero || 'N/A') + '</div>';
      html += '<div class="confidence-bar"><div class="confidence-fill" style="width:' + consConf + '%"></div></div>';
      html += '<div class="confidence-text">' + consConf + '% confianza</div>';
      html += '</div>';

      html += '</div></div>';
      div.innerHTML = html;
      content.appendChild(div);
      content.scrollTop = content.scrollHeight;
    };

    const updateAnalysisMetrics = (phase2) => {
      const metricMap = {
        'localizacion': { conf: phase2.localizacion.confidence, value: phase2.localizacion.value },
        'subsector': { conf: phase2.subsector.confidence, value: phase2.subsector.value },
        'flexibilidad_timeline': { conf: phase2.flexibilidad_timeline.confidence, value: phase2.flexibilidad_timeline.value },
        'constraints': { conf: phase2.constraints.confidence, value: phase2.constraints.dinero }
      };

      for (const [metric, data] of Object.entries(metricMap)) {
        const elem = document.getElementById('metric-' + metric);
        if (elem) {
          const conf = normalizeConfidence(data.conf);
          const valueElem = elem.querySelector('.metric-value');
          const fillElem = elem.querySelector('.confidence-fill');
          const textElem = elem.querySelector('.confidence-text');

          if (valueElem) valueElem.textContent = data.value || 'N/A';
          if (fillElem) fillElem.style.width = conf + '%';
          if (textElem) textElem.textContent = conf + '% confianza';
        }
      }
    };

    const selectQuestion = (phase2Results) => {
      const metrics = [
        { conf: phase2Results.subsector.confidence, q: phase2Results.subsector.follow_up_question },
        { conf: phase2Results.localizacion.confidence, q: phase2Results.localizacion.follow_up_question },
        { conf: phase2Results.flexibilidad_timeline.confidence, q: phase2Results.flexibilidad_timeline.follow_up_question },
        { conf: phase2Results.constraints.confidence, q: phase2Results.constraints.follow_up_question }
      ];

      const sortedByConfidence = metrics.sort((a, b) => a.conf - b.conf);

      if (sortedByConfidence[0].conf < 80 && sortedByConfidence[0].q) {
        return sortedByConfidence[0].q;
      }

      return sortedByConfidence[0].q || null;
    };

    const addQuestionMessage = (question) => {
      const div = document.createElement('div');
      div.className = 'question-message';
      div.innerHTML = '<div class="question-bubble">' + question + '</div>';
      content.appendChild(div);
      content.scrollTop = content.scrollHeight;
    };

    const addResourcesForm = () => {
      // Limpiar todo el contenido previo
      content.innerHTML = '';

      const div = document.createElement('div');
      div.className = 'message assistant';
      div.id = 'resources-form-container';

      let html = '<div style="background: #f9fafb; border-radius: 12px; padding: 24px; max-width: 500px; margin: 0 auto; border: 1px solid #e5e7eb;">';
      html += '<div style="text-align: center; margin-bottom: 24px;">';
      html += '<div style="font-size: 16px; font-weight: 600; color: #1f2937; margin-bottom: 8px;">Cuéntanos más sobre tu proyecto</div>';
      html += '<div style="font-size: 13px; color: #6b7280;">Esta información enriquecerá el análisis</div>';
      html += '</div>';

      html += '<div style="display: flex; flex-direction: column; gap: 16px;">';

      html += '<div style="display: flex; flex-direction: column; gap: 8px;">';
      html += '<label style="font-size: 13px; font-weight: 600; color: #374151;">¿Cuál es tu presupuesto inicial? (USD)</label>';
      html += '<input type="range" id="budget-input" style="cursor: pointer;" min="0" max="100000" step="5000" value="20000">';
      html += '<div style="text-align: center; font-size: 14px; font-weight: 600; color: #0284c7;">$<span id="budget-display">20000</span></div>';
      html += '</div>';

      html += '<div style="display: flex; flex-direction: column; gap: 8px;">';
      html += '<label style="font-size: 13px; font-weight: 600; color: #374151;">¿Cuántas horas por semana puedes dedicar?</label>';
      html += '<input type="number" id="hours-input" style="padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px;" min="1" max="100" value="10" placeholder="Ej: 10">';
      html += '</div>';

      html += '<div style="display: flex; flex-direction: column; gap: 8px;">';
      html += '<label style="font-size: 13px; font-weight: 600; color: #374151;">¿Tamaño del equipo?</label>';
      html += '<select id="team-size-input" style="padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; background: white; cursor: pointer;">';
      html += '<option value="solo">Solo</option>';
      html += '<option value="mini">Mini (2-3 personas)</option>';
      html += '<option value="pequeño">Pequeño (4-6 personas)</option>';
      html += '<option value="mediano">Mediano (7-15 personas)</option>';
      html += '<option value="grande">Grande (16+ personas)</option>';
      html += '</select>';
      html += '</div>';

      html += '<div style="display: flex; flex-direction: column; gap: 8px;">';
      html += '<label style="font-size: 13px; font-weight: 600; color: #374151;">¿Experiencia en el sector? (años)</label>';
      html += '<input type="number" id="experience-input" style="padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px;" min="0" max="50" value="0" placeholder="Ej: 5">';
      html += '</div>';

      html += '</div>';
      html += '<button id="submit-resources-btn" style="margin-top: 16px; width: 100%; padding: 10px 16px; background: #0284c7; color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;">Analizar con esta información</button>';
      html += '</div>';

      div.innerHTML = html;
      content.appendChild(div);
      content.scrollTop = content.scrollHeight;

      document.getElementById('budget-input').addEventListener('input', (e) => {
        document.getElementById('budget-display').textContent = e.target.value;
      });

      document.getElementById('submit-resources-btn').addEventListener('click', handleResourcesSubmit);
    };

    const addJevPhase2ToAnalysis = (results) => {
      const analysisBubble = document.querySelector('.analysis-bubble');
      if (!analysisBubble) return;

      const jevSection = document.createElement('div');
      jevSection.id = 'jev-phase2-section';
      let html = '<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">';
      html += '<div style="font-size: 13px; font-weight: 600; color: #0284c7; margin-bottom: 12px;">Modelo de Negocio</div>';
      html += '<div class="jev-phase2-metrics">';
      html += '<div class="metric-item"><strong>Modelo:</strong> ' + (results.modelo_negocio || 'N/A') + '</div>';
      html += '<div class="metric-item"><strong>Cliente Objetivo:</strong> ' + (results.cliente_objetivo || 'N/A') + '</div>';
      html += '<div class="metric-item"><strong>Presupuesto/Escala:</strong> ' + (results.presupuesto || 'N/A') + '</div>';
      html += '<div class="metric-item"><strong>Dependencia:</strong> ' + (results.dependencia || 'N/A') + '</div>';
      html += '<div class="metric-item"><strong>Tu Experiencia:</strong> ' + (results.experiencia || 'N/A') + '</div>';
      html += '<div class="metric-item"><strong>Validación:</strong> ' + (results.validacion || 'N/A') + '</div>';
      html += '<div class="metric-item"><strong>Equipo:</strong> ' + (results.equipo || 'N/A') + '</div>';
      html += '<div class="metric-item"><strong>Regulación:</strong> ' + (results.regulacion || 'N/A') + '</div>';
      html += '</div></div>';
      jevSection.innerHTML = html;

      analysisBubble.appendChild(jevSection);
      content.scrollTop = content.scrollHeight;
    };

    const addPhase4ToAnalysis = (phase4Results) => {
      const analysisBubble = document.querySelector('.analysis-bubble');
      if (!analysisBubble) return;

      const phase4Section = document.createElement('div');
      phase4Section.id = 'phase4-section';
      let html = '<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">';
      html += '<div style="font-size: 13px; font-weight: 600; color: #7c3aed; margin-bottom: 12px;">Dimensiones Críticas</div>';

      if (phase4Results.dimensiones_criticas.length > 0) {
        html += '<div style="margin-bottom: 12px;">';
        html += '<div style="font-size: 12px; font-weight: 600; color: #dc2626; margin-bottom: 6px;">Críticas:</div>';
        html += '<div class="jev-phase2-metrics" style="gap: 6px;">';
        phase4Results.dimensiones_criticas.forEach((d) => {
          html += '<span style="display: inline-block; background: #fee2e2; border-left: 3px solid #dc2626; padding: 4px 8px; border-radius: 3px; font-size: 12px;">' + d + '</span>';
        });
        html += '</div></div>';
      }

      if (phase4Results.dimensiones_importantes.length > 0) {
        html += '<div style="margin-bottom: 12px;">';
        html += '<div style="font-size: 12px; font-weight: 600; color: #ea580c; margin-bottom: 6px;">Importantes:</div>';
        html += '<div class="jev-phase2-metrics" style="gap: 6px;">';
        phase4Results.dimensiones_importantes.forEach((d) => {
          html += '<span style="display: inline-block; background: #fed7aa; border-left: 3px solid #ea580c; padding: 4px 8px; border-radius: 3px; font-size: 12px;">' + d + '</span>';
        });
        html += '</div></div>';
      }

      if (phase4Results.dimensiones_secundarias.length > 0) {
        html += '<div>';
        html += '<div style="font-size: 12px; font-weight: 600; color: #7c3aed; margin-bottom: 6px;">Secundarias:</div>';
        html += '<div class="jev-phase2-metrics" style="gap: 6px;">';
        phase4Results.dimensiones_secundarias.forEach((d) => {
          html += '<span style="display: inline-block; background: #ede9fe; border-left: 3px solid #7c3aed; padding: 4px 8px; border-radius: 3px; font-size: 12px;">' + d + '</span>';
        });
        html += '</div></div>';
      }

      html += '</div>';
      phase4Section.innerHTML = html;
      analysisBubble.appendChild(phase4Section);
      content.scrollTop = content.scrollHeight;
    };

    const addPhase5ToAnalysis = (phase5Results) => {
      const analysisBubble = document.querySelector('.analysis-bubble');
      if (!analysisBubble) return;

      const phase5Section = document.createElement('div');
      phase5Section.id = 'phase5-section';
      let html = '<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">';
      html += '<div style="font-size: 13px; font-weight: 600; color: #059669; margin-bottom: 12px;">Estructura de Departamentos</div>';

      if (phase5Results.departamentos_criticos.length > 0) {
        html += '<div style="margin-bottom: 12px;">';
        html += '<div style="font-size: 12px; font-weight: 600; color: #166534; margin-bottom: 6px;">Críticos (automático):</div>';
        html += '<div class="jev-phase2-metrics" style="gap: 6px;">';
        phase5Results.departamentos_criticos.forEach((d) => {
          html += '<span style="display: inline-block; background: #dcfce7; border-left: 3px solid #16a34a; padding: 6px 10px; border-radius: 3px; font-size: 12px;"><strong>' + d.nombre + '</strong> ' + d.probabilidad + '%</span>';
        });
        html += '</div></div>';
      }

      if (phase5Results.departamentos_importantes.length > 0) {
        html += '<div style="margin-bottom: 12px;">';
        html += '<div style="font-size: 12px; font-weight: 600; color: #7c2d12; margin-bottom: 6px;">A validar (probabilidad media):</div>';
        html += '<div class="jev-phase2-metrics" style="gap: 6px;">';
        phase5Results.departamentos_importantes.forEach((d) => {
          html += '<span style="display: inline-block; background: #fef3c7; border-left: 3px solid #f59e0b; padding: 6px 10px; border-radius: 3px; font-size: 12px;"><strong>' + d.nombre + '</strong> ' + d.probabilidad + '%</span>';
        });
        html += '</div></div>';
      }

      html += '</div>';
      phase5Section.innerHTML = html;
      analysisBubble.appendChild(phase5Section);
      content.scrollTop = content.scrollHeight;
    };

    const handleResourcesSubmit = async () => {
      const budget = parseInt(document.getElementById('budget-input').value);
      const hours = parseInt(document.getElementById('hours-input').value);
      const teamSize = document.getElementById('team-size-input').value;
      const experience = parseInt(document.getElementById('experience-input').value);

      enrichedResources = { presupuesto: budget, equipo: teamSize };

      const formContainer = document.getElementById('resources-form-container');
      if (formContainer) formContainer.remove();

      const loadingId = addLoadingMessage(2);

      try {
        const resourcesResponse = await fetch('/api/planner/enrich-with-resources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            analysis: currentPhase2,
            originalInput: originalInput,
            resources: { budget, hours, teamSize, experience }
          })
        });

        removeLoadingMessage(loadingId);

        if (!resourcesResponse.ok) {
          const error = await resourcesResponse.json();
          throw new Error(error.error || 'Error enriqueciendo análisis');
        }

        const enrichedResult = await resourcesResponse.json();
        currentPhase2 = enrichedResult;
        updateAnalysisMetrics(currentPhase2);

        addQuestionMessage('✓ Análisis enriquecido con tu información. Analizando modelo de negocio...');

        const loadingId2 = addLoadingMessage(2);

        const jevPhase2Response = await fetch('/api/planner/jev-phase2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            originalInput: originalInput,
            subsector: currentPhase2.subsector.value,
            localizacion: currentPhase2.localizacion.value,
            timeline: currentPhase2.flexibilidad_timeline.value
          })
        });

        removeLoadingMessage(loadingId2);

        if (!jevPhase2Response.ok) {
          const error = await jevPhase2Response.json();
          throw new Error(error.error || 'Error analizando modelo de negocio');
        }

        const jevPhase2Results = await jevPhase2Response.json();
        currentJevPhase2 = jevPhase2Results;
        addJevPhase2ToAnalysis(jevPhase2Results);

        const loadingId3 = addLoadingMessage(1);

        const phase4Response = await fetch('/api/planner/phase4', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sector: currentPhase1.answers.sector?.choice || '',
            alcance_geografico: currentPhase1.answers.alcance_geografico?.choice || '',
            regulacion: jevPhase2Results.regulacion || '',
            modelo_negocio: jevPhase2Results.modelo_negocio || '',
            equipo: jevPhase2Results.equipo || '',
            validacion: jevPhase2Results.validacion || '',
            dependencia: jevPhase2Results.dependencia || '',
            cliente_objetivo: jevPhase2Results.cliente_objetivo || '',
            presupuesto: jevPhase2Results.presupuesto || '',
            experiencia: jevPhase2Results.experiencia || ''
          })
        });

        removeLoadingMessage(loadingId3);

        if (!phase4Response.ok) {
          const error = await phase4Response.json();
          throw new Error(error.error || 'Error inferenciando dimensiones');
        }

        const phase4Results = await phase4Response.json();
        addPhase4ToAnalysis(phase4Results);

        const loadingId4 = addLoadingMessage(1);

        const phase5Response = await fetch('/api/planner/phase5', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sector: currentPhase1.answers.sector?.choice || '',
            alcance_geografico: currentPhase1.answers.alcance_geografico?.choice || '',
            regulacion: jevPhase2Results.regulacion || '',
            modelo_negocio: jevPhase2Results.modelo_negocio || '',
            equipo: jevPhase2Results.equipo || '',
            validacion: jevPhase2Results.validacion || '',
            dependencia: jevPhase2Results.dependencia || '',
            cliente_objetivo: jevPhase2Results.cliente_objetivo || '',
            presupuesto: jevPhase2Results.presupuesto || '',
            experiencia: jevPhase2Results.experiencia || ''
          })
        });

        removeLoadingMessage(loadingId4);

        if (!phase5Response.ok) {
          const error = await phase5Response.json();
          throw new Error(error.error || 'Error calculando estructura');
        }

        const phase5Results = await phase5Response.json();
        currentPhase5 = phase5Results;
        addPhase5ToAnalysis(phase5Results);

        // Automatic loop: Jev → ChatGPT → Jev (NO user questions)
        let loadingIdSuggest;
        try {
          const allDepts = [
            ...phase5Results.departamentos_criticos.map(d => d.nombre),
            ...phase5Results.departamentos_importantes.map(d => d.nombre),
            ...phase5Results.departamentos_secundarios.map(d => d.nombre)
          ];

          loadingIdSuggest = addLoadingMessage(3);

          // Step 1: Jev checks if departments are missing
          const checkResponse = await fetch('/api/planner/check-missing-departments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sector: currentPhase1?.answers.sector?.choice || 'desconocido',
              modelo_negocio: currentJevPhase2?.modelo_negocio || 'desconocido',
              departamentos_actuales: allDepts,
              presupuesto: enrichedResources?.presupuesto || 'no especificado',
              equipo: enrichedResources?.equipo || 'no especificado'
            })
          });

          removeLoadingMessage(loadingIdSuggest);

          if (!checkResponse.ok) {
            throw new Error('Error checking missing departments');
          }

          const checkResult = await checkResponse.json();

          // If confidence is low OR Jev says NO → Finish (no missing departments)
          if (checkResult.confianza < 0.85 || !checkResult.hay_faltantes) {
            addQuestionMessage('✓ Análisis completo. Tu plan de negocio está estructurado y listo.');
            currentQuestion = null;
            currentMetric = null;
            const analysisId = await saveAnalysisToSession();
            setTimeout(() => {
              const url = analysisId ? '/loader?aid=' + analysisId : '/loader';
              window.location.href = url;
            }, 1500);
            return;
          }

          // Step 2: Jev says YES (high confidence) → ChatGPT suggests
          loadingIdSuggest = addLoadingMessage(3);

          const suggestResponse = await fetch('/api/planner/suggest-departments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sector: currentPhase2?.subsector?.value || 'desconocido',
              modelo_negocio: currentJevPhase2?.modelo_negocio || 'desconocido',
              departamentos_actuales: allDepts,
              presupuesto: enrichedResources?.presupuesto || 'no especificado',
              equipo: enrichedResources?.equipo || 'no especificado'
            })
          });

          removeLoadingMessage(loadingIdSuggest);

          if (!suggestResponse.ok) {
            throw new Error('Error suggesting departments');
          }

          const suggestions = await suggestResponse.json();
          suggestedSubdepartments = suggestions.subdepartamentos || {};

          if (!suggestions.departamentos_sugeridos || suggestions.departamentos_sugeridos.length === 0) {
            addQuestionMessage('✓ Análisis completo. Tu plan de negocio está estructurado y listo.');
            currentQuestion = null;
            currentMetric = null;
            const analysisId = await saveAnalysisToSession();
            setTimeout(() => {
              const url = analysisId ? '/loader?aid=' + analysisId : '/loader';
              window.location.href = url;
            }, 1500);
            return;
          }

          // Step 3: Jev validates ChatGPT suggestions
          loadingIdSuggest = addLoadingMessage(3);

          const validateResponse = await fetch('/api/planner/validate-departments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sector: currentPhase1?.answers.sector?.choice || 'desconocido',
              modelo_negocio: currentJevPhase2?.modelo_negocio || 'desconocido',
              departamentos_propuestos: suggestions.departamentos_sugeridos,
              departamentos_originales: allDepts,
              presupuesto: enrichedResources?.presupuesto || 'no especificado',
              equipo: enrichedResources?.equipo || 'no especificado'
            })
          });

          removeLoadingMessage(loadingIdSuggest);

          if (!validateResponse.ok) {
            throw new Error('Error validating departments');
          }

          const validateResult = await validateResponse.json();

          // Show validated departments (no user question)
          if (validateResult.departamentos_validos && validateResult.departamentos_validos.length > 0) {
            const deptList = validateResult.departamentos_validos.join(', ');
            const confPercent = Math.round(validateResult.confianza * 100);
            addQuestionMessage('✓ Departamentos críticos identificados (Jev - ' + confPercent + '%): ' + deptList);

            // Add to phase5
            if (!currentPhase5.departamentos_identificados) {
              currentPhase5.departamentos_identificados = [];
            }
            currentPhase5.departamentos_identificados = validateResult.departamentos_validos;
          }

          // Finish and redirect
          addQuestionMessage('✓ Análisis completo. Tu plan de negocio está estructurado y listo.');
          currentQuestion = null;
          currentMetric = null;
          const analysisId = await saveAnalysisToSession();
          setTimeout(() => {
            const url = analysisId ? '/loader?aid=' + analysisId : '/loader';
            window.location.href = url;
          }, 1500);

        } catch (e) {
          if (loadingIdSuggest) removeLoadingMessage(loadingIdSuggest);
          console.error('Error in department validation loop:', e);
          addQuestionMessage('✓ Análisis completo. Tu plan de negocio está estructurado y listo.');
          currentQuestion = null;
          currentMetric = null;
          const analysisId = await saveAnalysisToSession();
          setTimeout(() => {
            const url = analysisId ? '/loader?aid=' + analysisId : '/loader';
            window.location.href = url;
          }, 1500);
        }
      } catch (error) {
        if (loadingId) removeLoadingMessage(loadingId);
        if (loadingIdSuggest) removeLoadingMessage(loadingIdSuggest);
        const msg = error instanceof Error ? error.message : 'Error desconocido';
        addErrorMessage('Error: ' + msg);
      } finally {
        sendBtn.disabled = false;
        input.focus();
      }
    };

    const addErrorMessage = (error) => {
      const div = document.createElement('div');
      div.className = 'error-message';
      div.textContent = error;
      content.appendChild(div);
      content.scrollTop = content.scrollHeight;
    };

    const hasLowConfidence = (jevResults) => {
      const sector = jevResults.answers.sector?.choice;
      const alcance = jevResults.answers.alcance_geografico?.choice;
      const timeline = jevResults.answers.timeline?.choice;

      const isVague = (val) => !val || val === 'No especificado' || val === 'Otros';
      return isVague(sector) || isVague(alcance) || isVague(timeline);
    };

    const handleSend = async () => {
      console.log('handleSend called');
      if (!input || !sendBtn) {
        console.error('Missing input or sendBtn in handleSend');
        return;
      }
      const value = input.value.trim();
      if (!value || sendBtn.disabled) {
        console.log('Returning early: no value or sendBtn disabled');
        return;
      }

      addUserMessage(value);
      input.value = '';
      sendBtn.disabled = true;

      let loadingId;
      try {
        if (currentQuestion && currentMetric && currentPhase2) {
          loadingId = addLoadingMessage(2);

          const refineResponse = await fetch('/api/planner/refine-iterate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              metric: currentMetric,
              question: currentQuestion,
              userAnswer: value,
              originalAnalysis: JSON.stringify(currentPhase2),
              originalInput: originalInput,
              currentAnalysis: currentPhase2
            })
          });

          removeLoadingMessage(loadingId);

          if (!refineResponse.ok) {
            const error = await refineResponse.json();
            throw new Error(error.error || 'Error en refinamiento');
          }

          const refineResult = await refineResponse.json();
          currentPhase2 = refineResult.updatedAnalysis;

          updateAnalysisMetrics(currentPhase2);

          if (refineResult.allComplete) {
            addQuestionMessage('✓ Análisis completado. Todos los aspectos tienen suficiente confianza (>80%)');
            currentQuestion = null;
            currentMetric = null;
          } else {
            currentQuestion = refineResult.nextQuestion;
            addQuestionMessage(currentQuestion);
          }
        } else {
          const loadingId1 = addLoadingMessage(1);

          const response = await fetch('/api/planner', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: value })
          });

          removeLoadingMessage(loadingId1);

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error en Fase 1');
          }

          const results = await response.json();
          currentPhase1 = results;
          lastJevAnalysis = results.answers;
          originalInput = value;

          const lowConfidence = hasLowConfidence(results);

          if (lowConfidence) {
            const loadingId2 = addLoadingMessage(2);

            const response2 = await fetch('/api/planner/phase2', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                input: value,
                jevAnalysis: {
                  sector: results.answers.sector.choice,
                  alcance_geografico: results.answers.alcance_geografico.choice,
                  timeline: results.answers.timeline.choice
                }
              })
            });

            removeLoadingMessage(loadingId2);

            if (!response2.ok) {
              const error = await response2.json();
              throw new Error(error.error || 'Error en Fase 2');
            }

            const phase2Results = await response2.json();
            currentPhase2 = phase2Results;
            addAnalysisMessage(results, phase2Results);
          } else {
            addQuestionMessage('✓ Tu idea está bien definida. Procedemos con el análisis de recursos.');
          }

          addResourcesForm();
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Error desconocido';
        addErrorMessage('Error: ' + msg);
      } finally {
        sendBtn.disabled = false;
        input.focus();
      }
    };

    try {
      if (sendBtn) sendBtn.addEventListener('click', handleSend);
      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        });
      }
    } catch (e) {
      console.error('Error adding event listeners:', e);
    }
  </script>
</body>
</html>`;
}
