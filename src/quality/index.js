/**
 * Fachada del análisis de calidad (HU01 - T4)
 *
 * Responsable: Germán Peláez Gallardo (GG)
 * Revisor asignado (matriz P4): Félix Jiménez Almanza (FA)
 *
 * Orquesta el cliente de Sonar y el evaluador, devolviendo siempre un objeto
 * compatible con el contrato `quality` de HU01-T1. Los fallos de configuración
 * o de red no lanzan excepciones: se traducen a un reporte `skipped` o
 * `failed` para que el pipeline pueda continuar y publicar el resultado.
 */

const { createSonarClient, redactToken } = require('./sonar-client');
const { evaluateQuality, normalizeMeasures } = require('./quality-evaluator');

/**
 * Ejecuta el análisis de calidad contra SonarCloud.
 * @param {object} [config]
 * @param {boolean} [config.enabled] - Activa o desactiva el análisis.
 * @param {string} [config.token] - Token de SonarCloud.
 * @param {string} [config.hostUrl] - URL del servidor Sonar.
 * @param {string} [config.projectKey] - Project key de SonarCloud.
 * @param {object} [config.thresholds] - Umbrales configurables.
 * @param {boolean} [config.qualityGateRequired] - Si el gate ERROR bloquea.
 * @param {Function} [config.fetchImpl] - fetch inyectable para pruebas.
 * @param {number} [config.timeoutMs] - Timeout por petición.
 * @param {number} [config.maxRetries] - Reintentos ante 429/5xx/red.
 * @param {number} [config.retryDelayMs] - Espera entre reintentos.
 * @returns {Promise<object>}
 */
async function analyzeQuality(config = {}) {
  const {
    enabled = true,
    token,
    hostUrl = 'https://sonarcloud.io',
    projectKey,
    thresholds = {},
    qualityGateRequired = true,
    fetchImpl,
    timeoutMs,
    maxRetries,
    retryDelayMs,
  } = config;

  const base = {
    source: 'sonarqube',
    projectKey: projectKey || null,
    thresholds,
    qualityGateRequired,
  };

  if (!enabled) {
    return evaluateQuality({ ...base, skipReason: 'Análisis de calidad deshabilitado' });
  }

  if (!token) {
    return evaluateQuality({ ...base, skipReason: 'SONAR_TOKEN no configurado' });
  }

  if (!projectKey) {
    return evaluateQuality({ ...base, skipReason: 'sonar-project-key no configurado' });
  }

  try {
    const client = createSonarClient({
      token,
      projectKey,
      hostUrl,
      fetchImpl,
      timeoutMs,
      maxRetries,
      retryDelayMs,
    });

    const result = await client.collect();

    return evaluateQuality({
      ...base,
      qualityGate: result.qualityGate,
      metrics: normalizeMeasures(result.measures),
      issues: result.issues,
    });
  } catch (error) {
    const message = redactToken(error.message, token);
    return evaluateQuality({
      ...base,
      qualityGate: 'NONE',
      metrics: {},
      issues: [],
      error: new Error(message),
    });
  }
}

module.exports = { analyzeQuality };
