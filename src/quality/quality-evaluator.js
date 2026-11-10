/**
 * Módulo de evaluación de calidad (HU01 - T4)
 *
 * Responsable: Germán Peláez Gallardo (GG)
 * Revisor asignado: Félix Jiménez Almanza (FA)
 *
 * Convierte las medidas crudas de SonarCloud en el objeto `quality` que
 * consume el contrato de fases de HU01-T1. No realiza llamadas de red: toda
 * la lógica es pura y testeable.
 */

const DEFAULT_THRESHOLDS = Object.freeze({
  minCoverage: 80,
  maxComplexity: null,
  maxDuplication: 3,
});

/**
 * Mapa entre las claves de la API de Sonar y las claves normalizadas del
 * reporte. Las valoraciones (ratings) se conservan como texto.
 */
const METRIC_MAP = Object.freeze({
  complexity: { key: 'complexity', type: 'number' },
  cognitive_complexity: { key: 'cognitiveComplexity', type: 'number' },
  coverage: { key: 'coverage', type: 'number' },
  line_coverage: { key: 'lineCoverage', type: 'number' },
  branch_coverage: { key: 'branchCoverage', type: 'number' },
  duplicated_lines_density: { key: 'duplication', type: 'number' },
  code_smells: { key: 'codeSmells', type: 'number' },
  bugs: { key: 'bugs', type: 'number' },
  vulnerabilities: { key: 'vulnerabilities', type: 'number' },
  security_hotspots: { key: 'securityHotspots', type: 'number' },
  sqale_index: { key: 'technicalDebtMinutes', type: 'number' },
  sqale_rating: { key: 'maintainabilityRating', type: 'string' },
  reliability_rating: { key: 'reliabilityRating', type: 'string' },
  security_rating: { key: 'securityRating', type: 'string' },
  ncloc: { key: 'ncloc', type: 'number' },
  files: { key: 'files', type: 'number' },
});

/**
 * Convierte un valor de Sonar en número, devolviendo null si no es válido.
 * @param {*} value
 * @returns {number|null}
 */
function toNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Normaliza los umbrales recibidos, aplicando los valores por defecto.
 * @param {object} [thresholds]
 * @returns {{minCoverage: number|null, maxComplexity: number|null, maxDuplication: number|null}}
 */
function normalizeThresholds(thresholds = {}) {
  const source = thresholds || {};
  return {
    minCoverage:
      source.minCoverage === undefined
        ? DEFAULT_THRESHOLDS.minCoverage
        : toNumber(source.minCoverage),
    maxComplexity:
      source.maxComplexity === undefined
        ? DEFAULT_THRESHOLDS.maxComplexity
        : toNumber(source.maxComplexity),
    maxDuplication:
      source.maxDuplication === undefined
        ? DEFAULT_THRESHOLDS.maxDuplication
        : toNumber(source.maxDuplication),
  };
}

/**
 * Transforma el array de medidas de Sonar en un objeto con nombres estables.
 * @param {Array<{metric: string, value: string}>} [measures]
 * @returns {object}
 */
function normalizeMeasures(measures = []) {
  const metrics = {};
  if (!Array.isArray(measures)) {
    return metrics;
  }

  for (const measure of measures) {
    if (!measure || typeof measure.metric !== 'string') {
      continue;
    }
    const mapping = METRIC_MAP[measure.metric];
    if (!mapping) {
      continue;
    }
    metrics[mapping.key] =
      mapping.type === 'number' ? toNumber(measure.value) : String(measure.value);
  }

  return metrics;
}

/**
 * Normaliza un issue de Sonar al formato del reporte.
 * @param {object} [issue]
 * @returns {object}
 */
function normalizeIssue(issue = {}) {
  const line = issue.line === undefined || issue.line === null ? null : toNumber(issue.line);
  return {
    key: issue.key || null,
    rule: issue.rule || null,
    severity: issue.severity || null,
    type: issue.type || null,
    component: issue.component || null,
    line,
    message: issue.message || '',
    effort: issue.effort || null,
    status: issue.status || null,
  };
}

