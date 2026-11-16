const { logger: defaultLogger } = require('./logger');

const RETRYABLE_STATUS_CODES = new Set([408, 429]);
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

function getResponseHeaders(error) {
  return error?.response?.headers || error?.headers || {};
}

function getHeader(headers, name) {
  if (typeof headers.get === 'function') {
    return headers.get(name);
  }

  const key = Object.keys(headers).find((header) => header.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

function getRetryAfterMs(error) {
  const headers = getResponseHeaders(error);
  const retryAfter = getHeader(headers, 'retry-after');

  if (retryAfter !== undefined && retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }

    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) {
      return Math.max(0, retryAt - Date.now());
    }
  }

  const resetAt = Number(getHeader(headers, 'x-ratelimit-reset'));
  if (Number.isFinite(resetAt) && resetAt > 0) {
    return Math.max(0, resetAt * 1000 - Date.now());
  }

  return null;
}

function isRetryableError(error) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
  if (RETRYABLE_STATUS_CODES.has(status) || (status >= 500 && status <= 599)) {
    return true;
  }

  const headers = getResponseHeaders(error);
  if (
    status === 403 &&
    (getHeader(headers, 'retry-after') !== undefined ||
      String(getHeader(headers, 'x-ratelimit-remaining')) === '0')
  ) {
    return true;
  }

  const code = error?.code || error?.cause?.code;
  return RETRYABLE_NETWORK_CODES.has(code);
}

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function validateOptions(operation, options) {
  if (typeof operation !== 'function') {
    throw new TypeError('operation debe ser una función');
  }
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options debe ser un objeto');
  }

  const { maxAttempts = 3, baseDelayMs = 1000, maxDelayMs = 30000 } = options;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new TypeError('maxAttempts debe ser un entero positivo');
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new TypeError('baseDelayMs debe ser un número no negativo');
  }
  if (!Number.isFinite(maxDelayMs) || maxDelayMs < 0) {
    throw new TypeError('maxDelayMs debe ser un número no negativo');
  }
  if (options.sleep !== undefined && typeof options.sleep !== 'function') {
    throw new TypeError('sleep debe ser una función');
  }
  if (options.shouldRetry !== undefined && typeof options.shouldRetry !== 'function') {
    throw new TypeError('shouldRetry debe ser una función');
  }
  if (
    options.logger !== undefined &&
    (typeof options.logger?.warning !== 'function' || options.logger === null)
  ) {
    throw new TypeError('logger debe proporcionar warning(message)');
  }

  return {
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    sleep: options.sleep || sleep,
    shouldRetry: options.shouldRetry || isRetryableError,
    logger: options.logger || defaultLogger,
  };
}

async function withRetry(operation, options = {}) {
  const config = validateOptions(operation, options);

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= config.maxAttempts || !config.shouldRetry(error)) {
        throw error;
      }

      const exponentialDelay = Math.min(config.baseDelayMs * 2 ** (attempt - 1), config.maxDelayMs);
      const retryAfter = getRetryAfterMs(error);
      const delayMs = retryAfter === null ? exponentialDelay : retryAfter;
      const status = error?.status ?? error?.statusCode ?? error?.response?.status;
      const message = error?.message || (status === undefined ? String(error) : `HTTP ${status}`);

      config.logger.warning(
        `Operación fallida (intento ${attempt}/${config.maxAttempts}): ${message}. ` +
          `Reintentando en ${delayMs} ms.`,
      );
      await config.sleep(delayMs);
    }
  }
}

module.exports = { withRetry, isRetryableError };
