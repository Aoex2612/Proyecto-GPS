/**
 * Módulo de Clasificación de Autoría (HU07 - T1 / T3 / T4 / T5)
 *
 * Responsable asignado en Sprint 1: Jorge Torres Sánchez (JS)
 * Revisor asignado: Candela Marco Jiménez (CJ)
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

  /**
   * Residuos inequívocos de un chat de LLM: se buscan en todo el contenido.
   */
  AI_TEXT_PATTERNS: Object.freeze([
    /\/\/\s*```\w+/,
    /\/\*\s*```\w+\s*\*\//,
    /#\s*```(?:python|py|bash|sh|ruby|rb)/i,
  ]),

  /**
   * Frases de cortesía que sólo son sospechosas si están dentro de un comentario.
   * Se aplican sobre las líneas de comentario, no sobre el código completo.
   * `this function handles` se excluye a propósito: es indistinguible de una
   * descripción humana normal en inglés y penalizaría código legítimo (T1 §2.2).
   */
  AI_CONVERSATIONAL_PATTERNS: Object.freeze([
    /here is the (?:code|implementation|solution|function|refactor)/i,
    /aquí (?:tienes|está) la (?:implementación|función|solución|código)/i,
    /note:\s*make sure to/i,
    /nota:\s*asegúrate de/i,
    /as an ai(?:\s+language\s+model)?/i,
    /como modelo de lenguaje(?:\s+ia)?/i,
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
 * Reglas que se evalúan en el Nivel 1, con su motivo auditable (T1 §2.3).
 * @param {object} contribution
 * @returns {{ rule: string, reason: string }|null}
 */
function findMetadataMatch(contribution = {}) {
  const { author = {}, committer = {}, coAuthors = [], trailers = {}, message = '' } = contribution;

  if (isBotIdentity(author)) {
    return { rule: 'bot-identity', reason: 'El autor es un bot o cuenta de servicio.' };
  }

  if (isBotIdentity(committer)) {
    return { rule: 'bot-identity', reason: 'El committer es un bot o cuenta de servicio.' };
  }

  if (isAiIdentity(author)) {
    return { rule: 'ai-identity', reason: 'El autor es una identidad de herramienta de IA.' };
  }

  if (isAiIdentity(committer)) {
    return { rule: 'ai-identity', reason: 'El committer es una identidad de herramienta de IA.' };
  }

  for (const coAuthor of coAuthors || []) {
    if (isBotIdentity(coAuthor) || isAiIdentity(coAuthor)) {
      return {
        rule: 'ai-coauthor',
        reason: `Co-autoría declarada con una herramienta de IA (${coAuthor.name || coAuthor.email}).`,
      };
    }
  }

  for (const [key, value] of Object.entries(trailers || {})) {
    if (!CLASSIFICATION_CRITERIA.AI_TRAILER_KEYS.some((pattern) => pattern.test(key))) {
      continue;
    }

    if (/^(?:generated-by|assisted-by)$/i.test(key) || /true|yes|1/i.test(String(value))) {
      return { rule: 'ai-trailer', reason: `Trailer explícito de IA en el commit: ${key}.` };
    }
  }

  if (
    typeof message === 'string' &&
    CLASSIFICATION_CRITERIA.AI_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))
  ) {
    return { rule: 'ai-message-marker', reason: 'Marcador explícito de IA en el mensaje del commit.' };
  }

  return null;
}

/**
 * Evalúa los criterios deterministas de metadatos (Nivel 1).
 * @param {object} contribution
 * @returns {string|null} AuthorshipOrigin.AI_ASSISTED si se detecta IA, o null.
 */
function checkMetadataCriteria(contribution = {}) {
  return findMetadataMatch(contribution) ? AuthorshipOrigin.AI_ASSISTED : null;
}

