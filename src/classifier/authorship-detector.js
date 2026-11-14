/**
 * Sistema de Detección de Procedencia del Código mediante Metadatos (HU01 - T3)
 *
 * Responsable asignado en Sprint 1: Ángel López Sánchez (AS)
 * Revisor asignado: Jesús Cañete García (JG)
 *
 * Implementa el sistema automatizado de detección de autoría apoyado en
 * los metadatos de Git y de la API de GitHub generados durante el desarrollo
 * del proyecto. Clasifica las aportaciones en humanas, asistidas por IA o
 * desconocidas, agregando métricas globales de la entrega y evaluando los
 * umbrales configurados según el contrato de HU01-T1.
 *
 * Diseño completo: docs/HU01-T03-deteccion-procedencia-metadatos.md
 */

const { parseCommitMetadata } = require('../git/metadata-parser');
const authorshipClassifier = require('./authorship-classifier');

const AuthorshipOrigin = authorshipClassifier.AuthorshipOrigin || Object.freeze({
  HUMAN: 'human',
  AI_ASSISTED: 'ai_assisted',
  UNKNOWN: 'unknown',
});

const DEFAULT_AI_THRESHOLD = 50;
const MAX_HUMAN_LINES_PER_MINUTE = 150;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const KNOWN_BOT_PATTERNS = Object.freeze([/\[bot\]/i, /github-actions/i, /dependabot/i]);
const AI_IDENTITY_PATTERNS = Object.freeze([
  /copilot/i,
  /chatgpt/i,
  /claude/i,
  /cursor/i,
  /tabnine/i,
  /codeium/i,
  /gemini/i,
  /windsurf/i,
]);

const AI_TRAILER_KEYS = Object.freeze([/^ai-assisted$/i, /^generated-by$/i, /^assisted-by$/i]);
const AI_MESSAGE_PATTERNS = Object.freeze([
  /\[(?:ai-assisted|ai-generated)\]/i,
  /AI-Assisted:\s*(?:true|yes|1)/i,
  /Generated-by:\s*\S+/i,
  /Co-authored-by:.*(?:copilot|claude|cursor|chatgpt|tabnine|codeium)/i,
]);

const AI_TEXT_PATTERNS = Object.freeze([
  /\/\/\s*```\w+/,
  /\/\*\s*```\w+\s*\*\//,
  /#\s*```(?:python|py|bash|sh|ruby|rb)/i,
]);

const AI_CONVERSATIONAL_PATTERNS = Object.freeze([
  /here is the (?:code|implementation|solution|function|refactor)/i,
  /aquí (?:tienes|está) la (?:implementación|función|solución|código)/i,
  /note:\s*make sure to/i,
  /nota:\s*asegúrate de/i,
  /as an ai(?:\s+language\s+model)?/i,
  /como modelo de lenguaje(?:\s+ia)?/i,
]);

const EXCLUDED_FILE_PATTERNS = Object.freeze([
  /(?:^|\/)package-lock\.json$/i,
  /(?:^|\/)yarn\.lock$/i,
  /(?:^|\/)pnpm-lock\.yaml$/i,
  /(?:^|\/)dist\//i,
  /(?:^|\/)coverage\//i,
  /\.(?:json|csv|svg)$/i,
]);

/**
 * Normaliza el umbral numérico de IA a un valor entre 0 y 100.
 * @param {*} value
 * @returns {number}
 */
function normalizeThreshold(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return DEFAULT_AI_THRESHOLD;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_AI_THRESHOLD;
  }
  return Math.min(Math.max(parsed, 0), 100);
}

/**
 * Calcula el porcentaje redondeado a 1 decimal.
 * @param {number} part
 * @param {number} total
 * @returns {number}
 */
function calculatePercentage(part, total) {
  if (total <= 0 || !Number.isFinite(part) || part <= 0) {
    return 0;
  }
  return Number(((part / total) * 100).toFixed(1));
}

/**
 * Comprueba si una identidad tiene nombre y correo válidos.
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
 * Indica si una identidad es un bot o cuenta de servicio.
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
  return KNOWN_BOT_PATTERNS.some((pattern) => pattern.test(identifier));
}

/**
 * Indica si una identidad corresponde a una herramienta de IA.
 * @param {object} identity
 * @returns {boolean}
 */
function isAiIdentity(identity = {}) {
  if (!identity) {
    return false;
  }
  const identifier = `${identity.name || ''} ${identity.email || ''} ${identity.login || ''}`;
  return AI_IDENTITY_PATTERNS.some((pattern) => pattern.test(identifier));
}

