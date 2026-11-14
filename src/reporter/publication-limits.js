/**
 * Módulo de publicación continua y control de límites de uso (HU08 - T5)
 *
 * Responsable asignado en Sprint 1: Germán Peláez Gallardo (GG)
 * Revisor asignado: Candela Marco Jiménez (CJ)
 *
 * La Action no impone ningún tope propio al número de informes publicados: si
 * se le entrega una lista de N informes, publica los N. El único límite real
 * es la cuota de peticiones de la API de GitHub, que se gestiona de forma
 * reactiva (sin sondear `rateLimit.get()` en cada publicación: esa consulta no
 * consume cuota primaria, pero sí puede computar para el límite secundario)
 * respetando las cabeceras `retry-after` y `x-ratelimit-reset` que devuelve
 * GitHub al rechazar una petición.
 */

const { notifyPullRequest } = require('./pr-notifier');

const DEFAULT_RETRY_DELAY_MS = 1000;
const DEFAULT_MAX_RETRY_DELAY_MS = 120000;
const DEFAULT_MAX_ATTEMPTS = 4;

/**
 * Los límites secundarios sin `retry-after` obligan a esperar al menos un
 * minuto antes de reintentar (documentación de la API REST de GitHub).
 */
const SECONDARY_MIN_DELAY_MS = 60000;

const RATE_LIMIT_STATUSES = [403, 429];
const RATE_LIMIT_MESSAGE_PATTERN = /rate limit|abuse detection/i;
const SECONDARY_RATE_LIMIT_PATTERN = /secondary rate limit|abuse detection/i;

/**
 * Normaliza un retardo en milisegundos.
 * @param {*} value
 * @param {number} fallback
 * @returns {number}
 */
function normalizeDelayMs(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const delay = Number(value);
  return Number.isFinite(delay) && delay >= 0 ? delay : fallback;
}

/**
 * Normaliza el número máximo de intentos por informe.
 * @param {*} value
 * @returns {number}
 */
function normalizeMaxAttempts(value) {
  const attempts = Number(value);
  return Number.isInteger(attempts) && attempts > 0 ? attempts : DEFAULT_MAX_ATTEMPTS;
}

/**
 * Busca una cabecera sin depender de que Node normalice las mayúsculas.
 * @param {object|undefined} headers
 * @param {string} name
 * @returns {*}
 */
function getHeader(headers, name) {
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }
  const key = Object.keys(headers).find(
    (headerName) => headerName.toLowerCase() === name.toLowerCase(),
  );
  return key === undefined ? undefined : headers[key];
}

/**
 * Extrae de un error de Octokit los datos relevantes para decidir una espera.
 * @param {*} error
 * @returns {{status: number, headers: object, message: string}}
 */
function normalizeError(error) {
  if (!error || typeof error !== 'object') {
    return { status: NaN, headers: {}, message: '' };
  }

  const response = error.response && typeof error.response === 'object' ? error.response : {};
  const message = error.message ?? response.data?.message ?? '';

  return {
    status: Number(error.status ?? response.status),
    headers: response.headers ?? error.headers ?? {},
    message: String(message),
  };
}

/**
 * Indica si un error corresponde a un límite de uso de la API de GitHub.
 *
 * Se contemplan los tres casos documentados: límite primario (403/429 con la
 * cuota agotada), límite secundario (403 "secondary rate limit") y respuestas
 * que incluyen `retry-after`.
 *
 * @param {*} error
 * @returns {boolean}
 */
function isRateLimitError(error) {
  const { status, headers, message } = normalizeError(error);

  if (!RATE_LIMIT_STATUSES.includes(status)) {
    return false;
  }
  if (status === 429) {
    return true;
  }

  const remaining = getHeader(headers, 'x-ratelimit-remaining');
  const retryAfter = getHeader(headers, 'retry-after');

  return (
    RATE_LIMIT_MESSAGE_PATTERN.test(message) ||
    String(remaining ?? '').trim() === '0' ||
    (retryAfter !== undefined && retryAfter !== null)
  );
}

/**
 * Convierte una cabecera `retry-after` (segundos o fecha HTTP) en milisegundos.
 * @param {*} value
 * @param {number} now - Marca de tiempo actual en milisegundos.
 * @returns {number|null} Retardo en ms, o null si no se puede interpretar.
 */
function parseRetryAfter(value, now) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(seconds, 0) * 1000;
  }

  const date = Date.parse(String(value));
  if (Number.isNaN(date)) {
    return null;
  }
  return Math.max(date - now, 0);
}

