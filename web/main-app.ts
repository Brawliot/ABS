/**
 * Página principal: Hero sticky + Chatbot + Pricing + Contacto
 * GET /app (HTML con hero sticky, chatbot, precios)
 */

import type { AppBootResult } from "./types.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function estilosMainApp(boot: AppBootResult): string {
  const ds = boot.designSystem;
  const primaryColor = ds.tokens.colors.primary ?? "#3b82f6";
  const bgColor = ds.tokens.colors.neutrals.background ?? "#ffffff";
  const textColor = ds.tokens.colors.neutrals.text ?? "#1f2937";
  const borderColor = ds.tokens.colors.neutrals.border ?? "#e5e7eb";
  const lightColor = ds.tokens.colors.neutrals.textLight ?? "#6b7280";

  return `
    :root {
      --primary: ${esc(primaryColor)};
      --bg: ${esc(bgColor)};
      --text: ${esc(textColor)};
      --border: ${esc(borderColor)};
      --light: ${esc(lightColor)};
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      font-size: 16px;
    }

    .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }

    /* HERO STICKY */
    .hero {
      position: relative;
      background: linear-gradient(135deg, var(--primary) 0%, rgba(0,0,0,0.05) 100%);
      color: white;
      padding: 120px 20px 80px;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .hero-content {
      text-align: center;
      max-width: 700px;
      z-index: 10;
    }

    .hero h1 {
      font-size: clamp(2.5em, 6vw, 4em);
      font-weight: 700;
      margin-bottom: 20px;
      line-height: 1.2;
    }

    .hero-subtitle {
      font-size: 1.2em;
      opacity: 0.95;
      margin-bottom: 40px;
      max-width: 600px;
      margin-left: auto;
      margin-right: auto;
    }

    .hero-cta {
      display: inline-flex;
      gap: 15px;
      margin-bottom: 30px;
    }

    .btn {
      padding: 14px 32px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 1em;
      cursor: pointer;
      transition: all 0.3s ease;
      border: 2px solid transparent;
      text-decoration: none;
      display: inline-block;
    }

    .btn-primary {
      background: white;
      color: var(--primary);
      border-color: white;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 30px rgba(0,0,0,0.15);
    }

    .btn-secondary {
      background: transparent;
      color: white;
      border-color: white;
    }

    .btn-secondary:hover {
      background: rgba(255,255,255,0.1);
      transform: translateY(-2px);
    }

    /* HEADER STICKY */
    .sticky-header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid var(--border);
      z-index: 1000;
      padding: 12px 20px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease, padding 0.3s ease;
    }

    .sticky-header.active {
      opacity: 1;
      pointer-events: auto;
    }

    .sticky-header-content {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .sticky-title {
      font-size: 1.3em;
      font-weight: 700;
      color: var(--text);
    }

    .sticky-cta {
      padding: 10px 24px;
      background: var(--primary);
      color: white;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.95em;
      transition: all 0.3s ease;
    }

    .sticky-cta:hover {
      opacity: 0.9;
      transform: translateY(-2px);
    }

    /* SECCIONES */
    section {
      padding: 80px 20px;
    }

    section:nth-child(odd) {
      background: var(--bg);
    }

    section:nth-child(even) {
      background: #f9fafb;
    }

    section h2 {
      font-size: 2.5em;
      font-weight: 700;
      margin-bottom: 20px;
      text-align: center;
    }

    section > .container > p:first-of-type {
      font-size: 1.1em;
      color: var(--light);
      text-align: center;
      max-width: 600px;
      margin: 0 auto 40px;
    }

    /* CHATBOT SECTION */
    .chatbot-container {
      max-width: 900px;
      margin: 40px auto 0;
    }

    .chatbot-box {
      border: 2px solid var(--border);
      border-radius: 12px;
      background: white;
      display: flex;
      flex-direction: column;
      height: 500px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.08);
    }

    .chatbot-messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 15px;
    }

    .message {
      display: flex;
      gap: 12px;
      animation: slideIn 0.3s ease;
    }

    .message.user {
      justify-content: flex-end;
    }

    .message-bubble {
      max-width: 70%;
      padding: 12px 16px;
      border-radius: 12px;
      word-wrap: break-word;
    }

    .message.bot .message-bubble {
      background: #f0f0f0;
      color: var(--text);
    }

    .message.user .message-bubble {
      background: var(--primary);
      color: white;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .chatbot-input {
      padding: 15px;
      border-top: 1px solid var(--border);
      display: flex;
      gap: 10px;
    }

    .chatbot-input input {
      flex: 1;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px 12px;
      font-family: inherit;
      font-size: 1em;
    }

    .chatbot-input input:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .chatbot-input button {
      padding: 10px 20px;
      background: var(--primary);
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
    }

    .chatbot-input button:hover {
      opacity: 0.9;
    }

    .section-buttons {
      display: flex;
      gap: 20px;
      justify-content: center;
      margin-top: 40px;
      flex-wrap: wrap;
    }

    .section-buttons .btn {
      padding: 12px 28px;
      background: var(--primary);
      color: white;
      border-color: var(--primary);
    }

    .section-buttons .btn:hover {
      opacity: 0.9;
      transform: translateY(-2px);
    }

    /* PRICING */
    .pricing-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 30px;
      margin-top: 50px;
    }

    .pricing-card {
      border: 2px solid var(--border);
      border-radius: 12px;
      padding: 40px 30px;
      text-align: center;
      background: white;
      transition: all 0.3s ease;
      position: relative;
    }

    .pricing-card:hover {
      transform: translateY(-10px);
      border-color: var(--primary);
      box-shadow: 0 20px 40px rgba(0,0,0,0.1);
    }

    .pricing-card.featured {
      border-color: var(--primary);
      box-shadow: 0 20px 40px rgba(0,0,0,0.08);
    }

    .pricing-card.featured::before {
      content: "Recomendado";
      position: absolute;
      top: -12px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--primary);
      color: white;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 0.85em;
      font-weight: 700;
    }

    .pricing-name {
      font-size: 1.5em;
      font-weight: 700;
      margin-bottom: 10px;
    }

    .pricing-desc {
      color: var(--light);
      font-size: 0.95em;
      margin-bottom: 20px;
    }

    .pricing-price {
      font-size: 2.5em;
      font-weight: 700;
      color: var(--primary);
      margin: 20px 0;
    }

    .pricing-price small {
      font-size: 0.5em;
      color: var(--light);
      display: block;
      margin-top: 5px;
    }

    .pricing-features {
      text-align: left;
      margin: 30px 0;
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      padding: 20px 0;
    }

    .pricing-features li {
      list-style: none;
      padding: 10px 0;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .pricing-features li::before {
      content: "✓";
      color: var(--primary);
      font-weight: 700;
      font-size: 1.2em;
    }

    .pricing-btn {
      width: 100%;
      padding: 14px;
      background: var(--primary);
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.3s;
    }

    .pricing-btn:hover {
      opacity: 0.9;
      transform: translateY(-2px);
    }

    /* CONTACT SECTION */
    .contact-form {
      max-width: 600px;
      margin: 40px auto 0;
      background: white;
      padding: 40px;
      border-radius: 12px;
      border: 1px solid var(--border);
    }

    .form-group {
      margin-bottom: 25px;
    }

    label {
      display: block;
      margin-bottom: 8px;
      font-weight: 600;
      color: var(--text);
    }

    input[type="text"],
    input[type="email"],
    input[type="tel"],
    textarea {
      width: 100%;
      padding: 12px;
      border: 1.5px solid var(--border);
      border-radius: 6px;
      font-family: inherit;
      font-size: 1em;
      transition: all 0.2s;
    }

    input:focus,
    textarea:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    textarea {
      resize: vertical;
      min-height: 120px;
    }

    .submit-btn {
      width: 100%;
      padding: 14px;
      background: var(--primary);
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 700;
      font-size: 1.05em;
      cursor: pointer;
      transition: all 0.3s;
    }

    .submit-btn:hover {
      opacity: 0.9;
      transform: translateY(-2px);
    }

    /* FOOTER */
    footer {
      background: #1f2937;
      color: white;
      padding: 60px 20px 30px;
    }

    footer .container {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 40px;
      margin-bottom: 40px;
    }

    footer h3 {
      margin-bottom: 15px;
      color: #fff;
    }

    footer p {
      color: #9ca3af;
      font-size: 0.9em;
      margin-bottom: 8px;
    }

    footer a {
      color: #9ca3af;
      text-decoration: none;
      font-size: 0.9em;
      display: block;
      margin-bottom: 6px;
      transition: color 0.3s;
    }

    footer a:hover {
      color: white;
    }

    .footer-bottom {
      border-top: 1px solid #374151;
      padding-top: 30px;
      text-align: center;
      color: #9ca3af;
      font-size: 0.9em;
    }

    /* RESPONSIVE */
    @media (max-width: 768px) {
      .hero {
        padding: 80px 20px 60px;
        min-height: auto;
      }

      .hero h1 {
        font-size: 2em;
      }

      .hero-subtitle {
        font-size: 1em;
        margin-bottom: 30px;
      }

      .hero-cta {
        flex-direction: column;
        align-items: center;
      }

      section {
        padding: 60px 20px;
      }

      section h2 {
        font-size: 1.8em;
      }

      .chatbot-box {
        height: 400px;
      }

      .sticky-header-content {
        flex-direction: column;
        gap: 10px;
        text-align: center;
      }

      .pricing-grid {
        grid-template-columns: 1fr;
      }

      .section-buttons {
        flex-direction: column;
        gap: 15px;
      }

      .section-buttons .btn {
        width: 100%;
      }

      footer .container {
        grid-template-columns: 1fr;
        gap: 30px;
      }
    }

    @media (max-width: 480px) {
      body { font-size: 14px; }
      .hero { padding: 60px 15px 40px; }
      .hero h1 { font-size: 1.5em; }
      section { padding: 40px 15px; }
      section h2 { font-size: 1.4em; }
      .btn { padding: 12px 24px; font-size: 0.95em; }
    }
  `;
}

