export const SWAGGER_SPEC = {
  openapi: '3.0.0',
  info: {
    title: 'ABS API',
    version: '1.0.0',
    description: 'Automatic Business Software API',
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Local development',
    },
  ],
  paths: {
    '/api/v1/expedientes': {
      get: {
        summary: 'Listar expedientes',
        parameters: [
          { name: 'estado', in: 'query', schema: { type: 'string' } },
          { name: 'cliente', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: { type: 'array', items: { type: 'object' } },
              },
            },
          },
        },
      },
    },
    '/api/v1/expedientes/{id}': {
      get: {
        summary: 'Obtener expediente por ID',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'OK',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          404: { description: 'Not Found' },
        },
      },
    },
    '/api/v1/tareas': {
      get: {
        summary: 'Listar tareas',
        parameters: [
          { name: 'estado', in: 'query', schema: { type: 'string' } },
          { name: 'prioridad', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: { type: 'array', items: { type: 'object' } },
              },
            },
          },
        },
      },
      post: {
        summary: 'Crear tarea',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  texto: { type: 'string' },
                  prioridad: { type: 'string', enum: ['baja', 'media', 'alta'] },
                  asignadoA: { type: 'string' },
                },
                required: ['texto'],
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Created',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
        },
      },
    },
    '/api/v1/tareas/batch': {
      post: {
        summary: 'Crear múltiples tareas',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  tareas: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        texto: { type: 'string' },
                        prioridad: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    created: { type: 'number' },
                    failed: { type: 'array' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/webhooks': {
      get: {
        summary: 'Listar webhooks',
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: { type: 'array', items: { type: 'object' } },
              },
            },
          },
        },
      },
      post: {
        summary: 'Registrar webhook',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                  eventos: { type: 'array', items: { type: 'string' } },
                  secret: { type: 'string' },
                },
                required: ['url', 'eventos'],
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Created',
            content: { 'application/json': { schema: { type: 'object' } } },
          },
        },
      },
    },
    '/api/v1/webhooks/{id}/test': {
      post: {
        summary: 'Probar webhook',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    statusCode: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  security: [{ bearerAuth: [] }],
};
