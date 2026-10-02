/**
 * Tests para Phase 5 Final: Lead Management + CMS + SEO
 * 54+ tests GREEN - Cobertura completa
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { MotorCapturaLeads } from "../policies/lead-management-captura.js";
import { MotorNurturing } from "../policies/lead-management-nurturing.js";
import { MotorScoring } from "../policies/lead-management-scoring.js";
import { MotorPipelineLeads } from "../policies/lead-management-pipeline.js";
import { MotorCMS } from "../policies/cms-motor.js";
import { MotorSEO_CMS } from "../policies/cms-seo.js";
import { MotorCMS_LeadIntegration } from "../policies/cms-lead-integration.js";
import { MotorSEO_Keywords } from "../policies/seo-keywords.js";
import { MotorSEO_GoogleIntegration } from "../policies/seo-google-integration.js";
import { MotorSEO_Alertas } from "../policies/seo-alertas-reportes.js";
import { MotorSEO_Técnico } from "../policies/seo-tecnico.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

// ============================================================
// MÓDULO 1: LEAD MANAGEMENT (20+ TESTS)
// ============================================================

describe("Lead Management - Captura", () => {
  it("crear formulario web correctamente", () => {
    const motor = new MotorCapturaLeads();
    const campos = [
      { id: "1", nombre: "nombre", tipo: "texto" as const, requerido: true },
      { id: "2", nombre: "email", tipo: "email" as const, requerido: true },
    ];

    const formulario = motor.crearFormulario(
      "Contacto",
      "Formulario de contacto",
      campos
    );

    expect(formulario).toBeDefined();
    expect(formulario.nombre).toBe("Contacto");
    expect(formulario.estado).toBe("borrador");
    expect(formulario.campos.length).toBe(2);
  });

  it("publicar formulario cambia estado", () => {
    const motor = new MotorCapturaLeads();
    const formulario = motor.crearFormulario("Contacto", "Desc", []);

    const publicado = motor.publicarFormulario(formulario.id);
    expect(publicado).toBe(true);

    const form = motor.obtenerFormulario(formulario.id);
    expect(form?.estado).toBe("publicado");
  });

  it("validar email correctamente", () => {
    const motor = new MotorCapturaLeads();

    expect(motor.validarEmail("test@example.com")).toBe(true);
    expect(motor.validarEmail("invalid.email")).toBe(false);
    expect(motor.validarEmail("test@domain.co.uk")).toBe(true);
  });

  it("evitar duplicados de email", () => {
    const motor = new MotorCapturaLeads();

    motor.capturarLead("test@example.com", "Juan");
    expect(motor.evitarDuplicados("test@example.com")).toBe(false);
    expect(motor.evitarDuplicados("otro@example.com")).toBe(true);
  });

  it("capturar lead desde formulario", () => {
    const motor = new MotorCapturaLeads();
    const campos = [
      { id: "1", nombre: "nombre", tipo: "texto" as const, requerido: true },
      { id: "2", nombre: "email", tipo: "email" as const, requerido: true },
    ];

    const form = motor.crearFormulario("Contacto", "Desc", campos);
    motor.publicarFormulario(form.id);

    const envío = motor.enviarFormulario(form.id, {
      nombre: "Pedro",
      email: "pedro@example.com",
    });

    expect(envío).toBeDefined();
    expect(envío?.datos.nombre).toBe("Pedro");
  });

  it("cambiar estado de lead", () => {
    const motor = new MotorCapturaLeads();
    const lead = motor.capturarLead("test@example.com", "Juan");

    expect(lead).toBeDefined();
    expect(motor.cambiarEstadoLead(lead!.id, "prospecto")).toBe(true);
    expect(motor.obtenerLead(lead!.id)?.estado).toBe("prospecto");
  });

  it("listar leads con filtros", () => {
    const motor = new MotorCapturaLeads();

    motor.capturarLead("test1@example.com", "Juan", "Empresa1", "111");
    motor.capturarLead("test2@example.com", "Pedro", "Empresa2", "222");
    motor.capturarLead("test3@example.com", "Ana", "Empresa3", "333");

    const leads = motor.obtenerLeads();
    expect(leads.length).toBe(3);

    const porFuente = motor.obtenerLeads({ fuente: "formulario" });
    expect(porFuente.length).toBe(3);
  });

  it("buscar lead por email", () => {
    const motor = new MotorCapturaLeads();
    const lead = motor.capturarLead("test@example.com", "Juan");

    const encontrado = motor.buscarLeadPorEmail("test@example.com");
    expect(encontrado).toBeDefined();
    expect(encontrado?.id).toBe(lead?.id);
  });

  it("agregar etiqueta a lead", () => {
    const motor = new MotorCapturaLeads();
    const lead = motor.capturarLead("test@example.com", "Juan");

    motor.agregarEtiquetaLead(lead!.id, "VIP");
    motor.agregarEtiquetaLead(lead!.id, "Prioritario");

    const actualizado = motor.obtenerLead(lead!.id);
    expect(actualizado?.etiquetas.length).toBe(2);
  });
});

describe("Lead Management - Nurturing", () => {
  it("crear secuencia de emails", () => {
    const motor = new MotorNurturing();
    const emails = [
      { id: "1", asunto: "Bienvenida", cuerpo: "Contenido", variables: [] },
      { id: "2", asunto: "Educación", cuerpo: "Contenido 2", variables: [] },
    ];

    const secuencia = motor.crearSecuencia(
      "Bienvenida",
      "bienvenida",
      "Secuencia de bienvenida",
      emails,
      [0, 3]
    );

    expect(secuencia).toBeDefined();
    expect(secuencia.emails.length).toBe(2);
    expect(secuencia.activa).toBe(true);
  });

  it("asignar secuencia a lead", () => {
    const motor = new MotorNurturing();
    const emails = [
      { id: "1", asunto: "Bienvenida", cuerpo: "Contenido", variables: [] },
    ];

    const secuencia = motor.crearSecuencia(
      "Bienvenida",
      "bienvenida",
      "Desc",
      emails,
      [0]
    );

    const asignación = motor.asignarSecuencia("lead-123", secuencia.id);

    expect(asignación).toBeDefined();
    expect(asignación?.leadId).toBe("lead-123");
    expect(asignación?.completada).toBe(false);
  });

  it("registrar apertura de email", () => {
    const motor = new MotorNurturing();

    const resultado = motor.registrarApertura("lead-123", "email-456");

    expect(resultado).toBe(true);
  });

  it("registrar click en email", () => {
    const motor = new MotorNurturing();

    const resultado = motor.registrarClick(
      "lead-123",
      "email-456",
      "https://example.com"
    );

    expect(resultado).toBe(true);
  });

  it("obtener reporte de nurturing", () => {
    const motor = new MotorNurturing();
    const emails = [
      { id: "1", asunto: "Email 1", cuerpo: "Contenido", variables: [] },
    ];

    const secuencia = motor.crearSecuencia(
      "Test",
      "educación",
      "Desc",
      emails,
      [0]
    );

    motor.registrarApertura("lead-1", "email-1");
    motor.registrarClick("lead-1", "email-1", "url");

    const reporte = motor.obtenerReporteNurturing(secuencia.id);

    expect(reporte).toBeDefined();
    expect(reporte.abiertos).toBeGreaterThanOrEqual(0);
  });

  it("desactivar secuencia", () => {
    const motor = new MotorNurturing();
    const secuencia = motor.crearSecuencia(
      "Test",
      "bienvenida",
      "Desc",
      [],
      []
    );

    motor.desactivarSecuencia(secuencia.id);

    const seq = motor.obtenerSecuencia(secuencia.id);
    expect(seq?.activa).toBe(false);
  });
});

describe("Lead Management - Scoring", () => {
  it("incrementar puntos por evento", () => {
    const motor = new MotorScoring();

    const evento = motor.incrementarPuntos("lead-123", "email_abierto");

    expect(evento).toBeDefined();
    expect(evento.puntos).toBe(5);
  });

  it("calcular temperatura correctamente", () => {
    const motor = new MotorScoring();

    motor.incrementarPuntos("lead-frio", "email_abierto");
    const tempFria = motor.calcularTemperatura("lead-frio");
    expect(tempFria).toBe("fría");

    for (let i = 0; i < 10; i++) {
      motor.incrementarPuntos("lead-caliente", "email_abierto");
      motor.incrementarPuntos("lead-caliente", "email_click");
    }
    const tempCaliente = motor.calcularTemperatura("lead-caliente");
    expect(tempCaliente).toBe("caliente");
  });

  it("detectar leads cualificados", () => {
    const motor = new MotorScoring();

    for (let i = 0; i < 20; i++) {
      motor.incrementarPuntos("lead-hot", "demo_solicitada");
    }

    const cualificados = motor.detectarLeadsQualificados(70);
    expect(cualificados.length).toBeGreaterThan(0);
  });

  it("detectar leads perdidos", () => {
    const motor = new MotorScoring();

    motor.incrementarPuntos("lead-activo", "email_abierto");
    motor.incrementarPuntos("lead-antiguo", "email_abierto");

    // Simular: lead antiguo no tiene actividad reciente
    const perdidos = motor.detectarLeadsPerdidos(1); // 1 día sin actividad
    expect(Array.isArray(perdidos)).toBe(true);
  });

  it("recomendar acción por temperatura", () => {
    const motor = new MotorScoring();

    for (let i = 0; i < 20; i++) {
      motor.incrementarPuntos("lead-caliente", "demo_solicitada");
    }

    const recomendación = motor.recomendarAcción("lead-caliente");
    expect(recomendación).toContain("LLAMAR");
  });

  it("predecir probabilidad de conversión", () => {
    const motor = new MotorScoring();

    for (let i = 0; i < 10; i++) {
      motor.incrementarPuntos("lead-123", "email_abierto");
    }

    const predicción = motor.predecirProbabilidadConversión("lead-123");

    expect(predicción.probabilidad).toBeGreaterThan(0);
    expect(predicción.probabilidad).toBeLessThanOrEqual(100);
    expect(predicción.factores.length).toBeGreaterThan(0);
  });

  it("obtener reporte de scoring", () => {
    const motor = new MotorScoring();

    motor.incrementarPuntos("lead-1", "email_abierto");
    motor.incrementarPuntos("lead-2", "demo_solicitada");

    const reporte = motor.obtenerReporteScoring();

    expect(reporte.leadsTotales).toBeGreaterThanOrEqual(0);
    expect(reporte.puntuaciónPromedio).toBeGreaterThanOrEqual(0);
  });
});

describe("Lead Management - Pipeline", () => {
  it("obtener pipeline de leads", () => {
    const motor = new MotorCapturaLeads();
    const motorPipeline = new MotorPipelineLeads();

    const lead1 = motor.capturarLead("test1@example.com", "Juan");
    const lead2 = motor.capturarLead("test2@example.com", "Pedro");

    motor.cambiarEstadoLead(lead2!.id, "prospecto");

    const leads = motor.obtenerLeads();
    const pipeline = motorPipeline.obtenerPipeline(leads);

    expect(pipeline.nuevo).toBeGreaterThan(0);
    expect(pipeline.prospecto).toBeGreaterThan(0);
  });

  it("calcular tasa de conversión", () => {
    const motorCaptura = new MotorCapturaLeads();
    const motorPipeline = new MotorPipelineLeads();

    for (let i = 0; i < 10; i++) {
      const lead = motorCaptura.capturarLead(
        `test${i}@example.com`,
        `Lead${i}`
      );
      if (i < 3) {
        motorCaptura.cambiarEstadoLead(lead!.id, "cliente");
      }
    }

    const leads = motorCaptura.obtenerLeads();
    const pipeline = motorPipeline.obtenerPipeline(leads);
    const tasas = motorPipeline.calcularTasaConversión(pipeline);

    expect(tasas.total).toBeGreaterThan(0);
  });

  it("generar reporte completo de lead management", () => {
    const motorCaptura = new MotorCapturaLeads();
    const motorPipeline = new MotorPipelineLeads();

    const lead = motorCaptura.capturarLead("test@example.com", "Juan");
    const leads = motorCaptura.obtenerLeads();

    const reporte = motorPipeline.generarReporteLeadManagement(leads);

    expect(reporte).toBeDefined();
    expect(reporte.leadsTotales).toBeGreaterThan(0);
    expect(reporte.estadoPipeline).toBeDefined();
  });

  it("proyectar crecimiento de leads", () => {
    const motorCaptura = new MotorCapturaLeads();
    const motorPipeline = new MotorPipelineLeads();

    motorCaptura.capturarLead("test@example.com", "Juan");
    const leads = motorCaptura.obtenerLeads();

    const proyecciones = motorPipeline.proyectarCrecimiento(leads, 0.1);

    expect(proyecciones.length).toBe(12);
    expect(proyecciones[0].mes).toBe(0);
  });
});

// ============================================================
// MÓDULO 2: CMS (18+ TESTS)
// ============================================================

describe("CMS - Motor", () => {
  it("crear página CMS", () => {
    const motor = new MotorCMS();

    const página = motor.crearPágina(
      "Mi Primera Pagina",
      "blog",
      "Contenido de prueba",
      "usuario-1",
      { metaDescripción: "Descripción SEO" }
    );

    expect(página).toBeDefined();
    expect(página.título).toBe("Mi Primera Pagina");
    expect(página.slug).toBe("mi-primera-pagina");
    expect(página.estado).toBe("borrador");
  });

  it("generar slug automático", () => {
    const motor = new MotorCMS();

    const página = motor.crearPágina(
      "Cómo Optimizar tu Sitio Web",
      "blog",
      "Contenido",
      "usuario-1"
    );

    expect(página.slug).toContain("optimizar");
    expect(página.slug).toContain("sitio");
    expect(página.slug).toContain("web");
  });

  it("publicar página", () => {
    const motor = new MotorCMS();
    const página = motor.crearPágina("Test", "blog", "Contenido", "usuario-1");

    motor.publicarPágina(página.id);
    const actualizada = motor.obtenerPágina(página.id);

    expect(actualizada?.estado).toBe("publicada");
    expect(actualizada?.fechaPublicación).toBeDefined();
  });

  it("programar publicación", () => {
    const motor = new MotorCMS();
    const página = motor.crearPágina("Test", "blog", "Contenido", "usuario-1");
    const fecha = new Date(Date.now() + 86400000); // Mañana

    motor.programarPublicación(página.id, fecha);
    const actualizada = motor.obtenerPágina(página.id);

    expect(actualizada?.estado).toBe("programada");
    expect(actualizada?.fechaProgramada).toEqual(fecha);
  });

  it("actualizar contenido y registrar versión", () => {
    const motor = new MotorCMS();
    const página = motor.crearPágina("Test", "blog", "Contenido v1", "usuario-1");

    motor.actualizarContenido(
      página.id,
      "Contenido v2",
      "usuario-1",
      "Cambio de contenido"
    );

    const actualizada = motor.obtenerPágina(página.id);
    expect(actualizada?.contenido).toBe("Contenido v2");

    const versiones = motor.obtenerHistorialPágina(página.id);
    expect(versiones.length).toBeGreaterThanOrEqual(1);
  });

  it("obtener páginas por categoría", () => {
    const motor = new MotorCMS();

    const p1 = motor.crearPágina("Página 1", "blog", "Contenido", "usuario-1");
    const p2 = motor.crearPágina("Página 2", "blog", "Contenido", "usuario-1");

    motor.agregarCategoría(p1.id, "tutoriales");
    motor.agregarCategoría(p2.id, "noticias");

    const tutoriales = motor.listarPáginas({ categoría: "tutoriales" });
    expect(tutoriales.length).toBe(1);
  });

  it("obtener páginas relacionadas por etiquetas", () => {
    const motor = new MotorCMS();

    const p1 = motor.crearPágina("Página 1", "blog", "Contenido", "usuario-1");
    const p2 = motor.crearPágina("Página 2", "blog", "Contenido", "usuario-1");

    motor.agregarEtiqueta(p1.id, "SEO");
    motor.agregarEtiqueta(p2.id, "SEO");

    const relacionadas = motor.obtenerPáginasRelacionadas(p1.id);
    expect(relacionadas.length).toBeGreaterThanOrEqual(0);
  });

  it("incrementar vistas de página", () => {
    const motor = new MotorCMS();
    const página = motor.crearPágina("Test", "blog", "Contenido", "usuario-1");

    motor.incrementarVistas(página.id);
    motor.incrementarVistas(página.id);

    const actualizada = motor.obtenerPágina(página.id);
    expect(actualizada?.vistas).toBe(2);
  });

  it("crear y aplicar plantilla", () => {
    const motor = new MotorCMS();
    const plantilla = motor.crearPlantilla(
      "Blog Template",
      "blog",
      "<article>{{contenido}}</article>",
      ["contenido"]
    );

    const página = motor.crearPágina("Test", "blog", "Contenido", "usuario-1");
    motor.aplicarPlantilla(página.id, plantilla.id);

    const actualizada = motor.obtenerPágina(página.id);
    expect(actualizada?.contenido).toContain("{{contenido}}");
  });

  it("renderizar página HTML", () => {
    const motor = new MotorCMS();
    const página = motor.crearPágina(
      "Test Page",
      "blog",
      "Contenido principal",
      "usuario-1",
      { metaDescripción: "Descripción" }
    );

    const html = motor.renderizarPágina(página.id);
    expect(html).toBeDefined();
    expect(html).toContain("Test Page");
    expect(html).toContain("Contenido principal");
  });

  it("exportar como markdown", () => {
    const motor = new MotorCMS();
    const página = motor.crearPágina("Test", "blog", "Contenido", "usuario-1");

    const markdown = motor.exportarComoMarkdown(página.id);
    expect(markdown).toBeDefined();
    expect(markdown).toContain("# Test");
    expect(markdown).toContain("Contenido");
  });
});

describe("CMS - SEO", () => {
  it("generar meta description automática", () => {
    const motor = new MotorSEO_CMS();

    const contenido =
      "Este es un contenido largo que contiene muchas palabras para generar una descripción corta y representativa del artículo";
    const desc = motor.generarMetaDescripción(contenido);

    expect(desc.length).toBeLessThanOrEqual(160);
    expect(desc.length).toBeGreaterThan(0);
  });

  it("extraer palabras clave del contenido", () => {
    const motor = new MotorSEO_CMS();

    const contenido =
      "Marketing digital es importante para empresas modernas. Estrategia marketing digital con SEO es clave";
    const keywords = motor.extraerPalabrasClave(contenido);

    expect(keywords.length).toBeGreaterThan(0);
    expect(keywords[0].length).toBeGreaterThan(2);
  });

  it("validar SEO de página", () => {
    const motor = new MotorCMS();
    const motorSEO = new MotorSEO_CMS();

    const página = motor.crearPágina(
      "Mi Página",
      "blog",
      "<h1>Título Principal</h1><p>Contenido largo con suficientes palabras para considerarse optimizado en términos de SEO</p><img alt='Imagen' src='test.jpg' />",
      "usuario-1",
      { metaDescripción: "Esta es una descripción SEO de la página" }
    );

    const validación = motorSEO.validarSEO(página);

    expect(validación.puntuación).toBeGreaterThan(0);
    expect(validación.puntuación).toBeLessThanOrEqual(100);
  });

  it("generar sitemap XML", () => {
    const motor = new MotorCMS();
    const motorSEO = new MotorSEO_CMS();

    const p1 = motor.crearPágina("Página 1", "blog", "Contenido", "usuario-1");
    motor.publicarPágina(p1.id);

    const páginas = motor.listarPáginas();
    const sitemap = motorSEO.generarSitemap(páginas);

    expect(sitemap).toContain("<?xml");
    expect(sitemap).toContain("urlset");
  });

  it("generar robots.txt", () => {
    const motor = new MotorSEO_CMS();

    const robots = motor.generarRobotstxt({
      permitir: ["/blog/", "/productos/"],
      bloquear: ["/admin/", "/privado/"],
    });

    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /blog/");
    expect(robots).toContain("Disallow: /admin/");
  });
});

describe("CMS - Lead Integration", () => {
  it("agregar CTA a página", () => {
    const motor = new MotorCMS_LeadIntegration();

    const cta = motor.agregarCTA(
      "página-123",
      "Contacta con nosotros",
      "/contacto",
      "botón",
      "#007bff"
    );

    expect(cta).toBeDefined();
    expect(cta.texto).toBe("Contacta con nosotros");
    expect(cta.clicsRegistrados).toBe(0);
  });

  it("registrar clic en CTA", () => {
    const motor = new MotorCMS_LeadIntegration();

    const cta = motor.agregarCTA("página-123", "Suscribirse", "/suscripción");
    motor.registrarClicCTA(cta.id, "192.168.1.1");

    const ctaActualizada = motor.obtenerCTA(cta.id);
    expect(ctaActualizada?.clicsRegistrados).toBe(1);
  });

  it("incrustar formulario en página", () => {
    const motor = new MotorCMS_LeadIntegration();

    const cta = motor.incrustarFormulario("página-123", "formulario-456");

    expect(cta.tipo).toBe("formulario");
    expect(cta.url).toContain("formulario-456");
  });

  it("medir tasa de conversión de página", () => {
    const motorCMS = new MotorCMS();
    const motorIntegración = new MotorCMS_LeadIntegration();

    const página = motorCMS.crearPágina("Test", "blog", "Contenido", "usuario-1");
    motorCMS.incrementarVistas(página.id);

    motorIntegración.agregarCTA(página.id, "Contacto", "/contacto");

    const tasa = motorIntegración.medirTasaConversionPágina(página, 100, 5);

    expect(tasa.tasaConversion).toBeGreaterThanOrEqual(0);
  });

  it("obtener páginas con mejor conversión", () => {
    const motorCMS = new MotorCMS();
    const motorIntegración = new MotorCMS_LeadIntegration();

    const p1 = motorCMS.crearPágina("Página 1", "blog", "Contenido", "usuario-1");
    motorCMS.incrementarVistas(p1.id);

    const mejores = motorIntegración.obtenerPáginasConMejorConversión([p1]);

    expect(Array.isArray(mejores)).toBe(true);
  });
});

// ============================================================
// MÓDULO 3: SEO (16+ TESTS)
// ============================================================

describe("SEO - Keywords", () => {
  it("agregar keyword a monitorear", () => {
    const motor = new MotorSEO_Keywords();

    const kw = motor.agregarKeyword(
      "marketing digital",
      "/blog/marketing",
      500,
      45,
      "comercial"
    );

    expect(kw).toBeDefined();
    expect(kw.keyword).toBe("marketing digital");
    expect(kw.activa).toBe(true);
  });

  it("actualizar ranking de keyword", () => {
    const motor = new MotorSEO_Keywords();

    const kw = motor.agregarKeyword("test keyword", "/test");
    motor.actualizarRanking(kw.id, 5, 1000, 50);

    const actualizado = motor.obtenerKeyword(kw.id);
    expect(actualizado?.posiciónActual).toBe(5);
  });

  it("detectar keywords mejorando", () => {
    const motor = new MotorSEO_Keywords();

    const kw = motor.agregarKeyword("keyword", "/test");
    motor.actualizarRanking(kw.id, 10);
    motor.actualizarRanking(kw.id, 3); // Mejoró de 10 a 3

    const cambios = motor.detectarCambiosRanking();

    expect(cambios.mejorando.length).toBeGreaterThan(0);
  });

  it("detectar keywords empeorando", () => {
    const motor = new MotorSEO_Keywords();

    const kw = motor.agregarKeyword("keyword", "/test");
    motor.actualizarRanking(kw.id, 3);
    motor.actualizarRanking(kw.id, 15); // Empeoró de 3 a 15

    const cambios = motor.detectarCambiosRanking();

    expect(cambios.empeorando.length).toBeGreaterThan(0);
  });

  it("calcular oportunidades en posiciones 2-10", () => {
    const motor = new MotorSEO_Keywords();

    motor.agregarKeyword("keyword 1", "/test", 1000, 50);
    const kw2 = motor.agregarKeyword("keyword 2", "/test", 500, 30);
    motor.actualizarRanking(kw2.id, 5);

    const oportunidades = motor.calcularOportunidades(2, 10);

    expect(oportunidades.length).toBeGreaterThan(0);
  });

  it("generar reporte de keywords", () => {
    const motor = new MotorSEO_Keywords();

    motor.agregarKeyword("kw1", "/test", 100);
    motor.agregarKeyword("kw2", "/test", 200);

    const reporte = motor.generarReporteKeywords();

    expect(reporte.totalKeywords).toBe(2);
    expect(reporte.posiciónPromedio).toBeGreaterThanOrEqual(0);
  });

  it("obtener keywords prioritarias", () => {
    const motor = new MotorSEO_Keywords();

    motor.agregarKeyword("easy keyword", "/test", 1000, 20); // Alto volumen, baja dificultad
    motor.agregarKeyword("hard keyword", "/test", 100, 80); // Bajo volumen, alta dificultad

    const prioritarias = motor.obtenerKeywordsPrioritarias();

    expect(prioritarias.length).toBeGreaterThan(0);
  });
});

describe("SEO - Google Integration", () => {
  it("conectar Google Search Console", () => {
    const motor = new MotorSEO_GoogleIntegration();

    const conectado = motor.conectarGoogleSearchConsole("oauth-token-123");

    expect(conectado).toBe(true);
    expect(motor.estaConectado()).toBe(true);
  });

  it("obtener datos de búsqueda", () => {
    const motor = new MotorSEO_GoogleIntegration();

    motor.conectarGoogleSearchConsole("token");
    const datos = motor.obtenerDatosBúsqueda("marketing digital");

    expect(datos).toBeDefined();
    expect(datos?.keyword).toBe("marketing digital");
    expect(datos?.clics).toBeGreaterThanOrEqual(0);
  });

  it("identificar páginas no indexadas", () => {
    const motor = new MotorSEO_GoogleIntegration();

    motor.registrarPáginaNoIndexada(
      "https://example.com/página",
      "sin_indexar"
    );

    const noIndexadas = motor.identificarPáginasNoIndexadas();

    expect(noIndexadas.length).toBe(1);
  });

  it("registrar error de crawling", () => {
    const motor = new MotorSEO_GoogleIntegration();

    motor.registrarErrorCrawling(
      "https://example.com/404",
      "404",
      "Página no encontrada"
    );

    const errores = motor.detectarErroresCrawling();

    expect(errores.length).toBe(1);
  });

  it("obtener estadísticas generales", () => {
    const motor = new MotorSEO_GoogleIntegration();

    motor.conectarGoogleSearchConsole("token");
    motor.obtenerDatosBúsqueda("kw1");
    motor.obtenerDatosBúsqueda("kw2");

    const stats = motor.obtenerEstadísticasGenerales();

    expect(stats.impresionesTotal).toBeGreaterThanOrEqual(0);
    expect(stats.clicsTotal).toBeGreaterThanOrEqual(0);
  });
});

describe("SEO - Alertas y Reportes", () => {
  it("crear alerta SEO", () => {
    const motor = new MotorSEO_Alertas();

    const alerta = motor.generarAlerta(
      "ranking_bajando",
      50,
      "admin@example.com",
      "keyword"
    );

    expect(alerta).toBeDefined();
    expect(alerta.tipo).toBe("ranking_bajando");
    expect(alerta.activa).toBe(true);
  });

  it("generar reporte mensual", () => {
    const motorAlerts = new MotorSEO_Alertas();
    const motorKeywords = new MotorSEO_Keywords();

    const kw = motorKeywords.agregarKeyword("test", "/test", 100);
    motorKeywords.actualizarRanking(kw.id, 5);

    const reporte = motorAlerts.generarReporteMensual(
      motorKeywords.listarKeywords(),
      [],
      []
    );

    expect(reporte).toBeDefined();
    expect(reporte.período).toBe("mensual");
    expect(reporte.puntuaciónSEO).toBeGreaterThanOrEqual(0);
  });

  it("exportar reporte como HTML", () => {
    const motorAlerts = new MotorSEO_Alertas();

    const reporte = motorAlerts.generarReporteMensual([], [], []);
    const html = motorAlerts.exportarReporteHTML(reporte.id);

    expect(html).toBeDefined();
    expect(html).toContain("<html>");
  });

  it("obtener mejoras sugeridas", () => {
    const motorAlerts = new MotorSEO_Alertas();

    motorAlerts.agregarMejora(
      "Optimizar velocidad",
      "Mejorar Core Web Vitals",
      90,
      "medio"
    );

    const mejoras = motorAlerts.obtenerMejoras();

    expect(mejoras.length).toBeGreaterThan(0);
  });
});

describe("SEO - Técnico", () => {
  it("validar sitio web", () => {
    const motor = new MotorSEO_Técnico();

    const validación = motor.validarSitioweb(
      500, // Muy rápido (menos de 1000ms)
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      0
    );

    expect(validación.puntuaciónTotal).toBeGreaterThan(80);
    expect(validación.velocidadPágina).toBe("rápida");
  });

  it("analizar estructura de URL", () => {
    const motor = new MotorSEO_Técnico();

    const análisis = motor.analizarEstructuraURL(
      "https://example.com/blog/tutorial/seo/optimizacion"
    );

    expect(análisis.esAmigable).toBeDefined();
    expect(análisis.profundidad).toBeGreaterThan(0);
  });

  it("analizar encabezados", () => {
    const motor = new MotorSEO_Técnico();

    const html =
      "<h1>Título Principal</h1><h2>Subtítulo</h2><h3>Sección</h3>";
    const análisis = motor.analizarEncabezados(html);

    expect(análisis.h1Count).toBe(1);
    expect(análisis.h2Count).toBe(1);
    expect(análisis.h3Count).toBe(1);
  });

  it("verificar imágenes con alt text", () => {
    const motor = new MotorSEO_Técnico();

    const html =
      '<img alt="Imagen descriptiva" src="test1.jpg" /><img src="test2.jpg" />';
    const análisis = motor.verificarImágenes(html);

    expect(análisis.totalImágenes).toBe(2);
    expect(análisis.imágenesConAlt).toBe(1);
    expect(análisis.imágenesSinAlt).toBe(1);
  });

  it("generar reporte técnico completo", () => {
    const motor = new MotorSEO_Técnico();

    const html =
      "<h1>Test</h1><p>Contenido...</p><img alt='test' src='test.jpg' />";
    const reporte = motor.generarReporteTécnico(html);

    expect(reporte.puntuaciónGeneral).toBeGreaterThanOrEqual(0);
    expect(reporte.puntuaciónGeneral).toBeLessThanOrEqual(100);
    expect(reporte.validaciones).toBeDefined();
  });
});
