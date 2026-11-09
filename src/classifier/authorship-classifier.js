/**
 * Módulo de Clasificación de Autoría (HU07 - T1 / T3 / T4 / T5)
 *
 * Responsable asignado en Sprint 1: Alejandro Jesús Ortiz Zamora (AZ) / Jorge Torres Sánchez (JS)
 * Revisor asignado: Pablo García Gómez (PG) / Candela Marco Jiménez (CJ)
 */

const AuthorshipOrigin = Object.freeze({
  HUMAN: 'human',
  AI_ASSISTED: 'ai_assisted',
  UNKNOWN: 'unknown',
});

/**
 * Clasifica la autoría de una aportación según los criterios definidos.
 * @param {object} contribution - Objeto con datos de autor, committer y contenido
 * @returns {string} Valor de AuthorshipOrigin
 */
function classifyOrigin(_contribution = {}) {
  // TODO: Alejandro / Jorge (HU07-T01 / HU07-T03): Implementar reglas de clasificación
  return AuthorshipOrigin.UNKNOWN;
}

module.exports = {
  AuthorshipOrigin,
  classifyOrigin,
};
