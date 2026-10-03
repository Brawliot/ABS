import http from 'node:http';
import { SqliteTareasCrmStore } from '../adapters/sqlite-tareas-crm-store.js';
import { GestorWebhooksSalientes } from '../communication/webhooks-salientes.js';

export interface ApiContext {
  readonly tareasStore: SqliteTareasCrmStore;
  readonly webhooksStore: GestorWebhooksSalientes;
}

export function setupApiV1(server: http.Server, context: ApiContext): void {
  // GET /api/v1/tareas
  if (!server.listeners('request')[0]) {
    server.on('request', async (req, res) => {
      if (req.method === 'GET' && req.url === '/api/v1/tareas') {
        try {
          const tareas = context.tareasStore.listarTareas();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(tareas));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
      }
      // POST /api/v1/tareas
      else if (req.method === 'POST' && req.url === '/api/v1/tareas') {
        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const tarea = context.tareasStore.crearTarea(
              data.texto,
              data.prioridad || 'media',
              data.asignadoA,
              data.vencimiento ? new Date(data.vencimiento) : undefined,
            );
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(tarea));
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Bad Request' }));
          }
        });
      }
      // POST /api/v1/tareas/batch
      else if (req.method === 'POST' && req.url === '/api/v1/tareas/batch') {
        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const resultados = [];
            const errores = [];

            for (let i = 0; i < (data.tareas?.length || 0); i++) {
              try {
                const t = data.tareas[i];
                context.tareasStore.crearTarea(
                  t.texto,
                  t.prioridad || 'media',
                  t.asignadoA,
                  t.vencimiento ? new Date(t.vencimiento) : undefined,
                );
                resultados.push(i);
              } catch (e) {
                errores.push({
                  idx: i,
                  error: e instanceof Error ? e.message : 'Error desconocido',
                });
              }
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ created: resultados.length, failed: errores }));
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Bad Request' }));
          }
        });
      }
      // GET /api/v1/webhooks
      else if (req.method === 'GET' && req.url === '/api/v1/webhooks') {
        try {
          const webhooks = context.webhooksStore.listarWebhooks();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(webhooks));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
      }
      // POST /api/v1/webhooks
      else if (req.method === 'POST' && req.url === '/api/v1/webhooks') {
        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const webhook = context.webhooksStore.registrarWebhook(
              data.url,
              data.eventos,
              data.secret,
            );
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(webhook));
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Bad Request' }));
          }
        });
      }
      // POST /api/v1/webhooks/:id/test
      else if (req.method === 'POST' && req.url?.match(/^\/api\/v1\/webhooks\/[^/]+\/test$/)) {
        const parts = (req.url ?? '').split('/');
        const webhookId = parts[4] ?? '';
        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });
        req.on('end', async () => {
          try {
            const result = await context.webhooksStore.probarWebhook(webhookId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal Server Error' }));
          }
        });
      }
    });
  }
}
