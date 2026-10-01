export class ABSClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl: string = 'https://api.abs.dev') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async getExpediente(id: string): Promise<any> {
    return this.request('GET', `/v1/expedientes/${id}`);
  }

  async listarExpedientes(filtros?: { estado?: string; cliente?: string }): Promise<any[]> {
    const query = new URLSearchParams();
    if (filtros?.estado) query.append('estado', filtros.estado);
    if (filtros?.cliente) query.append('cliente', filtros.cliente);

    return this.request('GET', `/v1/expedientes?${query.toString()}`);
  }

  async crearTarea(
    texto: string,
    prioridad: 'baja' | 'media' | 'alta' = 'media',
    asignadoA?: string,
  ): Promise<any> {
    return this.request('POST', '/v1/tareas', {
      texto,
      prioridad,
      asignadoA,
    });
  }

  async listarTareas(filtros?: { estado?: string; prioridad?: string }): Promise<any[]> {
    const query = new URLSearchParams();
    if (filtros?.estado) query.append('estado', filtros.estado);
    if (filtros?.prioridad) query.append('prioridad', filtros.prioridad);

    return this.request('GET', `/v1/tareas?${query.toString()}`);
  }

  async crearTareasBatch(tareas: Array<{ texto: string; prioridad?: string }>): Promise<any> {
    return this.request('POST', '/v1/tareas/batch', { tareas });
  }

  async registrarWebhook(url: string, eventos: string[], secret?: string): Promise<any> {
    return this.request('POST', '/v1/webhooks', {
      url,
      eventos,
      secret,
    });
  }

  async listarWebhooks(): Promise<any[]> {
    return this.request('GET', '/v1/webhooks');
  }

  async probarWebhook(webhookId: string): Promise<{ ok: boolean; statusCode?: number; error?: string }> {
    return this.request('POST', `/v1/webhooks/${webhookId}/test`);
  }

  private async request(method: string, path: string, body?: any): Promise<any> {
    const requestInit: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      requestInit.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}${path}`, requestInit);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${response.status} ${response.statusText} - ${error}`);
    }

    return response.json();
  }
}

export default ABSClient;
