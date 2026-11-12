/**
 * Módulo de Notificación y Publicación en Pull Requests (HU08 - T3 / T4)
 *
 * Responsable asignado en Sprint 1: Jorge Torres Sánchez (JS)
 * Revisor asignado: Félix Jiménez Almanza (FA)
 */

const DEFAULT_AI_THRESHOLD = 50;

/**
 * Marca invisible que identifica los informes publicados por la Action, para
 * poder actualizarlos en lugar de duplicarlos en ejecuciones sucesivas.
 */
const REPORT_MARKER = '<!-- ai-authorship-report -->';

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
 * Normaliza el umbral de IA a un porcentaje entre 0 y 100.
 * @param {*} value
 * @returns {number}
 */
function normalizeThreshold(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return DEFAULT_AI_THRESHOLD;
  }

  const threshold = Number(value);
  if (!Number.isFinite(threshold)) {
    return DEFAULT_AI_THRESHOLD;
  }
  return Math.min(Math.max(threshold, 0), 100);
}

/**
 * Construye el resumen markdown del análisis de autoría.
 * @param {object} report - Resultados del análisis
 * @returns {string} Resumen en markdown
 */
function buildReportSummary(report = {}) {
  const authorship = report.authorship || {};
  const human = toCount(authorship.human);
  const aiAssisted = toCount(authorship.aiAssisted ?? authorship.ai);
  const unknown = toCount(authorship.unknown);
  const total = toCount(authorship.total) || human + aiAssisted + unknown;
  const threshold = normalizeThreshold(report.thresholdAi);
  const aiPercentage = total > 0 ? Number(((aiAssisted / total) * 100).toFixed(1)) : 0;
  let verdict = 'Sin datos para clasificar';
  if (total > 0) {
    verdict = aiPercentage <= threshold ? 'Dentro del umbral' : 'Revisión requerida';
  }

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
 * Construye el cuerpo markdown del informe de análisis de autoría.
 * Siempre incluye la marca de identificación para evitar duplicados.
 * @param {object} report - Resultados del análisis
 * @returns {string} Informe en markdown
 */
function buildReportBody(report = {}) {
  const body =
    typeof report.body === 'string' && report.body.trim().length > 0
      ? report.body.trim()
      : buildReportSummary(report);

  return body.includes(REPORT_MARKER) ? body : `${body}\n\n${REPORT_MARKER}`;
}

/**
 * Busca el informe publicado en una ejecución anterior del PR.
 * @param {object} client - Cliente de GitHub autenticado (Octokit)
 * @param {{owner: string, repo: string, pullNumber: number}} target
 * @returns {Promise<number|null>} Id del comentario del informe, o null.
 */
async function findReportCommentId(client, { owner, repo, pullNumber }) {
  // shortcut: se revisa una sola página de 100 comentarios. Un PR con más
  // historial necesita paginar (o GraphQL) para localizar el informe antiguo.
  const response = await client.rest.issues.listComments({
    owner,
    repo,
    issue_number: pullNumber,
    per_page: 100,
  });

  const comments = Array.isArray(response?.data) ? response.data : [];
  const existing = comments.find((comment) =>
    String(comment?.body ?? '').includes(REPORT_MARKER),
  );

  return existing?.id ?? null;
}

/**
 * Publica el informe de análisis como comentario en el pull request o actualiza
 * el que ya publicó una ejecución anterior.
 * @param {object} client - Cliente de GitHub autenticado (Octokit)
 * @param {object} report - Resultados del análisis
 * @returns {Promise<object>} Resultado de la publicación
 */
async function notifyPullRequest(client, report = {}) {
  const issues = client?.rest?.issues;
  if (
    typeof issues?.createComment !== 'function' ||
    typeof issues?.updateComment !== 'function' ||
    typeof issues?.listComments !== 'function'
  ) {
    throw new Error('Cliente de GitHub no válido: se requiere una instancia autenticada.');
  }

  const { owner, repo, pullNumber, commentId } = report;

  if (!owner || !repo || !pullNumber) {
    throw new Error('El informe requiere owner, repo y pullNumber para publicarse.');
  }

  const body = buildReportBody(report);
  const targetCommentId =
    commentId === undefined || commentId === null
      ? await findReportCommentId(client, { owner, repo, pullNumber })
      : commentId;
  const shouldUpdate = targetCommentId !== undefined && targetCommentId !== null;
  const response = shouldUpdate
    ? await issues.updateComment({ owner, repo, comment_id: targetCommentId, body })
    : await issues.createComment({ owner, repo, issue_number: pullNumber, body });

  return {
    published: true,
    updated: shouldUpdate,
    commentId: response?.data?.id ?? (shouldUpdate ? targetCommentId : null),
  };
}

module.exports = { REPORT_MARKER, buildReportBody, notifyPullRequest };
