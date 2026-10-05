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

    .phase-section {
      margin-top: 20px;
      padding: 16px;
      background: #f9fafb;
      border-radius: 8px;
      border-left: 4px solid #3b82f6;
    }

    .phase-title {
      font-size: 13px;
      font-weight: 600;
      color: #3b82f6;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .results-container {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 12px;
      margin-top: 12px;
    }

    .result-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px;
      font-size: 13px;
    }

    .result-label {
      font-weight: 600;
      color: #374151;
      margin-bottom: 6px;
      text-transform: capitalize;
    }

    .result-value {
      color: #3b82f6;
      font-weight: 500;
      margin-bottom: 8px;
      font-size: 13px;
    }

    .confidence-bar {
      height: 6px;
      background: #e5e7eb;
      border-radius: 3px;
      overflow: hidden;
    }

    .confidence-fill {
      height: 100%;
      background: linear-gradient(to right, #ef4444, #eab308, #22c55e);
      transition: width 0.3s ease;
    }

    .confidence-text {
      font-size: 11px;
      color: #6b7280;
      margin-top: 4px;
    }

    .phase2-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 14px;
      font-size: 13px;
    }

    .phase2-card .result-label {
      font-size: 12px;
      font-weight: 600;
      color: #1f2937;
    }

    .phase2-card .result-value {
      font-size: 13px;
      line-height: 1.4;
      margin-bottom: 8px;
      color: #374151;
    }

    .constraints-list {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #f3f4f6;
    }

    .constraint-item {
      font-size: 12px;
      color: #6b7280;
      margin: 4px 0;
      padding-left: 12px;
      position: relative;
    }

    .constraint-item:before {
      content: "•";
      position: absolute;
      left: 0;
      color: #d1d5db;
    }

    .clarity-score {
      font-size: 24px;
      font-weight: 700;
      color: #3b82f6;
      margin: 8px 0;
    }

    .clarity-reasoning {
      font-size: 12px;
      color: #6b7280;
      font-style: italic;
      margin-top: 4px;
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

    .follow-up-question {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
    }

    .follow-up-label {
      font-size: 11px;
      font-weight: 600;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    .follow-up-btn {
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 12px;
      color: #374151;
      cursor: pointer;
      transition: all 0.2s;
      font-weight: 500;
    }

    .follow-up-btn:hover {
      background: #e5e7eb;
      border-color: #9ca3af;
      color: #1f2937;
    }

    .required-question {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      border-radius: 8px;
      padding: 12px;
      margin-top: 16px;
      font-size: 13px;
    }

    .required-question-label {
      font-weight: 600;
      color: #92400e;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .required-question-label:before {
      content: "⚠";
      font-size: 14px;
    }

    .required-question-text {
      color: #78350f;
      margin-bottom: 10px;
      font-style: italic;
    }

    .refine-input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 13px;
      margin-bottom: 8px;
      font-family: inherit;
    }

    .refine-input:focus {
      outline: none;
      border-color: #f59e0b;
      box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1);
    }

    .refine-btn {
      background: #f59e0b;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }

    .refine-btn:hover {
      background: #d97706;
    }

    .refine-btn:disabled {
      background: #d1d5db;
      cursor: not-allowed;
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

    const addPhase1Results = (results) => {
      const div = document.createElement('div');
      div.className = 'phase-section';

      let html = '<div class="phase-title">Fase 1: Clasificación (Jev)</div><div class="results-container">';

      if (results.answers) {
        for (const [key, answer] of Object.entries(results.answers)) {
          const value = answer.choice || answer.score || answer.noul || 'N/A';
          html += '<div class="result-card"><div class="result-label">' + key + '</div><div class="result-value">' + value + '</div></div>';
        }
      }

      html += '</div>';
      div.innerHTML = html;
      content.appendChild(div);
      content.scrollTop = content.scrollHeight;
    };

    const addPhase2Results = (results) => {
      const div = document.createElement('div');
      div.className = 'phase-section';
      div.style.borderLeftColor = '#10b981';

      let html = '<div class="phase-title" style="color:#10b981;">Fase 2: Análisis Profundo (ChatGPT)</div><div class="results-container" style="grid-template-columns: 1fr;">';

      html += '<div class="phase2-card">';
      html += '<div class="result-label">Subsector Específico</div>';
      html += '<div class="result-value">' + results.subsector.value + '</div>';
      html += '<div class="confidence-bar"><div class="confidence-fill" style="width:' + results.subsector.confidence + '%"></div></div>';
      html += '<div class="confidence-text">' + results.subsector.confidence + '% confianza</div>';
      if (results.subsector.follow_up_question) {
        html += '<div class="follow-up-question"><div class="follow-up-label">Preguntar</div><button class="follow-up-btn" onclick="addUserMessage(\'' + results.subsector.follow_up_question.replace(/'/g, "\\'") + '\'); handleSend();">' + results.subsector.follow_up_question + '</button></div>';
      }
      html += '</div>';

      html += '<div class="phase2-card">';
      html += '<div class="result-label">Localización Específica</div>';
      html += '<div class="result-value">' + results.localizacion.value + '</div>';
      html += '<div class="confidence-bar"><div class="confidence-fill" style="width:' + results.localizacion.confidence + '%"></div></div>';
      html += '<div class="confidence-text">' + results.localizacion.confidence + '% confianza</div>';
      if (results.localizacion.follow_up_question) {
        html += '<div class="follow-up-question"><div class="follow-up-label">Preguntar</div><button class="follow-up-btn" onclick="addUserMessage(\'' + results.localizacion.follow_up_question.replace(/'/g, "\\'") + '\'); handleSend();">' + results.localizacion.follow_up_question + '</button></div>';
      }
      html += '</div>';

      html += '<div class="phase2-card">';
      html += '<div class="result-label">Flexibilidad de Timeline</div>';
      html += '<div class="result-value">' + results.flexibilidad_timeline.value + '</div>';
      html += '<div class="confidence-bar"><div class="confidence-fill" style="width:' + results.flexibilidad_timeline.confidence + '%"></div></div>';
      html += '<div class="confidence-text">' + results.flexibilidad_timeline.confidence + '% confianza</div>';
      if (results.flexibilidad_timeline.follow_up_question) {
        html += '<div class="follow-up-question"><div class="follow-up-label">Preguntar</div><button class="follow-up-btn" onclick="addUserMessage(\'' + results.flexibilidad_timeline.follow_up_question.replace(/'/g, "\\'") + '\'); handleSend();">' + results.flexibilidad_timeline.follow_up_question + '</button></div>';
      }
      html += '</div>';

      html += '<div class="phase2-card">';
      html += '<div class="result-label">Constraints Principales</div>';
      html += '<div class="result-value"><strong>Presupuesto:</strong> ' + results.constraints.dinero + '</div>';
      html += '<div class="constraints-list">';
      if (results.constraints.excluyentes.length > 0) {
        html += '<div style="margin-bottom:8px;"><strong style="font-size:12px;color:#374151;">Excluyentes:</strong>';
        results.constraints.excluyentes.forEach(e => {
          html += '<div class="constraint-item">' + e + '</div>';
        });
        html += '</div>';
      }
      if (results.constraints.otros.length > 0) {
        html += '<div><strong style="font-size:12px;color:#374151;">Otros:</strong>';
        results.constraints.otros.forEach(o => {
          html += '<div class="constraint-item">' + o + '</div>';
        });
        html += '</div>';
      }
      html += '</div>';
      html += '<div class="confidence-bar"><div class="confidence-fill" style="width:' + results.constraints.confidence + '%"></div></div>';
      html += '<div class="confidence-text">' + results.constraints.confidence + '% confianza</div>';
      if (results.constraints.follow_up_question) {
        html += '<div class="follow-up-question"><div class="follow-up-label">Preguntar</div><button class="follow-up-btn" onclick="addUserMessage(\'' + results.constraints.follow_up_question.replace(/'/g, "\\'") + '\'); handleSend();">' + results.constraints.follow_up_question + '</button></div>';
      }
      html += '</div>';

      html += '<div class="phase2-card">';
      html += '<div class="result-label">Claridad del Concepto</div>';
      html += '<div class="clarity-score">' + results.claridad_concepto.score + '/10</div>';
      html += '<div class="clarity-reasoning">' + results.claridad_concepto.razonamiento + '</div>';
      html += '<div class="confidence-bar" style="margin-top:8px;"><div class="confidence-fill" style="width:' + results.claridad_concepto.confidence + '%"></div></div>';
      html += '<div class="confidence-text">' + results.claridad_concepto.confidence + '% confianza</div>';
      if (results.claridad_concepto.follow_up_question) {
        html += '<div class="follow-up-question"><div class="follow-up-label">Preguntar</div><button class="follow-up-btn" onclick="addUserMessage(\'' + results.claridad_concepto.follow_up_question.replace(/'/g, "\\'") + '\'); handleSend();">' + results.claridad_concepto.follow_up_question + '</button></div>';
      }
      html += '</div>';

      html += '</div>';
      div.innerHTML = html;
      content.appendChild(div);
      content.scrollTop = content.scrollHeight;
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

      const loadingId1 = addLoadingMessage(1);

      try {
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
        addPhase1Results(results);
        lastJevAnalysis = results.answers;

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
        addPhase2Results(phase2Results);
      } catch (error) {
        removeLoadingMessage(loadingId1);
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
