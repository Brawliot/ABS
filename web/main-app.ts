/**
 * Página principal: Hero + Pricing + Contacto
 * Con modales de autenticación (Login/Signup con GitHub y Google)
 * GET /app (HTML público)
 * GET /dashboard (HTML protegido, requiere auth)
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

    /* HERO */
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
      transition: opacity 0.3s ease;
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
      cursor: pointer;
      border: none;
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

    /* MODALES */
    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      z-index: 2000;
      align-items: center;
      justify-content: center;
    }

    .modal.active {
      display: flex;
    }

    .modal-content {
      background: white;
      border-radius: 12px;
      padding: 40px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2);
      animation: slideUp 0.3s ease;
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .modal-header {
      margin-bottom: 30px;
      text-align: center;
    }

    .modal-header h2 {
      font-size: 1.8em;
      margin: 0 0 10px;
    }

    .modal-close {
      position: absolute;
      top: 15px;
      right: 15px;
      background: none;
      border: none;
      font-size: 1.5em;
      cursor: pointer;
      color: var(--light);
    }

    .oauth-buttons {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 20px;
    }

    .oauth-btn {
      padding: 12px;
      border: 1.5px solid var(--border);
      border-radius: 6px;
      background: white;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.3s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .oauth-btn:hover {
      background: #f9fafb;
      border-color: var(--primary);
    }

    .divider {
      text-align: center;
      margin: 20px 0;
      color: var(--light);
      position: relative;
    }

    .divider::before,
    .divider::after {
      content: "";
      position: absolute;
      top: 50%;
      width: 45%;
      height: 1px;
      background: var(--border);
    }

    .divider::before { left: 0; }
    .divider::after { right: 0; }

    .form-input {
      width: 100%;
      padding: 12px;
      margin-bottom: 15px;
      border: 1.5px solid var(--border);
      border-radius: 6px;
      font-family: inherit;
      font-size: 1em;
    }

    .form-input:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .submit-form-btn {
      width: 100%;
      padding: 12px;
      background: var(--primary);
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.3s;
    }

    .submit-form-btn:hover {
      opacity: 0.9;
    }

    .modal-toggle {
      text-align: center;
      font-size: 0.95em;
      color: var(--light);
      margin-top: 20px;
    }

    .modal-toggle button {
      background: none;
      border: none;
      color: var(--primary);
      cursor: pointer;
      font-weight: 700;
      text-decoration: underline;
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

      .sticky-header-content {
        flex-direction: column;
        gap: 10px;
        text-align: center;
      }

      .pricing-grid {
        grid-template-columns: 1fr;
      }

      footer .container {
        grid-template-columns: 1fr;
        gap: 30px;
      }

      .modal-content {
        padding: 30px;
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
      <button class="pricing-btn" onclick="openLoginModal()">Comienza ahora</button>
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
      <button class="sticky-cta" onclick="openLoginModal()">Acceso</button>
    </div>
  </div>

  <!-- HERO -->
  <div class="hero">
    <div class="hero-content">
      <h1>Gestiona tu negocio de forma inteligente</h1>
      <p class="hero-subtitle">Soluciones ágiles, resultados confiables. Automatiza, integra y crece.</p>
      <div class="hero-cta">
        <button class="btn btn-primary" onclick="openLoginModal()">Acceso</button>
        <button class="btn btn-secondary" onclick="document.getElementById('pricing').scrollIntoView({behavior: 'smooth'})">Ver planes</button>
      </div>
    </div>
  </div>

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
        <a href="#pricing">Precios</a>
        <a href="#howWorks">Cómo funciona</a>
      </div>
      <div>
        <h3>Empresa</h3>
        <a href="/web">Landing</a>
        <a href="#contacto">Contacto</a>
      </div>
      <div>
        <h3>Legal</h3>
        <a href="#">Privacidad</a>
        <a href="#">Términos</a>
      </div>
    </div>
    <div class="footer-bottom">
      <p>&copy; 2026 ${esc(nombre)}. Todos los derechos reservados.</p>
    </div>
  </footer>

  <!-- LOGIN MODAL -->
  <div class="modal" id="loginModal">
    <div class="modal-content" style="position: relative;">
      <button class="modal-close" onclick="closeModals()">✕</button>

      <div class="modal-header">
        <h2>Inicia sesión</h2>
        <p style="color: var(--light); margin: 0;">Accede a tu cuenta</p>
      </div>

      <div class="oauth-buttons">
        <button class="oauth-btn" onclick="loginWithProvider('github')">
          <span>🐙</span> Continuar con GitHub
        </button>
        <button class="oauth-btn" onclick="loginWithProvider('google')">
          <span>🔵</span> Continuar con Google
        </button>
      </div>

      <div class="divider">o</div>

      <form onsubmit="handleEmailLogin(event)">
        <input type="email" class="form-input" placeholder="tu@email.com" required />
        <input type="password" class="form-input" placeholder="Contraseña" required />
        <button type="submit" class="submit-form-btn">Inicia sesión</button>
      </form>

      <div class="modal-toggle">
        ¿No tienes cuenta?
        <button onclick="switchToSignup()">Regístrate</button>
      </div>
    </div>
  </div>

  <!-- SIGNUP MODAL -->
  <div class="modal" id="signupModal">
    <div class="modal-content" style="position: relative;">
      <button class="modal-close" onclick="closeModals()">✕</button>

      <div class="modal-header">
        <h2>Crea tu cuenta</h2>
        <p style="color: var(--light); margin: 0;">Únete a nosotros en minutos</p>
      </div>

      <div class="oauth-buttons">
        <button class="oauth-btn" onclick="loginWithProvider('github')">
          <span>🐙</span> Regístrate con GitHub
        </button>
        <button class="oauth-btn" onclick="loginWithProvider('google')">
          <span>🔵</span> Regístrate con Google
        </button>
      </div>

      <div class="divider">o</div>

      <form onsubmit="handleEmailSignup(event)">
        <input type="text" class="form-input" placeholder="Tu nombre" required />
        <input type="email" class="form-input" placeholder="tu@email.com" required />
        <input type="password" class="form-input" placeholder="Contraseña (min. 8 caracteres)" required minlength="8" />
        <button type="submit" class="submit-form-btn">Crear cuenta</button>
      </form>

      <div class="modal-toggle">
        ¿Ya tienes cuenta?
        <button onclick="switchToLogin()">Inicia sesión</button>
      </div>
    </div>
  </div>

  <script>
    // Sticky Header
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

    // Modal Management
    function openLoginModal() {
      closeModals();
      document.getElementById('loginModal').classList.add('active');
    }

    function openSignupModal() {
      closeModals();
      document.getElementById('signupModal').classList.add('active');
    }

    function closeModals() {
      document.getElementById('loginModal').classList.remove('active');
      document.getElementById('signupModal').classList.remove('active');
    }

    function switchToSignup() {
      openSignupModal();
    }

    function switchToLogin() {
      openLoginModal();
    }

    function loginWithProvider(provider) {
      window.location.href = '/auth/oauth-' + provider;
    }

    function handleEmailLogin(e) {
      e.preventDefault();
      const email = e.target.querySelector('input[type="email"]').value;
      const password = e.target.querySelector('input[type="password"]').value;
      // TODO: Enviar POST a /auth/login
      console.log('Login:', email, password);
      window.location.href = '/dashboard';
    }

    function handleEmailSignup(e) {
      e.preventDefault();
      const name = e.target.querySelector('input[type="text"]').value;
      const email = e.target.querySelectorAll('input[type="email"]')[0].value;
      const password = e.target.querySelector('input[type="password"]').value;
      // TODO: Enviar POST a /auth/signup
      console.log('Signup:', name, email, password);
      window.location.href = '/dashboard';
    }

    // Close modals on outside click
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        closeModals();
      }
    });
  </script>