export function renderMainAppHtml(boot: AppBootResult): string {
  const css = estilosMainApp(boot);
  const nombre = esc(boot.brandName);
  const tiers = [
    {
      name: "Iniciador",
      desc: "Perfecto para comenzar",
      price: "49",
      features: ["Acceso básico", "Chat sin límite", "Reportes simples"],
    },
    {
      name: "Profesional",
      desc: "Para crecer",
      price: "129",
      features: ["Todo de Iniciador", "API integrada", "Reportes avanzados", "Soporte prioritario"],
      featured: true,
    },
    {
      name: "Empresa",
      desc: "Solución completa",
      price: "299",
      features: ["Todo de Profesional", "Usuarios ilimitados", "Análisis profundo", "Soporte 24/7"],
    },
  ];

  const pricingHtml = tiers
    .map(
      (tier) => `
    <div class="pricing-card${tier.featured ? " featured" : ""}">
      <div class="pricing-name">${esc(tier.name)}</div>
      <div class="pricing-desc">${esc(tier.desc)}</div>
      <div class="pricing-price">
        €${esc(tier.price)}
        <small>/mes</small>
      </div>
      <ul class="pricing-features">
        ${tier.features.map((f) => `<li>${esc(f)}</li>`).join("")}
      </ul>
      <button class="pricing-btn">Comienza ahora</button>
    </div>
  `,
    )
    .join("");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="Plataforma inteligente para tu negocio" />
  <title>${esc(nombre)} — Plataforma</title>
  <style>${css}</style>
</head>
<body>
  <!-- STICKY HEADER -->
  <div class="sticky-header" id="stickyHeader">
    <div class="sticky-header-content">
      <div class="sticky-title">${esc(nombre)}</div>
      <a href="#contacto" class="sticky-cta">Contáctanos</a>
    </div>
  </div>

  <!-- HERO -->
  <div class="hero">
    <div class="hero-content">
      <h1>Gestiona tu negocio de forma inteligente</h1>
      <p class="hero-subtitle">Soluciones ágiles, resultados confiables. Automatiza, integra y crece.</p>
      <div class="hero-cta">
        <button class="btn btn-primary" onclick="document.getElementById('chatbot').scrollIntoView({behavior: 'smooth'})">Probar ahora</button>
        <button class="btn btn-secondary" onclick="document.getElementById('howWorks').scrollIntoView({behavior: 'smooth'})">Cómo funciona</button>
      </div>
    </div>
  </div>

  <!-- CHATBOT SECTION -->
  <section id="chatbot">
    <div class="container">
      <h2>Pruébalo ahora</h2>
      <p>Empieza una conversación para conocer las capacidades de nuestro asistente</p>

      <div class="chatbot-container">
        <div class="chatbot-box">
          <div class="chatbot-messages" id="messages">
            <div class="message bot">
              <div class="message-bubble">¡Hola! Soy el asistente de ${esc(nombre)}. ¿En qué puedo ayudarte hoy? 👋</div>
            </div>
          </div>
          <div class="chatbot-input">
            <input type="text" id="chatInput" placeholder="Escribe tu mensaje..." />
            <button onclick="sendMessage()">Enviar</button>
          </div>
        </div>
      </div>

      <div class="section-buttons">
        <button class="btn btn-primary" onclick="document.getElementById('howWorks').scrollIntoView({behavior: 'smooth'})">Cómo funciona</button>
        <button class="btn btn-secondary" onclick="document.getElementById('pricing').scrollIntoView({behavior: 'smooth'})">Ver precios</button>
      </div>
    </div>
  </section>

  <!-- HOW IT WORKS SECTION -->
  <section id="howWorks">
    <div class="container">
      <h2>Cómo funciona</h2>
      <p>Tres pasos simples para empezar a transformar tu negocio</p>

      <div style="margin-top: 50px; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 30px;">
        <div style="text-align: center;">
          <div style="font-size: 3em; margin-bottom: 15px;">1️⃣</div>
          <h3 style="margin-bottom: 10px;">Conecta tus datos</h3>
          <p style="color: var(--light);">Integra con tus sistemas existentes en minutos</p>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 3em; margin-bottom: 15px;">2️⃣</div>
          <h3 style="margin-bottom: 10px;">Automatiza procesos</h3>
          <p style="color: var(--light);">Deja que la IA maneje las tareas repetitivas</p>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 3em; margin-bottom: 15px;">3️⃣</div>
          <h3 style="margin-bottom: 10px;">Mide el impacto</h3>
          <p style="color: var(--light);">Obtén insights en tiempo real y crece</p>
        </div>
      </div>
    </div>
  </section>

  <!-- PRICING SECTION -->
  <section id="pricing">
    <div class="container">
      <h2>Planes y precios</h2>
      <p>Elige el plan que mejor se ajuste a tu negocio</p>

      <div class="pricing-grid">
        ${pricingHtml}
      </div>
    </div>
  </section>

  <!-- CONTACT SECTION -->
  <section id="contacto">
    <div class="container">
      <h2>¿Preguntas?</h2>
      <p>Nuestro equipo está listo para ayudarte</p>

      <div class="contact-form">
        <form method="post" action="/app/contacto">
          <div class="form-group">
            <label for="nombre">Tu nombre</label>
            <input type="text" id="nombre" name="nombre" required placeholder="Juan García" />
          </div>
          <div class="form-group">
            <label for="email">Email</label>
            <input type="email" id="email" name="email" required placeholder="juan@empresa.com" />
          </div>
          <div class="form-group">
            <label for="empresa">Empresa</label>
            <input type="text" id="empresa" name="empresa" placeholder="Tu empresa" />
          </div>
          <div class="form-group">
            <label for="mensaje">Mensaje</label>
            <textarea id="mensaje" name="mensaje" placeholder="Cuéntanos en qué te podemos ayudar..."></textarea>
          </div>
          <button type="submit" class="submit-btn">Enviar mensaje</button>
        </form>
      </div>
    </div>
  </section>

  <!-- FOOTER -->
  <footer>
    <div class="container">
      <div>
        <h3>${esc(nombre)}</h3>
        <p>Plataforma inteligente para negocios modernos</p>
      </div>
      <div>
        <h3>Producto</h3>
        <a href="#chatbot">Probar</a>
        <a href="#pricing">Precios</a>
        <a href="#howWorks">Cómo funciona</a>
      </div>
      <div>
        <h3>Empresa</h3>
        <a href="/web">Landing</a>
        <a href="#contacto">Contacto</a>
        <a href="#">Blog</a>
      </div>
      <div>
        <h3>Legal</h3>
        <a href="#">Privacidad</a>
        <a href="#">Términos</a>
        <a href="#">Cookie</a>
      </div>
    </div>
    <div class="footer-bottom">
      <p>&copy; 2026 ${esc(nombre)}. Todos los derechos reservados.</p>
    </div>
  </footer>

  <script>
    // Sticky Header Logic
    const hero = document.querySelector('.hero');
    const stickyHeader = document.getElementById('stickyHeader');

    window.addEventListener('scroll', () => {
      const heroBottom = hero.offsetHeight;
      if (window.scrollY > heroBottom) {
        stickyHeader.classList.add('active');
      } else {
        stickyHeader.classList.remove('active');
      }
    });

    // Chatbot Logic
    const messagesContainer = document.getElementById('messages');
    const chatInput = document.getElementById('chatInput');

    function sendMessage() {
      const message = chatInput.value.trim();
      if (!message) return;

      // Add user message
      const userDiv = document.createElement('div');
      userDiv.className = 'message user';
      userDiv.innerHTML = \`<div class="message-bubble">\${message}</div>\`;
      messagesContainer.appendChild(userDiv);

      chatInput.value = '';
      messagesContainer.scrollTop = messagesContainer.scrollHeight;

      // Simulate bot response
      setTimeout(() => {
        const botDiv = document.createElement('div');
        botDiv.className = 'message bot';
        const responses = [
          '¡Excelente pregunta! Puedo ayudarte con eso.',
          'Perfecto. Te proporciono más información sobre eso.',
          'Entendido. Déjame darte los detalles que necesitas.',
          'Claro, aquí está lo que buscas.',
        ];
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        botDiv.innerHTML = \`<div class="message-bubble">\${randomResponse}</div>\`;
        messagesContainer.appendChild(botDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }, 800);
    }

    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  </script>
</body>
</html>`;
}
