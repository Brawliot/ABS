/**
 * Página Planner: Input de texto estilo bot IA en blanco
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
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .planner-container {
      width: 100%;
      max-width: 800px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 40px;
    }

    .planner-header {
      text-align: center;
    }

    .planner-title {
      font-size: 32px;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 8px;
    }

    .planner-subtitle {
      font-size: 16px;
      color: #6b7280;
    }

    .input-wrapper {
      width: 100%;
      position: relative;
    }

    .input-container {
      display: flex;
      gap: 8px;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 24px;
      padding: 8px 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      transition: all 0.2s ease;
    }

    .input-container:focus-within {
      border-color: #3b82f6;
      box-shadow: 0 4px 20px rgba(59, 130, 246, 0.15);
    }

    .input-container input {
      flex: 1;
      border: none;
      outline: none;
      background: transparent;
      font-size: 15px;
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
      font-size: 18px;
      padding: 4px 8px;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
    }

    .send-btn:hover {
      background: #f3f4f6;
      color: #2563eb;
    }

    .send-btn:disabled {
      color: #d1d5db;
      cursor: not-allowed;
    }
  </style>
</head>
<body>
  <div class="planner-container">
    <div class="planner-header">
      <h1 class="planner-title">Planner</h1>
      <p class="planner-subtitle">Planifica tus tareas aquí</p>
    </div>

    <div class="input-wrapper">
      <div class="input-container">
        <input
          type="text"
          placeholder="Escribe tu tarea o pregunta..."
          aria-label="Input de tareas"
          id="plannerInput"
        />
        <button class="send-btn" id="sendBtn" aria-label="Enviar">
          ➤
        </button>
      </div>
    </div>
  </div>

  <script>
    const input = document.getElementById('plannerInput');
    const sendBtn = document.getElementById('sendBtn');

    const handleSend = () => {
      const value = input.value.trim();
      if (value) {
        console.log('Enviando:', value);
        input.value = '';
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
