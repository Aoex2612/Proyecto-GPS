/**
 * CLI para generar `quality-report.json` desde el job de CI (HU01 - T4)
 *
 * Responsable: Germán Peláez Gallardo (GG)
 * Revisor asignado: Félix Jiménez Almanza (FA)
 *
 * Uso en el workflow:
 *   node src/quality/cli.js
 *
 * Variables de entorno:
 *   SONAR_TOKEN, SONAR_HOST_URL, SONAR_PROJECT_KEY, SONAR_MIN_COVERAGE,
 *   SONAR_MAX_COMPLEXITY, SONAR_MAX_DUPLICATION, SONAR_QUALITY_GATE_REQUIRED,
 *   SONAR_FAIL_ON_QUALITY_GATE y SONAR_REPORT_PATH.
 */

const fs = require('fs/promises');
const path = require('path');
const { analyzeQuality } = require('./index');

/**
 * Convierte un valor de entorno en número.
 * @param {*} value
 * @param {number|null} fallback
 * @returns {number|null}
 */
function parseNumber(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Convierte un valor de entorno en booleano.
 * @param {*} value
 * @param {boolean} fallback
 * @returns {boolean}
 */
function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return !['false', '0', 'no'].includes(String(value).toLowerCase());
}

/**
 * Construye la configuración del análisis a partir del entorno.
 * @param {object} [env]
 * @returns {object}
 */
function buildConfigFromEnv(env = process.env) {
  return {
    enabled: parseBoolean(env.SONAR_ENABLED, true),
    token: env.SONAR_TOKEN,
    hostUrl: env.SONAR_HOST_URL || 'https://sonarcloud.io',
    projectKey: env.SONAR_PROJECT_KEY,
    thresholds: {
      minCoverage: parseNumber(env.SONAR_MIN_COVERAGE, 80),
      maxComplexity: parseNumber(env.SONAR_MAX_COMPLEXITY, null),
      maxDuplication: parseNumber(env.SONAR_MAX_DUPLICATION, 3),
    },
    qualityGateRequired: parseBoolean(env.SONAR_QUALITY_GATE_REQUIRED, true),
    failOnQualityGate: parseBoolean(env.SONAR_FAIL_ON_QUALITY_GATE, true),
  };
}

/**
 * Ejecuta el análisis y escribe el reporte en disco.
 * @param {object} [options]
 * @param {object} [options.env]
 * @param {string} [options.cwd]
 * @param {Function} [options.fetchImpl]
 * @param {Function} [options.writeFileImpl]
 * @returns {Promise<{report: object, reportPath: string, exitCode: number}>}
 */
async function runCli({
  env = process.env,
  cwd = process.cwd(),
  fetchImpl,
  writeFileImpl = fs.writeFile,
} = {}) {
  const config = buildConfigFromEnv(env);
  const report = await analyzeQuality({ ...config, fetchImpl });
  const reportPath = path.resolve(cwd, env.SONAR_REPORT_PATH || 'quality-report.json');

  await writeFileImpl(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const exitCode = report.status === 'failed' && config.failOnQualityGate ? 1 : 0;
  return { report, reportPath, exitCode };
}

/**
 * Punto de entrada del CLI.
 */
async function main() {
  try {
    const { report, reportPath, exitCode } = await runCli();
    // eslint-disable-next-line no-console
    console.log(`[sonar] Estado: ${report.status} (${reportPath})`);
    for (const reason of report.reasons || []) {
      // eslint-disable-next-line no-console
      console.log(`[sonar] - ${reason}`);
    }
    process.exitCode = exitCode;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[sonar] Error: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}

module.exports = { buildConfigFromEnv, parseBoolean, parseNumber, runCli };
