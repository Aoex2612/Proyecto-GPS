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
const {
  AuthorshipOrigin,
  computeVelocityStats,
  classifyContribution,
} = require('./authorship-classifier');

const DEFAULT_AI_THRESHOLD = 50;

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
    parsedCommits = parseResult.commits;
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