/**
 * Evalúa el resultado de Sonar y calcula el estado final del análisis.
 * @param {object} [options]
 * @param {string} [options.qualityGate] - OK, WARN, ERROR o NONE.
 * @param {object} [options.metrics] - Métricas normalizadas.
 * @param {Array} [options.issues] - Issues crudos de Sonar.
 * @param {object} [options.thresholds] - Umbrales configurables.
 * @param {string} [options.source] - Origen del análisis.
 * @param {string|null} [options.projectKey] - Project key de Sonar.
 * @param {Error|null} [options.error] - Error de consulta.
 * @param {boolean} [options.qualityGateRequired] - Si el gate ERROR bloquea.
 * @param {string|null} [options.skipReason] - Motivo para forzar `skipped`.
 * @returns {object}
 */
function evaluateQuality({
  qualityGate = 'NONE',
  metrics = {},
  issues = [],
  thresholds = {},
  source = 'sonarqube',
  projectKey = null,
  error = null,
  qualityGateRequired = true,
  skipReason = null,
} = {}) {
  const resolvedThresholds = normalizeThresholds(thresholds);
  const normalizedMetrics = metrics && typeof metrics === 'object' ? metrics : {};
  const normalizedIssues = Array.isArray(issues) ? issues.map(normalizeIssue) : [];

  function buildReport(status, reasons) {
    return {
      source,
      status,
      qualityGate: qualityGate || 'NONE',
      projectKey,
      metrics: normalizedMetrics,
      issues: normalizedIssues,
      thresholds: resolvedThresholds,
      reasons,
    };
  }

  if (skipReason) {
    return buildReport('skipped', [skipReason]);
  }

  if (error) {
    const message = error.message ? error.message : String(error);
    return buildReport('failed', [`Error al consultar SonarQube: ${message}`]);
  }

  if (qualityGate === 'NONE' && Object.keys(normalizedMetrics).length === 0) {
    return buildReport('skipped', ['Sin datos de análisis en SonarQube']);
  }

  const reasons = [];
  let failed = false;
  let warning = false;

  if (qualityGate === 'ERROR') {
    if (qualityGateRequired) {
      failed = true;
      reasons.push('Quality Gate en estado ERROR');
    } else {
      warning = true;
      reasons.push('Quality Gate en estado ERROR (no bloqueante)');
    }
  } else if (qualityGate === 'WARN') {
    warning = true;
    reasons.push('Quality Gate en estado WARN');
  }

  const missingMetrics = [];

  if (resolvedThresholds.minCoverage !== null) {
    if (normalizedMetrics.coverage === undefined || normalizedMetrics.coverage === null) {
      missingMetrics.push('cobertura');
    } else if (normalizedMetrics.coverage < resolvedThresholds.minCoverage) {
      failed = true;
      reasons.push(
        `Cobertura ${normalizedMetrics.coverage}% < mínimo ${resolvedThresholds.minCoverage}%`,
      );
    }
  }

  if (resolvedThresholds.maxComplexity !== null) {
    if (normalizedMetrics.complexity === undefined || normalizedMetrics.complexity === null) {
      missingMetrics.push('complejidad');
    } else if (normalizedMetrics.complexity > resolvedThresholds.maxComplexity) {
      failed = true;
      reasons.push(
        `Complejidad ${normalizedMetrics.complexity} > máximo ${resolvedThresholds.maxComplexity}`,
      );
    }
  }

  if (resolvedThresholds.maxDuplication !== null) {
    if (normalizedMetrics.duplication === undefined || normalizedMetrics.duplication === null) {
      missingMetrics.push('duplicación');
    } else if (normalizedMetrics.duplication > resolvedThresholds.maxDuplication) {
      failed = true;
      reasons.push(
        `Duplicación ${normalizedMetrics.duplication}% > máximo ${resolvedThresholds.maxDuplication}%`,
      );
    }
  }

  if (missingMetrics.length > 0) {
    warning = true;
    reasons.push(`Métricas no disponibles: ${missingMetrics.join(', ')}`);
  }

  let status = 'passed';
  if (failed) {
    status = 'failed';
  } else if (warning) {
    status = 'warning';
  }

  return buildReport(status, reasons);
}

module.exports = {
  DEFAULT_THRESHOLDS,
  METRIC_MAP,
  normalizeThresholds,
  normalizeMeasures,
  normalizeIssue,
  evaluateQuality,
};