const COMMENT_LINE_PATTERN = /^\s*(?:\/\/|\/\*|\*|#|<!--)/;

/**
 * Indica si una línea del diff es un comentario.
 * @param {string} line
 * @returns {boolean}
 */
function isCommentLine(line) {
  return COMMENT_LINE_PATTERN.test(String(line).replace(/^[+-]/, ''));
}

/**
 * Firmas textuales de LLM (Nivel 2), separando los residuos inequívocos de las
 * frases conversacionales que sólo cuentan dentro de un comentario.
 * @param {object} contribution
 * @returns {{ rule: string, reason: string }|null}
 */
function findTextualMatch(contribution = {}) {
  const content = contribution.content || contribution.diff || contribution.patch || '';

  if (typeof content !== 'string' || content.length === 0) {
    return null;
  }

  if (CLASSIFICATION_CRITERIA.AI_TEXT_PATTERNS.some((pattern) => pattern.test(content))) {
    return { rule: 'ai-text-residue', reason: 'Residuo de bloque Markdown de un chat de LLM.' };
  }

  const commentText = content
    .split(/\r?\n/)
    .filter(isCommentLine)
    .join('\n');

  if (
    commentText.length > 0 &&
    CLASSIFICATION_CRITERIA.AI_CONVERSATIONAL_PATTERNS.some((pattern) => pattern.test(commentText))
  ) {
    return {
      rule: 'ai-conversational-comment',
      reason: 'Frase conversacional de LLM en un comentario del código.',
    };
  }

  return null;
}

/**
 * Evalúa las firmas textuales y residuos de LLM en el contenido (Nivel 2).
 * @param {object} contribution
 * @returns {string|null} AuthorshipOrigin.AI_ASSISTED si se detecta una firma, o null.
 */
function checkTextualPatterns(contribution = {}) {
  return findTextualMatch(contribution) ? AuthorshipOrigin.AI_ASSISTED : null;
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
 * Calcula las líneas por minuto de una aportación.
 * @param {object} stats
 * @returns {number}
 */
function getVelocityRate(stats = {}) {
  const additions = getEligibleAdditions(stats);
  const elapsedMinutes = Number(stats?.elapsedMinutes) || 0;

  if (additions <= 0 || elapsedMinutes <= 0) {
    return 0;
  }

  return additions / elapsedMinutes;
}

/**
 * Detecta un ritmo de adición de código sobrehumano (Nivel 2).
 * @param {object} contribution
 * @returns {boolean}
 */
function hasVelocityAnomaly(contribution = {}) {
  if (!contribution.stats) {
    return false;
  }

  return getVelocityRate(contribution.stats) > CLASSIFICATION_CRITERIA.MAX_HUMAN_LINES_PER_MINUTE;
}

/**
 * Añade `stats` a cada commit (T1 §4.2.A): líneas añadidas computables y
 * minutos transcurridos desde el commit anterior.
 * El primer commit no tiene referencia temporal, así que su velocidad es 0
 * (in dubio pro humano).
 * @param {Array<object>} commits - Commits tal y como los devuelve metadata-parser (T2).
 * @returns {Array<object>} Los mismos commits con `stats`.
 */
function computeVelocityStats(commits = []) {
  const list = Array.isArray(commits) ? commits : [];

  return list.map((commit, index) => {
    const current = Date.parse(commit?.date);
    const previous = Date.parse(list[index - 1]?.date);
    const elapsedMinutes =
      Number.isFinite(current) && Number.isFinite(previous) && current > previous
        ? (current - previous) / 60000
        : 0;

    return {
      ...commit,
      stats: {
        additions: getEligibleAdditions({ files: commit?.files }),
        elapsedMinutes,
      },
    };
  });
}

/**
 * Clasifica la autoría de una aportación y explica qué regla se activó (HU07-T03).
 * @param {object} contribution - Objeto con datos de autor, committer y contenido
 * @returns {{ origin: string, rule: string, reason: string }}
 */
function classifyContribution(contribution = {}) {
  if (!contribution || !hasValidIdentity(contribution.author)) {
    return {
      origin: AuthorshipOrigin.UNKNOWN,
      rule: 'invalid-identity',
      reason: 'El autor no tiene una identidad válida (nombre y correo) (T1 §5.1).',
    };
  }

  if (!hasValidIdentity(contribution.committer)) {
    return {
      origin: AuthorshipOrigin.UNKNOWN,
      rule: 'invalid-identity',
      reason: 'El committer no tiene una identidad válida (nombre y correo) (T1 §5.1).',
    };
  }

  const metadataMatch = findMetadataMatch(contribution);
  if (metadataMatch) {
    return { origin: AuthorshipOrigin.AI_ASSISTED, ...metadataMatch };
  }

  const textualMatch = findTextualMatch(contribution);
  if (textualMatch) {
    return { origin: AuthorshipOrigin.AI_ASSISTED, ...textualMatch };
  }

  if (hasVelocityAnomaly(contribution)) {
    return {
      origin: AuthorshipOrigin.UNKNOWN,
      rule: 'velocity-anomaly',
      reason: `Anomalía de velocidad (${Math.round(
        getVelocityRate(contribution.stats),
      )} líneas/min > ${CLASSIFICATION_CRITERIA.MAX_HUMAN_LINES_PER_MINUTE}) sin confirmación textual (T1 §6).`,
    };
  }

  return {
    origin: AuthorshipOrigin.HUMAN,
    rule: 'no-ai-evidence',
    reason: 'Identidades válidas y sin metadatos, firmas ni velocidad anómala de IA.',
  };
}

/**
 * Clasifica la autoría de una aportación según los criterios definidos (HU07-T03).
 * @param {object} contribution - Objeto con datos de autor, committer y contenido
 * @returns {string} Valor de AuthorshipOrigin (HUMAN, AI_ASSISTED o UNKNOWN)
 */
function classifyOrigin(contribution = {}) {
  return classifyContribution(contribution).origin;
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
  computeVelocityStats,
  classifyContribution,
  classifyOrigin,
};
