/**
 * Tratamiento de Aportaciones Desconocidas (HU07 - T4)
 *
 * Responsable asignado en Sprint 1: Alejandro Jesús Ortiz Zamora (AZ)
 * Revisor asignado (matriz P4): Jorge Torres Sánchez (JS)
 *
 * Centraliza la marca de las aportaciones cuya procedencia no puede
 * determinarse con seguridad. Toda aportación clasificada como `UNKNOWN` se
 * convierte en una ficha auditable con el motivo, la severidad y la acción de
 * revisión asociada, y se incorpora a una cola de revisión manual.
 *
 * Interfaz de referencia: docs/criterios-clasificacion-autoria.md §6.
 */

const { AuthorshipOrigin, classifyContribution } = require('./authorship-classifier');

/**
 * Catálogo de motivos por los que una aportación se marca como desconocida.
 * Cada entrada define la acción que debe ejecutar el revisor humano.
 */
const UNKNOWN_RULES = Object.freeze({
  'invalid-identity': Object.freeze({
    code: 'invalid-identity',
    severity: 'high',
    action: 'verify-commit-identity',
    description:
      'El autor o el committer no tienen una identidad válida (nombre y correo) y la aportación no puede atribuirse con seguridad.',
  }),
  'ambiguous-identity': Object.freeze({
    code: 'ambiguous-identity',
    severity: 'high',
    action: 'verify-author-identity',
    description:
      'La identidad es sintácticamente válida pero genérica o compartida, por lo que no identifica de forma segura a una persona.',
  }),
  'velocity-anomaly': Object.freeze({
    code: 'velocity-anomaly',
    severity: 'medium',
    action: 'request-manual-review',
    description:
      'El ritmo de adición de código es sobrehumano y no existe confirmación textual de IA; se deriva a revisión manual sin penalizar al autor.',
  }),
});

/**
 * Ficha aplicada cuando la regla no está catalogada (por ejemplo, una regla
 * futura que aún no tenga acción definida). Nunca deja la aportación sin
 * revisión: el principio rector es la no penalización errónea.
 */
const FALLBACK_RULE = Object.freeze({
  code: 'unclassified',
  severity: 'medium',
  action: 'request-manual-review',
  description: 'Aportación sin procedencia determinable con seguridad.',
});

const SEVERITIES = Object.freeze(['high', 'medium', 'low']);

/**
 * Indica si un origen de autoría es desconocido.
 * @param {string} origin
 * @returns {boolean}
 */
function isUnknown(origin) {
  return origin === AuthorshipOrigin.UNKNOWN;
}

/**
 * Normaliza la identidad del autor para la ficha de revisión.
 * @param {object} author
 * @returns {{ name: string|null, email: string|null, login: string|null }}
 */
function normalizeAuthor(author) {
  return {
    name: author?.name ?? null,
    email: author?.email ?? null,
    login: author?.login ?? null,
  };
}

/**
 * Normaliza las líneas añadidas de la aportación.
 * @param {object} stats
 * @returns {number}
 */
function normalizeAdditions(stats) {
  const additions = Number(stats?.additions);
  return Number.isFinite(additions) && additions > 0 ? additions : 0;
}

/**
 * Devuelve la definición de revisión de una regla, con respaldo genérico.
 * @param {string} rule
 * @returns {{ code: string, severity: string, action: string, description: string }}
 */
function resolveRule(rule) {
  if (rule && Object.prototype.hasOwnProperty.call(UNKNOWN_RULES, rule)) {
    return UNKNOWN_RULES[rule];
  }

  return FALLBACK_RULE;
}

/**
 * Construye la ficha auditable de una aportación desconocida.
 *
 * @param {object} [contribution] - Aportación (commit) analizada.
 * @param {object} [classification] - Dictamen de `classifyContribution`. Si se omite, se calcula.
 * @returns {object|null} Ficha de revisión, o `null` si la aportación es identificable.
 */
function buildUnknownRecord(contribution = {}, classification = {}) {
  const verdict = classification?.origin ? classification : classifyContribution(contribution);

  if (!isUnknown(verdict.origin)) {
    return null;
  }

  const rule = resolveRule(verdict.rule);

  return {
    sha: contribution?.sha ?? null,
    origin: AuthorshipOrigin.UNKNOWN,
    rule: verdict.rule || FALLBACK_RULE.code,
    reason: verdict.reason || rule.description,
    severity: rule.severity,
    action: rule.action,
    requiresManualReview: true,
    author: normalizeAuthor(contribution?.author),
    date: contribution?.date ?? null,
    additions: normalizeAdditions(contribution?.stats),
  };
}

/**
 * Recoge las aportaciones desconocidas de una lista ya clasificada.
 *
 * Acepta tanto aportaciones con el dictamen embebido en `contribution.classification`
 * como aportaciones sin clasificar (se reclasifican con `classifyContribution`).
 *
 * @param {Array<object>} [contributions]
 * @returns {Array<object>} Fichas de revisión de las aportaciones desconocidas.
 */
function collectUnknownContributions(contributions = []) {
  const list = Array.isArray(contributions) ? contributions : [];

  return list
    .map((contribution) => buildUnknownRecord(contribution, contribution?.classification))
    .filter(Boolean);
}

/**
 * Construye el resumen de revisión manual de un conjunto de aportaciones.
 *
 * @param {Array<object>} [contributions]
 * @returns {{
 *   total: number,
 *   requiresManualReview: boolean,
 *   byRule: Record<string, number>,
 *   bySeverity: Record<string, number>,
 *   items: Array<object>,
 *   message: string,
 * }}
 */
function buildUnknownReview(contributions = []) {
  const items = collectUnknownContributions(contributions);

  const byRule = {};
  const bySeverity = { high: 0, medium: 0, low: 0 };

  for (const item of items) {
    byRule[item.rule] = (byRule[item.rule] || 0) + 1;
    if (SEVERITIES.includes(item.severity)) {
      bySeverity[item.severity] += 1;
    }
  }

  const total = items.length;

  return {
    total,
    requiresManualReview: total > 0,
    byRule,
    bySeverity,
    items,
    message:
      total > 0
        ? `${total} aportación(es) con procedencia desconocida requieren revisión manual antes de emitir un dictamen definitivo.`
        : 'No hay aportaciones desconocidas: todas las aportaciones se han identificado con seguridad.',
  };
}

module.exports = {
  UNKNOWN_RULES,
  isUnknown,
  resolveRule,
  buildUnknownRecord,
  collectUnknownContributions,
  buildUnknownReview,
};
