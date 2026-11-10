/**
 * Cliente de la API de SonarCloud (HU01 - T4)
 *
 * Responsable: Germán Peláez Gallardo (GG)
 * Revisor asignado: Félix Jiménez Almanza (FA)
 *
 * Encapsula las llamadas de solo lectura necesarias para recuperar el Quality
 * Gate, las medidas de complejidad/calidad y los issues abiertos del proyecto.
 * El token nunca se incluye en las URLs ni en los mensajes de error.
 */

const DEFAULT_METRIC_KEYS = Object.freeze([
  'complexity',
  'cognitive_complexity',
  'coverage',
  'line_coverage',
  'branch_coverage',
  'duplicated_lines_density',
  'code_smells',
  'bugs',
  'vulnerabilities',
  'security_hotspots',
  'sqale_index',
  'sqale_rating',
  'reliability_rating',
  'security_rating',
  'ncloc',
  'files',
]);

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 500;

/**
 * Error tipado del cliente de Sonar.
 */
class SonarError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   * @param {object} [options]
   * @param {number} [options.status]
   * @param {Error} [options.cause]
   */
  constructor(message, code, { status, cause } = {}) {
    super(message);
    this.name = 'SonarError';
    this.code = code;
    if (status !== undefined) {
      this.status = status;
    }
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

/**
 * Sustituye el token por un marcador para evitar fugas en los logs
 * @param {string} message
 * @param {string} token
 * @returns {string}
 */
function redactToken(message, token) {
  if (!message) {
    return '';
  }
  const text = String(message);
  if (!token) {
    return text;
  }
  return text.split(token).join('***');
}

/**
 * Traduce un código HTTP a un error tipado.
 * @param {number} status
 * @returns {SonarError}
 */
function mapHttpError(status) {
  if (status === 401 || status === 403) {
    return new SonarError('Credenciales de SonarQube inválidas o sin permisos', 'UNAUTHORIZED', {
      status,
    });
  }
  if (status === 404) {
    return new SonarError('Proyecto o recurso no encontrado en SonarQube', 'NOT_FOUND', { status });
  }
  return new SonarError(`SonarQube respondió ${status}`, 'HTTP_ERROR', { status });
}

/**
 * Espera el tiempo indicado antes de reintentar.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  if (!ms || ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Crea un cliente de solo lectura contra la API de SonarCloud/SonarQube.
 * @param {object} options
 * @param {string} options.token - Token de Sonar (nunca se registra).
 * @param {string} options.projectKey - Project key del proyecto.
 * @param {string} [options.hostUrl] - URL del servidor Sonar.
 * @param {Function} [options.fetchImpl] - Implementación de fetch (inyectable en tests).
 * @param {number} [options.timeoutMs] - Timeout por petición.
 * @param {number} [options.maxRetries] - Reintentos ante 429/5xx/red.
 * @param {number} [options.retryDelayMs] - Espera entre reintentos.
 * @returns {object}
 */
function createSonarClient({
  token,
  projectKey,
  hostUrl = 'https://sonarcloud.io',
  fetchImpl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
} = {}) {
  if (!token) {
    throw new SonarError('SONAR_TOKEN es obligatorio', 'MISSING_TOKEN');
  }
  if (!projectKey) {
    throw new SonarError('sonar-project-key es obligatorio', 'MISSING_PROJECT_KEY');
  }

  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new SonarError('fetch no está disponible en este entorno', 'NO_FETCH');
  }

  const baseUrl = String(hostUrl).replace(/\/+$/, '');
  const authorization = `Basic ${Buffer.from(`${token}:`).toString('base64')}`;

  /**
   * Ejecuta una petición GET con autenticación, timeout y reintentos.
   * @param {string} pathname
   * @param {object} [params]
   * @returns {Promise<object>}
   */
  async function request(pathname, params = {}) {
    const url = new URL(`${baseUrl}${pathname}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await doFetch(url.toString(), {
          method: 'GET',
          headers: {
            Authorization: authorization,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
            lastError = mapHttpError(response.status);
            await delay(retryDelayMs);
            continue;
          }
          throw mapHttpError(response.status);
        }

        try {
          return await response.json();
        } catch (cause) {
          throw new SonarError('Respuesta JSON inválida de SonarQube', 'INVALID_RESPONSE', {
            cause,
          });
        }
      } catch (error) {
        if (error instanceof SonarError) {
          throw error;
        }
        if (error.name === 'AbortError') {
          throw new SonarError(
            `Tiempo de espera agotado tras ${timeoutMs} ms al consultar SonarQube`,
            'TIMEOUT',
            { cause: error },
          );
        }
        if (attempt < maxRetries) {
          lastError = error;
          await delay(retryDelayMs);
          continue;
        }
        throw new SonarError(
          `Error de red al consultar SonarQube: ${redactToken(error.message, token)}`,
          'NETWORK_ERROR',
          { cause: error },
        );
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError || new SonarError('Error desconocido al consultar SonarQube', 'UNKNOWN');
  }

  /**
   * Recupera el estado del Quality Gate del proyecto.
   * @returns {Promise<{status: string, conditions: Array}>}
   */
  async function getQualityGateStatus() {
    const body = await request('/api/qualitygates/project_status', { projectKey });
    return body.projectStatus || { status: 'NONE', conditions: [] };
  }

  /**
   * Recupera las medidas del proyecto.
   * @param {string[]} [metricKeys]
   * @returns {Promise<Array>}
   */
  async function getMeasures(metricKeys = DEFAULT_METRIC_KEYS) {
    const body = await request('/api/measures/component', {
      component: projectKey,
      metricKeys: metricKeys.join(','),
    });
    return (body.component && body.component.measures) || [];
  }

  /**
   * Recupera los issues abiertos del proyecto.
   * @param {object} [options]
   * @param {number} [options.pageSize]
   * @returns {Promise<Array>}
   */
  async function getIssues({ pageSize = 100 } = {}) {
    const body = await request('/api/issues/search', {
      componentKeys: projectKey,
      resolved: 'false',
      ps: pageSize,
      types: 'BUG,VULNERABILITY,CODE_SMELL',
    });
    return body.issues || [];
  }

  /**
   * Recupera de forma agregada todo lo necesario para el reporte.
   * @param {string[]} [metricKeys]
   * @returns {Promise<{qualityGate: string, conditions: Array, measures: Array, issues: Array}>}
   */
  async function collect(metricKeys) {
    const [gate, measures, issues] = await Promise.all([
      getQualityGateStatus(),
      getMeasures(metricKeys),
      getIssues(),
    ]);

    return {
      qualityGate: gate.status || 'NONE',
      conditions: gate.conditions || [],
      measures,
      issues,
    };
  }

  return {
    projectKey,
    hostUrl: baseUrl,
    getQualityGateStatus,
    getMeasures,
    getIssues,
    collect,
  };
}

module.exports = {
  DEFAULT_METRIC_KEYS,
  SonarError,
  redactToken,
  createSonarClient,
};
