const core = require('@actions/core');

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

    // Esqueleto preparado para la integración de las subtareas del Sprint 1:
    // - HU08: Cliente GitHub y llamadas API seguras (src/auth, src/reporter)
    // - HU07: Metadatos y clasificación de autoría (src/git, src/classifier)
    // - HU01: Automatización y ciclo de vida de la entrega

    core.setOutput('review-status', 'pending');
    core.info('Esqueleto inicial de la Action preparado.');
  } catch (error) {
    core.setFailed(`Fallo en la ejecución: ${error.message}`);
  }
}

if (require.main === module) {
  run();
}

module.exports = { run };
