const {
  DEFAULT_METRIC_KEYS,
  SonarError,
  createSonarClient,
} = require('../../src/quality/sonar-client');
const { jsonResponse } = require('./helpers');

const TOKEN = 'secret-token';
const PROJECT_KEY = 'Aoex2612_Proyecto-GPS';

function createClient(overrides = {}) {
  return createSonarClient({
    token: TOKEN,
    projectKey: PROJECT_KEY,
    fetchImpl: jest.fn(),
    retryDelayMs: 0,
    ...overrides,
  });
}

describe('HU01-T4 - Cliente de SonarCloud', () => {
  test('exige token y project key para inicializarse', () => {
    expect(() => createSonarClient({ projectKey: PROJECT_KEY })).toThrow(SonarError);
    expect(() => createSonarClient({ token: TOKEN })).toThrow(SonarError);
  });

  test('consulta el Quality Gate con autenticación Basic y el project key', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse({ projectStatus: { status: 'OK', conditions: [] } }));
    const client = createClient({ fetchImpl });

    const gate = await client.getQualityGateStatus();

    expect(gate.status).toBe('OK');
    const [calledUrl, options] = fetchImpl.mock.calls[0];
    const parsed = new URL(calledUrl);
    expect(`${parsed.origin}${parsed.pathname}`).toBe(
      'https://sonarcloud.io/api/qualitygates/project_status',
    );
    expect(parsed.searchParams.get('projectKey')).toBe(PROJECT_KEY);
    expect(options.headers.Authorization).toBe(
      `Basic ${Buffer.from(`${TOKEN}:`).toString('base64')}`,
    );
    expect(options.headers.Accept).toBe('application/json');
  });

  test('recupera las medidas con la lista de métricas por defecto', async () => {
    const measures = [{ metric: 'coverage', value: '90' }];
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ component: { measures } }));
    const client = createClient({ fetchImpl });

    await expect(client.getMeasures()).resolves.toEqual(measures);

    const [calledUrl] = fetchImpl.mock.calls[0];
    const parsed = new URL(calledUrl);
    expect(`${parsed.origin}${parsed.pathname}`).toBe(
      'https://sonarcloud.io/api/measures/component',
    );
    expect(parsed.searchParams.get('component')).toBe(PROJECT_KEY);
    expect(parsed.searchParams.get('metricKeys')).toBe(DEFAULT_METRIC_KEYS.join(','));
    expect(DEFAULT_METRIC_KEYS).toEqual(
      expect.arrayContaining(['complexity', 'cognitive_complexity', 'coverage']),
    );
  });

  test('recupera los issues abiertos del proyecto', async () => {
    const issues = [{ key: 'issue-1', rule: 'javascript:S1234' }];
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ issues }));
    const client = createClient({ fetchImpl });

    await expect(client.getIssues()).resolves.toEqual(issues);

    const [calledUrl] = fetchImpl.mock.calls[0];
    const parsed = new URL(calledUrl);
    expect(parsed.searchParams.get('componentKeys')).toBe(PROJECT_KEY);
    expect(parsed.searchParams.get('resolved')).toBe('false');
    expect(parsed.searchParams.get('types')).toBe('BUG,VULNERABILITY,CODE_SMELL');
  });

  test('collect agrega Quality Gate, medidas e issues', async () => {
    const fetchImpl = jest.fn(async (url) => {
      if (url.includes('project_status')) {
        return jsonResponse({
          projectStatus: { status: 'OK', conditions: [{ metricKey: 'coverage' }] },
        });
      }
      if (url.includes('measures/component')) {
        return jsonResponse({ component: { measures: [{ metric: 'coverage', value: '90' }] } });
      }
      return jsonResponse({ issues: [{ key: 'issue-1' }] });
    });
    const client = createClient({ fetchImpl });

    const result = await client.collect();

    expect(result.qualityGate).toBe('OK');
    expect(result.conditions).toHaveLength(1);
    expect(result.measures).toHaveLength(1);
    expect(result.issues).toHaveLength(1);
  });

  test('traduce un 401 en un error de credenciales sin filtrar el token', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 401 }));
    const client = createClient({ fetchImpl });

    await expect(client.getMeasures()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });
  });

  test('traduce un 404 en proyecto no encontrado', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 404 }));
    const client = createClient({ fetchImpl });

    await expect(client.getMeasures()).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });

  test('reintenta una vez ante un 429 y devuelve la respuesta posterior', async () => {
    const measures = [{ metric: 'coverage', value: '90' }];
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 429 }))
      .mockResolvedValueOnce(jsonResponse({ component: { measures } }));
    const client = createClient({ fetchImpl, maxRetries: 1 });

    await expect(client.getMeasures()).resolves.toEqual(measures);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test('agota los reintentos y devuelve error HTTP', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 503 }));
    const client = createClient({ fetchImpl, maxRetries: 1 });

    await expect(client.getMeasures()).rejects.toMatchObject({
      code: 'HTTP_ERROR',
      status: 503,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test('detecta una respuesta JSON malformada', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn(async () => {
        throw new Error('json inválido');
      }),
    });
    const client = createClient({ fetchImpl });

    await expect(client.getMeasures()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  test('aplica timeout a la petición', async () => {
    const fetchImpl = jest.fn(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            const error = new Error('operación abortada');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    const client = createClient({ fetchImpl, timeoutMs: 10, maxRetries: 0 });

    await expect(client.getMeasures()).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  test('redacta el token en los errores de red', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error(`fallo de red con ${TOKEN}`));
    const client = createClient({ fetchImpl, maxRetries: 0 });

    try {
      await client.getMeasures();
      throw new Error('La petición debía haber fallado');
    } catch (error) {
      expect(error).toBeInstanceOf(SonarError);
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.message).not.toContain(TOKEN);
      expect(error.message).toContain('***');
    }
  });

  test('normaliza una URL con barra final', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse({ projectStatus: { status: 'OK' } }));
    const client = createClient({ fetchImpl, hostUrl: 'https://sonarcloud.io/' });

    await client.getQualityGateStatus();

    const [calledUrl] = fetchImpl.mock.calls[0];
    expect(new URL(calledUrl).pathname).toBe('/api/qualitygates/project_status');
  });
});
