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
 * Criterios y umbrales de clasificación definidos en la especificación de HU07-T01.
 */
const CLASSIFICATION_CRITERIA = Object.freeze({
  MAX_HUMAN_LINES_PER_MINUTE: 150,

  KNOWN_BOT_PATTERNS: Object.freeze([/\[bot\]/i, /github-actions/i, /dependabot/i]),

  AI_IDENTITY_PATTERNS: Object.freeze([
    /copilot/i,
    /chatgpt/i,
    /claude/i,
    /cursor/i,
    /tabnine/i,
    /codeium/i,
    /gemini/i,
    /windsurf/i,
  ]),

  AI_TRAILER_KEYS: Object.freeze([/^ai-assisted$/i, /^generated-by$/i, /^assisted-by$/i]),

  AI_MESSAGE_PATTERNS: Object.freeze([
    /\[(?:ai-assisted|ai-generated)\]/i,
    /AI-Assisted:\s*(?:true|yes|1)/i,
    /Generated-by:\s*\S+/i,
    /Co-authored-by:.*(?:copilot|claude|cursor|chatgpt|tabnine|codeium)/i,
  ]),

  AI_TEXT_PATTERNS: Object.freeze([
    /\/\/\s*```\w+/,
    /\/\*\s*```\w+\s*\*\//,
    /#\s*```(?:python|py|bash|sh|ruby|rb)/i,
    /here is the (?:code|implementation|solution|function|refactor)/i,
    /aquí (?:tienes|está) la (?:implementación|función|solución|código)/i,
    /note:\s*make sure to/i,
    /nota:\s*asegúrate de/i,
    /as an ai(?:\s+language\s+model)?/i,
    /como modelo de lenguaje(?:\s+ia)?/i,
    /this function handles/i,
  ]),

  EXCLUDED_FILE_PATTERNS: Object.freeze([
    /(?:^|\/)package-lock\.json$/i,
    /(?:^|\/)yarn\.lock$/i,
    /(?:^|\/)pnpm-lock\.yaml$/i,
    /(?:^|\/)dist\//i,
    /(?:^|\/)coverage\//i,
    /\.(?:json|csv|svg)$/i,
  ]),
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Comprueba que una identidad tiene nombre y correo electrónico bien formados.
 * @param {object} identity
 * @returns {boolean}
 */
function hasValidIdentity(identity) {
  if (!identity || typeof identity.name !== 'string' || typeof identity.email !== 'string') {
    return false;
  }

  return identity.name.trim().length > 0 && EMAIL_PATTERN.test(identity.email.trim());
}

/**
 * Indica si una identidad corresponde a un bot o cuenta de servicio automatizada.
 * @param {object} identity
 * @returns {boolean}
 */
function isBotIdentity(identity = {}) {
  if (!identity) {
    return false;
  }

  if (identity.userType === 'Bot' || identity.isBot === true) {
    return true;
  }

  const identifier = `${identity.name || ''} ${identity.email || ''} ${identity.login || ''}`;
  return CLASSIFICATION_CRITERIA.KNOWN_BOT_PATTERNS.some((pattern) => pattern.test(identifier));
}

/**
 * Indica si una identidad corresponde a una herramienta de IA conocida.
 * @param {object} identity
 * @returns {boolean}
 */
function isAiIdentity(identity = {}) {
  if (!identity) {
    return false;
  }

  const identifier = `${identity.name || ''} ${identity.email || ''} ${identity.login || ''}`;
  return CLASSIFICATION_CRITERIA.AI_IDENTITY_PATTERNS.some((pattern) => pattern.test(identifier));
}

/**
 * Evalúa los criterios deterministas de metadatos (Nivel 1).
 * @param {object} contribution
 * @returns {string|null} AuthorshipOrigin.AI_ASSISTED si se detecta IA, o null.
 */
function checkMetadataCriteria(contribution = {}) {
  const { author = {}, committer = {}, coAuthors = [], trailers = {}, message = '' } = contribution;

  if (isBotIdentity(author) || isBotIdentity(committer)) {
    return AuthorshipOrigin.AI_ASSISTED;
  }

  if (isAiIdentity(author) || isAiIdentity(committer)) {
    return AuthorshipOrigin.AI_ASSISTED;
  }

  for (const coAuthor of coAuthors || []) {
    if (isBotIdentity(coAuthor) || isAiIdentity(coAuthor)) {
      return AuthorshipOrigin.AI_ASSISTED;
    }
  }

  for (const [key, value] of Object.entries(trailers || {})) {
    if (!CLASSIFICATION_CRITERIA.AI_TRAILER_KEYS.some((pattern) => pattern.test(key))) {
      continue;
    }

    if (/^(?:generated-by|assisted-by)$/i.test(key)) {
      return AuthorshipOrigin.AI_ASSISTED;
    }

    if (/true|yes|1/i.test(String(value))) {
      return AuthorshipOrigin.AI_ASSISTED;
    }
  }

  if (
    typeof message === 'string' &&
    CLASSIFICATION_CRITERIA.AI_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))
  ) {
    return AuthorshipOrigin.AI_ASSISTED;
  }

  return null;
}