</body>
</html>`;
}

export function renderDashboardHtml(boot: AppBootResult): string {
  const css = estilosMainApp(boot);
  const nombre = esc(boot.brandName);

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(nombre)} — Dashboard</title>
  <style>
    ${css}

    .dashboard-wrapper {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    .dashboard-header {
      background: white;
      border-bottom: 1px solid var(--border);
      padding: 20px 30px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 10%;
      min-height: 60px;
    }

    .dashboard-header h1 {
      font-size: 1.5em;
      margin: 0;
      color: var(--text);
    }

    .dashboard-user {
      display: flex;
      align-items: center;
      gap: 15px;
    }

    .user-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--primary);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
    }

    .logout-btn {
      padding: 8px 16px;
      background: transparent;
      color: var(--primary);
      border: 1px solid var(--primary);
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.3s;
    }

    .logout-btn:hover {
      background: var(--primary);
      color: white;
    }

    .dashboard-body {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      padding: 30px;
      height: 90%;
      overflow-y: auto;
    }

    .dashboard-card {
      background: white;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
      transition: all 0.3s;
    }

    .dashboard-card:hover {
      box-shadow: 0 8px 20px rgba(0,0,0,0.1);
      border-color: var(--primary);
    }

    .dashboard-card h3 {
      margin: 0 0 15px;
      color: var(--text);
      font-size: 1.1em;
    }

    .dashboard-card p {
      margin: 0;
      color: var(--light);
      font-size: 0.95em;
      line-height: 1.6;
    }

    @media (max-width: 1200px) {
      .dashboard-body {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 768px) {
      .dashboard-body {
        grid-template-columns: 1fr;
      }

      .dashboard-header {
        flex-direction: column;
        gap: 15px;
        text-align: center;
      }
    }
  </style>
</head>
<body>
  <div class="dashboard-wrapper">
    <!-- HEADER 10% -->
    <div class="dashboard-header">
      <h1>${esc(nombre)}</h1>
      <div class="dashboard-user">
        <div class="user-avatar">JD</div>
        <div>
          <p style="margin: 0; font-weight: 600;">Juan Díaz</p>
          <p style="margin: 0; font-size: 0.85em; color: var(--light);">juan@empresa.com</p>
        </div>
        <button class="logout-btn" onclick="logout()">Salir</button>
      </div>
    </div>

    <!-- BODY 90% - 3 COLUMNAS -->
    <div class="dashboard-body">
      <div class="dashboard-card">
        <h3>📊 Resumen</h3>
        <p>Vista general de tu negocio con métricas clave en tiempo real.</p>
      </div>
      <div class="dashboard-card">
        <h3>📈 Reportes</h3>
        <p>Genera reportes detallados y exporta datos en múltiples formatos.</p>
      </div>
      <div class="dashboard-card">
        <h3>⚙️ Configuración</h3>
        <p>Personaliza tu experiencia y gestiona preferencias de cuenta.</p>
      </div>
    </div>
  </div>

  <script>
    function logout() {
      if (confirm('¿Quieres cerrar sesión?')) {
        window.location.href = '/app';
      }
    }
  </script>
</body>
</html>`;
}
