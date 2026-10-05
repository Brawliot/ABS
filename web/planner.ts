/**
 * Página Planner: Análisis de negocio con Jev
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

    .results-container {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 12px;
      margin-top: 12px;
    }

    .result-card {
      background: #f9fafb;
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
  </style>
</head>
<body>
  <div class="planner-header">
    <h1 class="planner-title">Planner</h1>
    <p class="planner-subtitle">Analiza tu idea de negocio</p>
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

    const addUserMessage = (text) => {
      const div = document.createElement('div');
      div.className = 'message user';
      div.innerHTML = '<div class="message-bubble">' + text + '</div>';
      content.appendChild(div);
      content.scrollTop = content.scrollHeight;
    };

    const addLoadingMessage = () => {
      const div = document.createElement('div');
      div.className = 'message';
      div.id = 'loadingMessage';
      div.innerHTML = '<div class="message-bubble loading"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>';
      content.appendChild(div);
      content.scrollTop = content.scrollHeight;
    };

    const removeLoadingMessage = () => {
      const loading = document.getElementById('loadingMessage');
      if (loading) loading.remove();
    };

    const addResultsMessage = (results) => {
      const div = document.createElement('div');
      div.className = 'message';

      let html = '<div style="width: 100%;"><div class="results-container">';

      if (results.answers) {
        for (const [key, answer] of Object.entries(results.answers)) {
          const value = answer.choice || answer.score || answer.noul || 'N/A';
          html += '<div class="result-card"><div class="result-label">' + key + '</div><div class="result-value">' + value + '</div></div>';
        }
      }

      html += '</div></div>';
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

      addLoadingMessage();

      try {
        const response = await fetch('/api/planner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: value })
        });

        removeLoadingMessage();

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Error al analizar');
        }

        const results = await response.json();
        addResultsMessage(results);
      } catch (error) {
        removeLoadingMessage();
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
