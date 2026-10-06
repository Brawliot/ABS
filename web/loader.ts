/**
 * Loader page: Calculates first blocker while showing progress
 */

export function renderLoaderHtml(): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Analizando Plan</title>
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

    .loader-container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 500px;
      width: 100%;
      padding: 40px;
      text-align: center;
    }

    .loader-title {
      font-size: 24px;
      font-weight: 700;
      color: #1f2937;
      margin-bottom: 12px;
    }

    .loader-subtitle {
      font-size: 14px;
      color: #6b7280;
      margin-bottom: 32px;
    }

    .progress-bar {
      background: #e5e7eb;
      border-radius: 8px;
      height: 8px;
      overflow: hidden;
      margin-bottom: 20px;
    }

    .progress-fill {
      background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
      height: 100%;
      width: 0%;
      transition: width 0.3s ease;
    }

    .progress-text {
      font-size: 12px;
      color: #9ca3af;
      margin-bottom: 24px;
    }

    .steps {
      display: flex;
      flex-direction: column;
      gap: 12px;
      text-align: left;
    }

    .step {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-radius: 8px;
      background: #f9fafb;
      font-size: 13px;
      color: #6b7280;
      transition: all 0.3s ease;
    }

    .step.active {
      background: #dbeafe;
      color: #1e40af;
    }

    .step.done {
      background: #dcfce7;
      color: #166534;
    }

    .step-icon {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 600;
      background: #e5e7eb;
      color: #6b7280;
      flex-shrink: 0;
    }

    .step.active .step-icon {
      background: #3b82f6;
      color: white;
      animation: spin 1s linear infinite;
    }

    .step.done .step-icon {
      background: #10b981;
      color: white;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .loader-message {
      margin-top: 32px;
      padding: 16px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      color: #166534;
      font-size: 13px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="loader-container">
    <div class="loader-title">Analizando tu plan</div>
    <div class="loader-subtitle">Calculando primer bloqueador...</div>

    <div class="progress-bar">
      <div class="progress-fill" id="progressFill"></div>
    </div>
    <div class="progress-text"><span id="progressPercent">0</span>%</div>

    <div class="steps">
      <div class="step active" id="step1">
        <div class="step-icon">1</div>
        <div>Evaluando departamentos</div>
      </div>
      <div class="step" id="step2">
        <div class="step-icon">2</div>
        <div>Scoring variables</div>
      </div>
      <div class="step" id="step3">
        <div class="step-icon">3</div>
        <div>Ordenando prioridades</div>
      </div>
      <div class="step" id="step4">
        <div class="step-icon">4</div>
        <div>Generando plan inicial</div>
      </div>
    </div>

    <div class="loader-message">
      ✓ Esto puede tomar 30-60 segundos. Ten paciencia mientras calculamos la estrategia óptima.
    </div>
  </div>

  <script>
    const steps = ['step1', 'step2', 'step3', 'step4'];
    let currentStep = 0;
    let progress = 0;

    function updateProgress() {
      progress += Math.random() * 15;
      if (progress > 95) progress = 95;

      document.getElementById('progressFill').style.width = progress + '%';
      document.getElementById('progressPercent').textContent = Math.round(progress);

      if (currentStep < steps.length) {
        const stepNum = Math.floor((progress / 100) * steps.length);
        if (stepNum > currentStep) {
          // Mark previous step as done
          if (currentStep > 0) {
            document.getElementById(steps[currentStep - 1]).classList.remove('active');
            document.getElementById(steps[currentStep - 1]).classList.add('done');
          }
          // Activate current step
          if (stepNum <= steps.length) {
            currentStep = stepNum;
            if (currentStep < steps.length) {
              document.getElementById(steps[currentStep]).classList.add('active');
            }
          }
        }
      }
    }

    function startAnalysis() {
      const analysis = sessionStorage.getItem('plannerAnalysis');
      if (!analysis) {
        window.location.href = '/planner';
        return;
      }

      const interval = setInterval(updateProgress, 200);

      fetch('/api/planner/calculate-first-blocker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: analysis
      })
        .then(r => r.json())
        .then(blocker => {
          clearInterval(interval);
          progress = 100;
          document.getElementById('progressFill').style.width = '100%';
          document.getElementById('progressPercent').textContent = '100';

          // Mark all steps as done
          steps.forEach(step => {
            document.getElementById(step).classList.remove('active');
            document.getElementById(step).classList.add('done');
          });

          // Save blocker result to sessionStorage (backup)
          sessionStorage.setItem('firstBlocker', JSON.stringify(blocker));

          // Store analysis on server and get ID
          return fetch('/api/planner/store-analysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: analysis
          }).then(r => r.json());
        })
        .then(storeResult => {
          const analysisId = storeResult.analysisId;

          // Redirect to plan with analysisId
          setTimeout(() => {
            window.location.href = '/plan?aid=' + analysisId;
          }, 1500);
        })
        .catch(e => {
          clearInterval(interval);
          console.error('Error in loader:', e);
          const analysisId = sessionStorage.getItem('analysisId');
          const redirectPath = analysisId ? ('/plan?aid=' + analysisId) : '/plan';
          setTimeout(() => {
            window.location.href = redirectPath;
          }, 2000);
        });
    }

    startAnalysis();
  </script>
</body>
</html>`;
}
