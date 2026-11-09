/**
 * Módulo de Notificación y Publicación en Pull Requests (HU08 - T3 / T4)
 *
 * Responsable asignado en Sprint 1: Jorge Torres Sánchez (JS) / Candela Marco Jiménez (CJ)
 * Revisor asignado: Félix Jiménez Almanza (FA) / Pablo García Gómez (PG)
 */

const DEFAULT_AI_THRESHOLD = 50;

/**
 * Normaliza un valor numérico de conteo a un entero no negativo.
 * @param {*} value
 * @returns {number}
 */
function toCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

/**
 * Construye el cuerpo markdown del informe de análisis de autoría.
 * @param {object} report - Resultados del análisis
 * @returns {string} Informe en markdown
 */
function buildReportBody(report = {}) {
  if (typeof report.body === 'string' && report.body.trim().length > 0) {
    return report.body;
  }

  const authorship = report.authorship || {};
  const total = toCount(authorship.total);
  const human = toCount(authorship.human);
  const aiAssisted = toCount(authorship.aiAssisted ?? authorship.ai);
  const unknown = toCount(authorship.unknown);
  const threshold = Number.isFinite(Number(report.thresholdAi))
    ? Number(report.thresholdAi)
    : DEFAULT_AI_THRESHOLD;
  const aiPercentage = total > 0 ? Math.round((aiAssisted / total) * 100) : 0;
  const verdict = aiPercentage <= threshold ? 'Dentro del umbral' : 'Revisión requerida';

  return [
    '## Informe de autoría',
    '',
    `- Total de aportaciones: ${total}`,
    `- Humanas: ${human}`,
    `- Asistidas por IA: ${aiAssisted}`,
    `- Desconocidas: ${unknown}`,
    '',
    `Resultado: ${verdict} (IA: ${aiPercentage}% / umbral ${threshold}%)`,
  ].join('\n');
}

/**
 * Publica el informe de análisis como comentario en el pull request o actualiza el existente.
 * @param {object} client - Cliente de GitHub autenticado (Octokit)
 * @param {object} report - Resultados del análisis
 * @returns {Promise<object>} Resultado de la publicación
 */
async function notifyPullRequest(client, report = {}) {
  if (!client || !client.rest || !client.rest.issues) {
    throw new Error('Cliente de GitHub no válido: se requiere una instancia autenticada.');
  }

  const { owner, repo, pullNumber, commentId } = report;

  if (!owner || !repo || !pullNumber) {
    throw new Error('El informe requiere owner, repo y pullNumber para publicarse.');
  }

  const body = buildReportBody(report);
  const params = { owner, repo, issue_number: pullNumber, body };
  const shouldUpdate = commentId !== undefined && commentId !== null;
  const response = shouldUpdate
    ? await client.rest.issues.updateComment({ ...params, comment_id: commentId })
    : await client.rest.issues.createComment(params);

  return {
    published: true,
    updated: shouldUpdate,
    commentId: response?.data?.id ?? (shouldUpdate ? commentId : null),
  };
}

module.exports = { buildReportBody, notifyPullRequest };
