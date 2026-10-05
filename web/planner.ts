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

    let lastJevAnalysis = null;
    let currentPhase1 = null;
    let currentPhase2 = null;
    let currentJevPhase2 = null;
    let currentQuestion = null;
    let currentMetric = null;
    let originalInput = null;

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
      const div = document.createElement('div');
      div.className = 'resources-form';
      div.id = 'resources-form-container';

      let html = '<div class="resources-bubble">';
      html += '<div style="margin-bottom: 16px; font-weight: 600; color: #0284c7;">Cuéntanos más sobre tu proyecto</div>';

      html += '<div class="resource-field">';
      html += '<label class="resource-label">¿Cuál es tu presupuesto inicial? (USD)</label>';
      html += '<input type="range" id="budget-input" class="resource-range" min="0" max="100000" step="5000" value="20000">';
      html += '<div class="range-value">$<span id="budget-display">20000</span></div>';
      html += '</div>';

      html += '<div class="resource-field">';
      html += '<label class="resource-label">¿Cuántas horas por semana puedes dedicar?</label>';
      html += '<input type="number" id="hours-input" class="resource-input" min="1" max="100" value="10" placeholder="Ej: 10">';
      html += '</div>';

      html += '<div class="resource-field">';
      html += '<label class="resource-label">¿Tamaño del equipo?</label>';
      html += '<select id="team-size-input" class="resource-select">';
      html += '<option value="solo">Solo</option>';
      html += '<option value="mini">Mini (2-3 personas)</option>';
      html += '<option value="pequeño">Pequeño (4-6 personas)</option>';
      html += '<option value="mediano">Mediano (7-15 personas)</option>';
      html += '<option value="grande">Grande (16+ personas)</option>';
      html += '</select>';
      html += '</div>';

      html += '<div class="resource-field">';
      html += '<label class="resource-label">¿Experiencia en el sector? (años)</label>';
      html += '<input type="number" id="experience-input" class="resource-input" min="0" max="50" value="0" placeholder="Ej: 5">';
      html += '</div>';

      html += '<button class="submit-resources" id="submit-resources-btn">Analizar con esta información</button>';
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
      jevSection.innerHTML = `
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
          <div style="font-size: 13px; font-weight: 600; color: #0284c7; margin-bottom: 12px;">📊 Modelo de Negocio</div>
          <div class="jev-phase2-metrics">
            <div class="metric-item"><strong>Modelo:</strong> ${results.modelo_negocio || 'N/A'}</div>
            <div class="metric-item"><strong>Cliente Objetivo:</strong> ${results.cliente_objetivo || 'N/A'}</div>
            <div class="metric-item"><strong>Presupuesto/Escala:</strong> ${results.presupuesto || 'N/A'}</div>
            <div class="metric-item"><strong>Dependencia:</strong> ${results.dependencia || 'N/A'}</div>
            <div class="metric-item"><strong>Tu Experiencia:</strong> ${results.experiencia || 'N/A'}</div>
            <div class="metric-item"><strong>Validación:</strong> ${results.validacion || 'N/A'}</div>
            <div class="metric-item"><strong>Equipo:</strong> ${results.equipo || 'N/A'}</div>
            <div class="metric-item"><strong>Regulación:</strong> ${results.regulacion || 'N/A'}</div>
          </div>
        </div>
      `;

      analysisBubble.appendChild(jevSection);
      content.scrollTop = content.scrollHeight;
    };

    const handleResourcesSubmit = async () => {
      const budget = parseInt(document.getElementById('budget-input').value);
      const hours = parseInt(document.getElementById('hours-input').value);
      const teamSize = document.getElementById('team-size-input').value;
      const experience = parseInt(document.getElementById('experience-input').value);

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

        currentQuestion = null;
        currentMetric = null;
      } catch (error) {
        removeLoadingMessage(loadingId);
        const msg = error instanceof Error ? error.message : 'Error desconocido';
        addErrorMessage('Error: ' + msg);
      }
    };

    const addErrorMessage = (error) => {
      const div = document.createElement('div');
      div.className = 'error-message';
      div.textContent = error;
      content.appendChild(div);
      content.scrollTop = content.scrollHeight;
    };

    const handleSend = async () => {
      const value = input.value.trim();
      if (!value || sendBtn.disabled) return;

      addUserMessage(value);
      input.value = '';
      sendBtn.disabled = true;

      try {
        if (currentQuestion && currentMetric && currentPhase2) {
          const loadingId = addLoadingMessage(2);

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

    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
  </script>
</body>
</html>`;
}
