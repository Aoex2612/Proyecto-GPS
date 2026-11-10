const core = require('@actions/core');
const { analyzeQuality } = require('./quality');

/**
 * Lee un input numérico de la Action.
 * @param {string} name
 * @param {number|null} fallback
 * @returns {number|null}
 */
function getNumberInput(name, fallback) {
  const value = core.getInput(name);
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Lee un input booleano de la Action.
 * @param {string} name
 * @param {boolean} fallback
 * @returns {boolean}
 */
function getBooleanInput(name, fallback) {
  const value = core.getInput(name);
  if (!value) {
    return fallback;
  }
  return !['false', '0', 'no'].includes(value.toLowerCase());
}

/**
 * Punto de entrada principal de la GitHub Action.
 * Orquestará las fases de análisis conforme se implementen las tareas.
 */
async function run() {
  try {
    core.info('Iniciando AI Authorship & Quality Gate Action...');

    const token = core.getInput('github-token', { required: true });
    const thresholdAi = core.getInput('threshold-ai') || '50';

    core.info(`Configuración activa: Umbral IA = ${thresholdAi}%`);

    // Comprobación mínima de presencia de token
    if (!token) {
      throw new Error('El parámetro github-token es obligatorio.');
    }

    const sonarEnabled = getBooleanInput('sonar-enabled', false);
    const failOnQualityGate = getBooleanInput('fail-on-quality-gate', true);

    let quality;
    try {
      quality = await analyzeQuality({
        enabled: sonarEnabled,
        token: core.getInput('sonar-token'),
        hostUrl: core.getInput('sonar-host-url') || 'https://sonarcloud.io',
        projectKey:
          core.getInput('sonar-project-key') ||
          (process.env.GITHUB_REPOSITORY || '').replace('/', '_'),
        thresholds: {
          minCoverage: getNumberInput('sonar-min-coverage', 80),
          maxComplexity: getNumberInput('sonar-max-complexity', null),
          maxDuplication: getNumberInput('sonar-max-duplication', 3),
        },
        qualityGateRequired: getBooleanInput('sonar-quality-gate-required', true),
      });
    } catch (error) {
      core.warning(`No se pudo ejecutar el análisis de calidad: ${error.message}`);
      quality = {
        source: 'sonarqube',
        status: 'skipped',
        reasons: [error.message],
      };
    }

    core.setOutput('quality-status', quality.status);
    core.setOutput('quality-summary', JSON.stringify(quality));
    core.info(`Estado del análisis de calidad: ${quality.status}`);

    // Esqueleto preparado para la integración de las subtareas del Sprint 1:
    // - HU08: Cliente GitHub y llamadas API seguras (src/auth, src/reporter)
    // - HU07: Metadatos y clasificación de autoría (src/git, src/classifier)
    // - HU01-T4: Análisis de calidad y complejidad con SonarCloud (src/quality)

    core.setOutput('review-status', sonarEnabled ? quality.status : 'pending');

    if (sonarEnabled && quality.status === 'failed' && failOnQualityGate) {
      const reasons = (quality.reasons || []).join('; ');
      core.setFailed(`El Quality Gate de SonarCloud ha fallado: ${reasons}`);
      return;
    }

    core.info('Esqueleto inicial de la Action preparado.');
  } catch (error) {
    core.setFailed(`Fallo en la ejecución: ${error.message}`);
  }
}

if (require.main === module) {
  run();
}

module.exports = { run };
