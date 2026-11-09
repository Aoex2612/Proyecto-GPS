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
 * Criterios de clasificación y umbrales configurables (HU07-T01).
 */
const CLASSIFICATION_CRITERIA = Object.freeze({
  /** Velocidad máxima de adición de código estimada para un programador humano (líneas/minuto) */
  MAX_HUMAN_LINES_PER_MINUTE: 150,

  /** Patrones de nombres, correos o tipos de cuentas asociadas a bots y asistentes de IA */
  KNOWN_BOT_PATTERNS: Object.freeze([
    /\[bot\]/i,
    /copilot/i,
    /actions@github\.com/i,
    /noreply\.github\.com/i,
    /ghost@github\.com/i,
    /chatgpt/i,
    /claude/i,
    /tabnine/i,
    /cursor/i,
  ]),

  /** Patrones textuales y marcas frecuentes dejadas por LLMs en diffs, comentarios o código */
  AI_TEXT_PATTERNS: Object.freeze([
    /```(?:javascript|js|ts|python|html|json|sh|bash)?/i,
    /here is the (?:code|implementation|solution|function|refactored)/i,
    /aquí (?:tienes|está) la (?:función|implementación|solución|código)/i,
    /note:\s*make sure to/i,
    /nota:\s*asegúrate de/i,
    /as an ai(?:\s+language\s+model)?/i,
    /como modelo de lenguaje(?:\s+ia)?/i,
  ]),
});

/**
 * Evalúa los criterios deterministas basados en metadatos directos del commit / aportación.
 * @param {object} contribution - Aportación a evaluar
 * @returns {string|null} AuthorshipOrigin.AI_ASSISTED si coincide, o null
 */
function checkMetadataCriteria(contribution = {}) {
  const { author = {}, committer = {}, coAuthors = [], trailers = {}, message = '' } = contribution;

  // 1. Co-autores declarados (ej. Co-authored-by: GitHub Copilot <...>)
  for (const coAuthor of coAuthors) {
    const coIdentifier = `${coAuthor.name || ''} ${coAuthor.email || ''}`;
    if (CLASSIFICATION_CRITERIA.KNOWN_BOT_PATTERNS.some((pattern) => pattern.test(coIdentifier))) {
      return AuthorshipOrigin.AI_ASSISTED;
    }
  }

  // 2. Tipo de usuario explícito o indicadores en autor / committer
  if (author.userType === 'Bot' || author.isBot === true || committer.userType === 'Bot') {
    return AuthorshipOrigin.AI_ASSISTED;
  }

  const authorIdentifier = `${author.name || ''} ${author.email || ''}`;
  if (
    authorIdentifier.trim() &&
    CLASSIFICATION_CRITERIA.KNOWN_BOT_PATTERNS.some((pattern) => pattern.test(authorIdentifier))
  ) {
    return AuthorshipOrigin.AI_ASSISTED;
  }

  // 3. Trailers explícitos de asistencia de IA
  if (trailers && typeof trailers === 'object') {
    const aiAssistedTrailer = trailers['AI-Assisted'] || trailers['ai-assisted'];
    if (aiAssistedTrailer && /true|yes|1/i.test(String(aiAssistedTrailer))) {
      return AuthorshipOrigin.AI_ASSISTED;
    }
  }

  // 4. Marcadores en el mensaje de commit
  if (message && typeof message === 'string') {
    if (
      /AI-Assisted:\s*(?:true|yes|1)/i.test(message) ||
      /\[(?:ai-assisted|ai-generated)\]/i.test(message)
    ) {
      return AuthorshipOrigin.AI_ASSISTED;
    }
  }

  return null;
}

/**
 * Evalúa los criterios heurísticos de velocidad de generación de código (HU07-T01).
 * @param {object} contribution - Aportación con estadísticas de adición y tiempo
 * @returns {string|null} AuthorshipOrigin.AI_ASSISTED si excede umbral sobrehumano, o null
 */
function checkVelocityCriteria(contribution = {}) {
  const { stats } = contribution;
  if (!stats) {
    return null;
  }

  const additions = Number(stats.additions) || 0;
  const elapsedMinutes = Number(stats.elapsedMinutes) || 0;

  if (additions > 0 && elapsedMinutes > 0) {
    const linesPerMinute = additions / elapsedMinutes;
    if (linesPerMinute > CLASSIFICATION_CRITERIA.MAX_HUMAN_LINES_PER_MINUTE) {
      return AuthorshipOrigin.AI_ASSISTED;
    }
  }

  return null;
}

/**
 * Evalúa los criterios heurísticos de marcas textuales de LLMs en el código o diff (HU07-T01).
 * @param {object} contribution - Aportación con contenido / patch
 * @returns {string|null} AuthorshipOrigin.AI_ASSISTED si se detectan firmas de LLM, o null
 */
function checkTextualPatterns(contribution = {}) {
  const codeContent = contribution.content || contribution.diff || contribution.patch || '';
  if (!codeContent || typeof codeContent !== 'string') {
    return null;
  }

  for (const pattern of CLASSIFICATION_CRITERIA.AI_TEXT_PATTERNS) {
    if (pattern.test(codeContent)) {
      return AuthorshipOrigin.AI_ASSISTED;
    }
  }

  return null;
}

/**
 * Clasifica la autoría de una aportación según los criterios definidos (HU07-T01).
 * @param {object} contribution - Objeto con datos de autor, committer y contenido
 * @returns {string} Valor de AuthorshipOrigin (HUMAN, AI_ASSISTED o UNKNOWN)
 */
function classifyOrigin(contribution = {}) {
  // Si no hay datos de aportación o de autor, no se puede asegurar el origen (T4)
  if (!contribution || !contribution.author || !contribution.author.email) {
    return AuthorshipOrigin.UNKNOWN;
  }

  // 1. Criterios deterministas de metadatos (Co-authors, bots, trailers)
  const metadataResult = checkMetadataCriteria(contribution);
  if (metadataResult) {
    return metadataResult;
  }

  // 2. Criterios heurísticos de velocidad de generación
  const velocityResult = checkVelocityCriteria(contribution);
  if (velocityResult) {
    return velocityResult;
  }

  // 3. Criterios heurísticos de patrones y artefactos de LLMs
  const textualResult = checkTextualPatterns(contribution);
  if (textualResult) {
    return textualResult;
  }

  // 4. Si el autor es humano válido y no se detectó ningún indicador de IA
  return AuthorshipOrigin.HUMAN;
}

module.exports = {
  AuthorshipOrigin,
  CLASSIFICATION_CRITERIA,
  checkMetadataCriteria,
  checkVelocityCriteria,
  checkTextualPatterns,
  classifyOrigin,
};
