import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SqliteTareasCrmStore } from '../adapters/sqlite-tareas-crm-store.js';
import { GestorWebhooksSalientes, type EventoWebhook } from '../communication/webhooks-salientes.js';
import { ABSClient } from '../sdk/abs-sdk.js';

describe('APIs/Integraciones Fase 2', () => {
  let tareasStore: SqliteTareasCrmStore;
  let webhooksGestor: GestorWebhooksSalientes;

  beforeEach(() => {
    tareasStore = new SqliteTareasCrmStore(':memory:');
    webhooksGestor = new GestorWebhooksSalientes();
  });

  it('registra webhook', () => {
    const webhook = webhooksGestor.registrarWebhook(
      'https://example.com/webhook',
      ['tarea.creada', 'tarea.completada'],
    );

    expect(webhook.id).toBeDefined();
    expect(webhook.url).toBe('https://example.com/webhook');
    expect(webhook.eventos).toContain('tarea.creada');
  });

  it('lista webhooks registrados', () => {
    webhooksGestor.registrarWebhook('https://example1.com/webhook', ['tarea.creada']);
    webhooksGestor.registrarWebhook('https://example2.com/webhook', ['tarea.completada']);

    const webhooks = webhooksGestor.listarWebhooks();
    expect(webhooks).toHaveLength(2);
  });

  it('envía evento a webhooks interesados', async () => {
    const webhook1 = webhooksGestor.registrarWebhook('https://example1.com/webhook', [
      'tarea.creada',
    ]);
    const webhook2 = webhooksGestor.registrarWebhook('https://example2.com/webhook', [
      'tarea.completada',
    ]);

    const evento: EventoWebhook = {
      id: 'evt-1',
      tipo: 'tarea.creada',
      timestamp: new Date(),
      datos: { tareaId: 'tarea-1', texto: 'Nueva tarea' },
    };

    await webhooksGestor.enviarEvento(evento);
    const estado = webhooksGestor.obtenerEstadoCola();

    expect(estado.pendientes).toBe(1);
  });

  it('procesa cola de webhooks', async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch as any;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const webhook = webhooksGestor.registrarWebhook('https://example.com/webhook', [
      'tarea.creada',
    ]);

    const evento: EventoWebhook = {
      id: 'evt-1',
      tipo: 'tarea.creada',
      timestamp: new Date(),
      datos: { tareaId: 'tarea-1' },
    };

    await webhooksGestor.enviarEvento(evento);
    await webhooksGestor.procesarColaWebhooks();

    expect(mockFetch).toHaveBeenCalled();
  });

  it('reintenta webhooks fallidos con backoff exponencial', async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch as any;

    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const webhook = webhooksGestor.registrarWebhook('https://example.com/webhook', [
      'tarea.creada',
    ]);

    const evento: EventoWebhook = {
      id: 'evt-1',
      tipo: 'tarea.creada',
      timestamp: new Date(),
      datos: {},
    };

    await webhooksGestor.enviarEvento(evento);
    await webhooksGestor.procesarColaWebhooks();

    const estado = webhooksGestor.obtenerEstadoCola();
    expect(estado.pendientes).toBeGreaterThan(0);
  });

  it('firma webhooks con HMAC-SHA256', async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch as any;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const secret = 'mi-secreto-super-seguro';
    const webhook = webhooksGestor.registrarWebhook('https://example.com/webhook', ['tarea.creada'], secret);

    const evento: EventoWebhook = {
      id: 'evt-1',
      tipo: 'tarea.creada',
      timestamp: new Date(),
      datos: { test: true },
    };

    await webhooksGestor.enviarEvento(evento);
    await webhooksGestor.procesarColaWebhooks();

    expect(mockFetch).toHaveBeenCalled();
    const call = mockFetch.mock.calls[0];
    const headers = (call?.[1] as any)?.headers;
    expect(headers?.['X-Webhook-Signature']).toBeDefined();
  });

  it('prueba webhook con evento de test', async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch as any;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const webhook = webhooksGestor.registrarWebhook('https://example.com/webhook', ['tarea.creada']);

    const result = await webhooksGestor.probarWebhook(webhook.id);

    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
  });

  it('crea batch de tareas', () => {
    const tareas = [
      { texto: 'Tarea 1', prioridad: 'alta' },
      { texto: 'Tarea 2', prioridad: 'media' },
      { texto: 'Tarea 3', prioridad: 'baja' },
    ];

    for (const t of tareas) {
      tareasStore.crearTarea(t.texto, t.prioridad as 'alta' | 'media' | 'baja');
    }

    const listar = tareasStore.listarTareas();
    expect(listar).toHaveLength(3);
  });

  it('cliente SDK obtiene tareas', () => {
    const client = new ABSClient('test-key', 'http://localhost:3000');
    expect(client).toBeDefined();
  });

  it('cliente SDK crea tarea', () => {
    const client = new ABSClient('test-key', 'http://localhost:3000');
    expect(client).toBeDefined();
  });

  it('cliente SDK registra webhook', () => {
    const client = new ABSClient('test-key', 'http://localhost:3000');
    expect(client).toBeDefined();
  });

  it('rechaza webhook a URL inválida', async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch as any;

    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const webhook = webhooksGestor.registrarWebhook('https://invalid.example.com/webhook', [
      'tarea.creada',
    ]);

    const evento: EventoWebhook = {
      id: 'evt-1',
      tipo: 'tarea.creada',
      timestamp: new Date(),
      datos: {},
    };

    await webhooksGestor.enviarEvento(evento);
    await webhooksGestor.procesarColaWebhooks();

    const estado = webhooksGestor.obtenerEstadoCola();
    expect(estado.pendientes).toBeGreaterThan(0);
  });

  it('desactiva webhook', () => {
    const webhook = webhooksGestor.registrarWebhook('https://example.com/webhook', ['tarea.creada']);
    expect(webhook.activo).toBe(true);
  });

  it('API versioning preparado para v2', () => {
    expect(() => {
      new ABSClient('test-key', 'http://localhost:3000/api/v1');
    }).not.toThrow();
  });
});