/**
 * Evalúa los criterios deterministas de metadatos en un commit.
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
    if (!AI_TRAILER_KEYS.some((pattern) => pattern.test(key))) {
      continue;
    }
    if (/^(?:generated-by|assisted-by)$/i.test(key) || /true|yes|1/i.test(String(value))) {
      return { rule: 'ai-trailer', reason: `Trailer explícito de IA en el commit: ${key}.` };
    }
  }
  if (
    typeof message === 'string' &&
    AI_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))
  ) {
    return { rule: 'ai-message-marker', reason: 'Marcador explícito de IA en el mensaje del commit.' };
  }
  return null;
}

const COMMENT_LINE_PATTERN = /^\s*(?:\/\/|\/\*|\*|#|<!--)/;

function isCommentLine(line) {
  return COMMENT_LINE_PATTERN.test(String(line).replace(/^[+-]/, ''));
}

/**
 * Evalúa firmas textuales de chat LLM en el diff o parches.
 * @param {object} contribution
 * @returns {{ rule: string, reason: string }|null}
 */
function findTextualMatch(contribution = {}) {
  const content = contribution.content || contribution.diff || contribution.patch || '';
  if (typeof content !== 'string' || content.length === 0) {
    return null;
  }
  if (AI_TEXT_PATTERNS.some((pattern) => pattern.test(content))) {
    return { rule: 'ai-text-residue', reason: 'Residuo de bloque Markdown de un chat de LLM.' };
  }
  const commentText = content
    .split(/\r?\n/)
    .filter(isCommentLine)
    .join('\n');
  if (
    commentText.length > 0 &&
    AI_CONVERSATIONAL_PATTERNS.some((pattern) => pattern.test(commentText))
  ) {
    return {
      rule: 'ai-conversational-comment',
      reason: 'Frase conversacional de LLM en un comentario del código.',
    };
  }
  return null;
}

function isExcludedFile(filename = '') {
  return EXCLUDED_FILE_PATTERNS.some((pattern) => pattern.test(filename));
}

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

function getVelocityRate(stats = {}) {
  const additions = getEligibleAdditions(stats);
  const elapsedMinutes = Number(stats?.elapsedMinutes) || 0;
  if (additions <= 0 || elapsedMinutes <= 0) {
    return 0;
  }
  return additions / elapsedMinutes;
}

function hasVelocityAnomaly(contribution = {}) {
  if (!contribution.stats) {
    return false;
  }
  return getVelocityRate(contribution.stats) > MAX_HUMAN_LINES_PER_MINUTE;
}

/**
 * Calcula estadísticas temporales y adiciones entre commits consecutivos.
 * @param {Array<object>} commits
 * @returns {Array<object>}
 */
function computeVelocityStats(commits = []) {
  if (typeof authorshipClassifier.computeVelocityStats === 'function') {
    return authorshipClassifier.computeVelocityStats(commits);
  }

  const list = Array.isArray(commits) ? commits : [];
  return list.map((commit, index) => {
    const currentDate = commit?.date || commit?.commit?.author?.date || commit?.commit?.committer?.date;
    const prevDate =
      list[index - 1]?.date ||
      list[index - 1]?.commit?.author?.date ||
      list[index - 1]?.commit?.committer?.date;

    const current = Date.parse(currentDate);
    const previous = Date.parse(prevDate);
    const elapsedMinutes =
      Number.isFinite(current) && Number.isFinite(previous) && current > previous
        ? (current - previous) / 60000
        : 0;

    const files = commit?.files || [];
    return {
      ...commit,
      stats: {
        additions: getEligibleAdditions({ files }),
        elapsedMinutes,
      },
    };
  });
}

/**
 * Clasifica una aportación individual aplicando las reglas de auditoría.
 * @param {object} contribution
 * @returns {{ origin: string, rule: string, reason: string }}
 */
