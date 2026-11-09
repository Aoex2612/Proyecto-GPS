/**
 * Módulo de Notificación y Publicación en Pull Requests (HU08 - T3 / T4)
 *
 * Responsable asignado en Sprint 1: Jorge Torres Sánchez (JS) / Candela Marco Jiménez (CJ)
 * Revisor asignado: Félix Jiménez Almanza (FA) / Pablo García Gómez (PG)
 */

/**
 * Publica el informe de análisis como comentario en el PR o actualiza el Status Check.
 * @param {object} _client - Cliente de GitHub autenticado
 * @param {object} _report - Resultados del análisis
 */
async function notifyPullRequest(_client, _report) {
  // TODO: Jorge / Candela (HU08-T03 / HU08-T04): Implementar publicación y política de reintentos
  return false;
}

module.exports = { notifyPullRequest };