/**
 * Calcula cuánto hay que esperar antes de reintentar una publicación.
 *
 * Prioridad: `retry-after` (segundos o fecha) > `x-ratelimit-reset` >
 * retardo por defecto. El resultado queda acotado entre 0 y `maxRetryDelayMs`
 * para no bloquear el runner durante horas si la cuota tarda en reiniciarse.
 *
 * @param {*} error - Error devuelto por la API de GitHub.
 * @param {object} [options]
 * @param {number} [options.retryDelayMs] - Espera por defecto.
 * @param {number} [options.maxRetryDelayMs] - Espera máxima admitida.
 * @param {Function} [options.now] - Reloj inyectable para las pruebas.
 * @returns {number} Retardo en milisegundos.
 */
function resolveRetryDelayMs(error, options = {}) {
  const now = typeof options.now === 'function' ? options.now() : Date.now();
  const fallbackDelayMs = normalizeDelayMs(options.retryDelayMs, DEFAULT_RETRY_DELAY_MS);
  const maxRetryDelayMs = normalizeDelayMs(options.maxRetryDelayMs, DEFAULT_MAX_RETRY_DELAY_MS);
  const { headers, message } = normalizeError(error);

  let delay = parseRetryAfter(getHeader(headers, 'retry-after'), now);

  if (delay === null) {
    const reset = Number(getHeader(headers, 'x-ratelimit-reset'));
    if (Number.isFinite(reset) && reset > 0) {
      delay = Math.max(reset * 1000 - now, 0);
    }
  }

  if (delay === null || !Number.isFinite(delay)) {
    delay = SECONDARY_RATE_LIMIT_PATTERN.test(message) ? SECONDARY_MIN_DELAY_MS : fallbackDelayMs;
  }

  return Math.min(Math.max(delay, 0), maxRetryDelayMs);
}

/**
 * Espera real entre reintentos (sustituible en las pruebas).
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Publica una lista de informes de forma continua y sin tope propio.
 *
 * Un fallo aislado no interrumpe el resto de publicaciones: cada informe se
 * procesa de forma independiente y los límites de uso de GitHub se absorben
 * con reintentos, de modo que el servicio sigue operando mientras quede cuota.
 *
 * @param {object} client - Cliente de GitHub autenticado (Octokit).
 * @param {Array<object>} reports - Informes a publicar.
 * @param {object} [options]
 * @param {Function} [options.publish] - Función de publicación (por defecto `notifyPullRequest`).
 * @param {Function} [options.wait] - Función de espera, para no dormir en las pruebas.
 * @param {number} [options.maxAttempts] - Intentos por informe.
 * @param {number} [options.retryDelayMs] - Espera por defecto entre reintentos.
 * @param {number} [options.maxRetryDelayMs] - Espera máxima admitida.
 * @param {Function} [options.now] - Reloj inyectable para las pruebas.
 * @returns {Promise<{total: number, published: number, failed: number, retries: number, delays: number[], results: Array<object>}>}
 */
async function publishContinuously(client, reports, options = {}) {
  if (!Array.isArray(reports)) {
    throw new Error('La lista de informes a publicar debe ser un array.');
  }

  const publish =
    typeof options.publish === 'function'
      ? options.publish
      : (githubClient, report) => notifyPullRequest(githubClient, report);
  const wait = typeof options.wait === 'function' ? options.wait : sleep;
  const maxAttempts = normalizeMaxAttempts(options.maxAttempts);
  const maxRetryDelayMs = normalizeDelayMs(options.maxRetryDelayMs, DEFAULT_MAX_RETRY_DELAY_MS);

  const summary = {
    total: reports.length,
    published: 0,
    failed: 0,
    retries: 0,
    delays: [],
    results: [],
  };

  for (let index = 0; index < reports.length; index += 1) {
    const report = reports[index];
    let attempts = 0;
    let lastError = null;

    while (attempts < maxAttempts) {
      attempts += 1;
      try {
        const result = await publish(client, report, { index, attempt: attempts });
        summary.results.push({ index, status: 'published', attempts, result });
        summary.published += 1;
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (attempts >= maxAttempts || !isRateLimitError(error)) {
          break;
        }
        const baseDelay = resolveRetryDelayMs(error, options);
        const delay = Math.min(baseDelay * 2 ** (attempts - 1), maxRetryDelayMs);
        summary.delays.push(delay);
        summary.retries += 1;
        await wait(delay);
      }
    }

    if (lastError) {
      summary.failed += 1;
      summary.results.push({
        index,
        status: 'failed',
        attempts,
        error: lastError.message ?? String(lastError),
      });
    }
  }

  return summary;
}

module.exports = {
  isRateLimitError,
  resolveRetryDelayMs,
  publishContinuously,
};