function classifyContribution(contribution = {}) {
  if (typeof authorshipClassifier.classifyContribution === 'function') {
    return authorshipClassifier.classifyContribution(contribution);
  }

  if (!contribution || !hasValidIdentity(contribution.author)) {
    return {
      origin: AuthorshipOrigin.UNKNOWN,
      rule: 'invalid-identity',
      reason: 'El autor no tiene una identidad válida (nombre y correo).',
    };
  }
  if (!hasValidIdentity(contribution.committer)) {
    return {
      origin: AuthorshipOrigin.UNKNOWN,
      rule: 'invalid-identity',
      reason: 'El committer no tiene una identidad válida (nombre y correo).',
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
      )} líneas/min > ${MAX_HUMAN_LINES_PER_MINUTE}) sin confirmación textual.`,
    };
  }
  return {
    origin: AuthorshipOrigin.HUMAN,
    rule: 'no-ai-evidence',
    reason: 'Identidades válidas y sin metadatos, firmas ni velocidad anómala de IA.',
  };
}

/**
 * Analiza la autoría de una entrega o conjunto de commits a partir de sus metadatos.
 *
 * @param {object} [options]
 * @param {Array<object>} [options.commits] - Commits devueltos por la API de GitHub o lista parseada.
 * @param {number|string} [options.thresholdAi=50] - Umbral máximo tolerado de código asistido por IA (en %).
 * @param {object} [options.delivery] - Metadatos de la entrega (repo, pr, branch, sha).
 * @returns {object} Informe completo de auditoría de autoría según el contrato de HU01-T1.
 */
function detectAuthorship(options = {}) {
  const { commits: inputCommits = [], thresholdAi = DEFAULT_AI_THRESHOLD, delivery = {} } = options;

  const threshold = normalizeThreshold(thresholdAi);

  let parsedCommits = [];
  let collectedIdentities = [];

  const rawCommits = Array.isArray(inputCommits) ? inputCommits : [];
  const needsParsing = rawCommits.some((c) => c && typeof c.commit === 'object');

  if (needsParsing) {
    const parseResult = parseCommitMetadata({ commits: rawCommits });
    // Enriquecer cada commit parseado con los campos date y files de los commits crudos si están disponibles
    parsedCommits = parseResult.commits.map((parsed, idx) => {
      const raw = rawCommits[idx] || {};
      const date =
        parsed.date ||
        raw.commit?.author?.date ||
        raw.commit?.committer?.date ||
        null;
      const files = parsed.files || (raw.files || []).map((file) => ({
        filename: file.filename || null,
        additions: Number(file.additions) || 0,
      }));
      return {
        ...parsed,
        date,
        files,
      };
    });
    collectedIdentities = parseResult.identities;
  } else {
    parsedCommits = rawCommits.map((c) => ({ ...c }));
  }

  // Enriquecer con cálculo de velocidad temporal entre commits consecutivos
  const commitsWithStats = computeVelocityStats(parsedCommits);

  let humanCount = 0;
  let aiAssistedCount = 0;
  let unknownCount = 0;

  let humanLines = 0;
  let aiAssistedLines = 0;
  let unknownLines = 0;

  const contributions = [];

  for (const commit of commitsWithStats) {
    const classification = classifyContribution(commit);
    const origin = classification.origin;
    const additions = commit.stats?.additions ?? 0;

    if (origin === AuthorshipOrigin.HUMAN) {
      humanCount += 1;
      humanLines += additions;
    } else if (origin === AuthorshipOrigin.AI_ASSISTED) {
      aiAssistedCount += 1;
      aiAssistedLines += additions;
    } else {
      unknownCount += 1;
      unknownLines += additions;
    }

    contributions.push({
      sha: commit.sha || null,
      author: commit.author || null,
      committer: commit.committer || null,
      origin,
      rule: classification.rule,
      reason: classification.reason,
      stats: commit.stats || { additions, elapsedMinutes: 0 },
      date: commit.date || null,
      message: commit.message || '',
      files: commit.files || [],
    });
  }

  const total = humanCount + aiAssistedCount + unknownCount;
  const totalLines = humanLines + aiAssistedLines + unknownLines;

  const percentage = {
    human: calculatePercentage(humanCount, total),
    aiAssisted: calculatePercentage(aiAssistedCount, total),
    unknown: calculatePercentage(unknownCount, total),
  };

  const lines = {
    human: humanLines,
    aiAssisted: aiAssistedLines,
    unknown: unknownLines,
    total: totalLines,
  };

  const exceedsThreshold = total > 0 && percentage.aiAssisted > threshold;
  const reasons = [];

  if (exceedsThreshold) {
    reasons.push(
      `El porcentaje de código asistido por IA (${percentage.aiAssisted}%) supera el umbral máximo configurado (${threshold}%).`,
    );
  }

  if (unknownCount > 0) {
    reasons.push(
      `Se han detectado ${unknownCount} aportación(es) con procedencia desconocida (UNKNOWN) que requieren auditoría.`,
    );
  }

  const status = exceedsThreshold ? 'review_required' : 'passed';

  const normalizedDelivery = {
    repository: delivery?.repository || null,
    pullRequest: delivery?.pullRequest || null,
    baseBranch: delivery?.baseBranch || null,
    headBranch: delivery?.headBranch || null,
    commitSha: delivery?.commitSha || null,
  };

  return {
    delivery: normalizedDelivery,
    authorship: {
      human: humanCount,
      aiAssisted: aiAssistedCount,
      unknown: unknownCount,
      total,
      percentage,
      lines,
    },
    verdict: {
      status,
      exceedsThreshold,
      reasons,
    },
    thresholdAi: threshold,
    identities: collectedIdentities,
    contributions,
  };
}

const analyzeAuthorship = detectAuthorship;

module.exports = {
  detectAuthorship,
  analyzeAuthorship,
  computeVelocityStats,
  classifyContribution,
};