/**
 * Evalúa las firmas textuales y residuos de LLM en el contenido (Nivel 2).
 * @param {object} contribution
 * @returns {string|null} AuthorshipOrigin.AI_ASSISTED si se detecta una firma, o null.
 */
function checkTextualPatterns(contribution = {}) {
  const content = contribution.content || contribution.diff || contribution.patch || '';

  if (typeof content !== 'string' || content.length === 0) {
    return null;
  }

  const hasAiSignature = CLASSIFICATION_CRITERIA.AI_TEXT_PATTERNS.some((pattern) =>
    pattern.test(content),
  );

  return hasAiSignature ? AuthorshipOrigin.AI_ASSISTED : null;
}

/**
 * Indica si un fichero debe excluirse del cálculo de velocidad.
 * @param {string} filename
 * @returns {boolean}
 */
function isExcludedFile(filename = '') {
  return CLASSIFICATION_CRITERIA.EXCLUDED_FILE_PATTERNS.some((pattern) => pattern.test(filename));
}

/**
 * Calcula las líneas añadidas computables, excluyendo ficheros generados.
 * @param {object} stats
 * @returns {number}
 */
function getEligibleAdditions(stats = {}) {
  if (Array.isArray(stats.files)) {
    return stats.files.reduce(
      (total, file) =>
        isExcludedFile(file.filename) ? total : total + (Number(file.additions) || 0),
      0,
    );
  }

  return Number(stats.additions) || 0;
}

/**
 * Detecta un ritmo de adición de código sobrehumano (Nivel 2).
 * @param {object} contribution
 * @returns {boolean}
 */
function hasVelocityAnomaly(contribution = {}) {
  const stats = contribution.stats;

  if (!stats) {
    return false;
  }

  const additions = getEligibleAdditions(stats);
  const elapsedMinutes = Number(stats.elapsedMinutes) || 0;

  if (additions <= 0 || elapsedMinutes <= 0) {
    return false;
  }

  return additions / elapsedMinutes > CLASSIFICATION_CRITERIA.MAX_HUMAN_LINES_PER_MINUTE;
}

/**
 * Clasifica la autoría de una aportación según los criterios definidos (HU07-T03).
 * @param {object} contribution - Objeto con datos de autor, committer y contenido
 * @returns {string} Valor de AuthorshipOrigin (HUMAN, AI_ASSISTED o UNKNOWN)
 */
function classifyOrigin(contribution = {}) {
  if (!contribution || !hasValidIdentity(contribution.author)) {
    return AuthorshipOrigin.UNKNOWN;
  }

  if (checkMetadataCriteria(contribution)) {
    return AuthorshipOrigin.AI_ASSISTED;
  }

  if (checkTextualPatterns(contribution)) {
    return AuthorshipOrigin.AI_ASSISTED;
  }

  if (hasVelocityAnomaly(contribution)) {
    return AuthorshipOrigin.UNKNOWN;
  }

  return AuthorshipOrigin.HUMAN;
}

module.exports = {
  AuthorshipOrigin,
  CLASSIFICATION_CRITERIA,
  hasValidIdentity,
  isBotIdentity,
  isAiIdentity,
  checkMetadataCriteria,
  checkTextualPatterns,
  hasVelocityAnomaly,
  classifyOrigin,
};
