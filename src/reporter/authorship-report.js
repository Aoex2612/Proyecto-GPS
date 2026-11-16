/**
 * Módulo de Selección y Reportes de la Autoría (HU01 - T06)
 *
 * Responsable asignado en Sprint 1: Pablo García Gómez (PG)
 * Revisor asignado (matriz P4): Germán Peláez Gallardo (GG)
 *
 * Consume el resultado de la detección de procedencia (HU01-T03 / `authorship-detector.js`)
 * para filtrar, seleccionar datos, calcular métricas por colaborador y renderizar
 * informes formateados de autoría (Markdown, badges, resúmenes de consola y cuerpos de PR).
 *
 * Diseño completo: docs/HU01-T06-seleccion-reportes-autoria.md
 */

const { REPORT_MARKER } = require('./pr-notifier');

/**
 * Filtra las aportaciones/commits según diversos criterios de selección.
 *
 * @param {Array<object>} contributions - Lista de aportaciones clasificadas.
 * @param {object} [criteria] - Criterios de filtrado.
 * @param {string} [criteria.origin] - Filtrar por origen ('human', 'ai-assisted', 'unknown').
 * @param {string} [criteria.author] - Filtrar por nombre o email del autor (búsqueda parcial insensible a mayúsculas).
 * @param {string} [criteria.rule] - Filtrar por regla de clasificación activada.
 * @returns {Array<object>} Aportaciones que cumplen los criterios.
 */
function filterContributions(contributions, criteria = {}) {
  if (!Array.isArray(contributions)) {
    return [];
  }

  const { origin, author, rule } = criteria;

  return contributions.filter((item) => {
    if (origin && item.origin !== origin) {
      return false;
    }

    if (rule && item.rule !== rule) {
      return false;
    }

    if (author) {
      const search = String(author).trim().toLowerCase();
      const authorName = String(item.author?.name ?? '').toLowerCase();
      const authorEmail = String(item.author?.email ?? '').toLowerCase();
      const matchesName = authorName.includes(search);
      const matchesEmail = authorEmail.includes(search);

      if (!matchesName && !matchesEmail) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Agrupa y calcula estadísticas de autoría desglosadas por cada colaborador individual.
 *
 * @param {Array<object>} contributions - Lista de aportaciones analizadas.
 * @returns {Array<object>} Lista de colaboradores con sus estadísticas calculadas.
 */
function groupByAuthor(contributions) {
  if (!Array.isArray(contributions) || contributions.length === 0) {
    return [];
  }

  const authorsMap = new Map();

  for (const item of contributions) {
    const rawName = item.author?.name || item.author?.login;
    const authorName = rawName && String(rawName).trim() ? String(rawName).trim() : 'Desconocido';
    const authorEmail = item.author?.email || '';

    const key = `${authorName}:::${authorEmail}`;

    if (!authorsMap.has(key)) {
      authorsMap.set(key, {
        name: authorName,
        email: authorEmail,
        totalCommits: 0,
        humanCommits: 0,
        aiCommits: 0,
        unknownCommits: 0,
        totalLines: 0,
        humanLines: 0,
        aiLines: 0,
        unknownLines: 0,
      });
    }

    const record = authorsMap.get(key);
    const additions = Number(item.stats?.additions) || 0;

    record.totalCommits += 1;
    record.totalLines += additions;

    if (item.origin === 'human') {
      record.humanCommits += 1;
      record.humanLines += additions;
    } else if (item.origin === 'ai-assisted') {
      record.aiCommits += 1;
      record.aiLines += additions;
    } else {
      record.unknownCommits += 1;
      record.unknownLines += additions;
    }
  }

  const results = [];
  for (const record of authorsMap.values()) {
    const commitsTotal = record.totalCommits;
    const aiPercentage =
      commitsTotal > 0 ? Number(((record.aiCommits / commitsTotal) * 100).toFixed(1)) : 0;
    const humanPercentage =
      commitsTotal > 0 ? Number(((record.humanCommits / commitsTotal) * 100).toFixed(1)) : 0;

    results.push({
      ...record,
      aiPercentage,
      humanPercentage,
    });
  }

  return results;
}

/**
 * Extrae las alertas críticas de auditoría del resultado de análisis.
 *
 * @param {object} analysisResult - Resultado emitido por `detectAuthorship`.
 * @returns {Array<object>} Alertas identificadas.
 */
function getAuditAlerts(analysisResult = {}) {
  const alerts = [];
  const authorship = analysisResult.authorship || {};
  const verdict = analysisResult.verdict || {};
  const threshold = Number(analysisResult.thresholdAi ?? 50);

  if (verdict.exceedsThreshold || (authorship.percentage?.aiAssisted ?? 0) > threshold) {
    alerts.push({
      type: 'threshold_exceeded',
      severity: 'error',
      message: `El porcentaje de código asistido por IA (${authorship.percentage?.aiAssisted ?? 0}%) supera el umbral máximo configurado (${threshold}%).`,
    });
  }

  const unknownCount = authorship.unknown ?? 0;
  if (unknownCount > 0) {
    alerts.push({
      type: 'unknown_authorship',
      severity: 'warning',
      count: unknownCount,
      message: `Se han detectado ${unknownCount} aportación(es) con procedencia desconocida (UNKNOWN) que requieren auditoría.`,
    });
  }

  const aiCount = authorship.aiAssisted ?? 0;
  if (aiCount > 0 && !verdict.exceedsThreshold) {
    alerts.push({
      type: 'ai_contributions',
      severity: 'info',
      count: aiCount,
      message: `Se registraron ${aiCount} aportación(es) asistidas por IA dentro de los límites tolerados.`,
    });
  }

  return alerts;
}

/**
 * Formatea una fila cuantitativa de la tabla Markdown.
 *
 * @param {string} label
 * @param {number} count
 * @param {number} totalCount
 * @param {number} lines
 * @param {number} totalLines
 * @returns {string}
 */
function formatTableRow(label, count, totalCount, lines, totalLines) {
  const countPct = totalCount > 0 ? ((count / totalCount) * 100).toFixed(1) : '0.0';
  const linesPct = totalLines > 0 ? ((lines / totalLines) * 100).toFixed(1) : '0.0';

  return `| ${label} | ${count} | ${countPct}% | ${lines} | ${linesPct}% |`;
}

/**
 * Renderiza el informe completo en formato Markdown enriquecido para comentarios de Pull Request.
 *
 * @param {object} analysisResult - Resultado producido por `detectAuthorship`.
 * @param {object} [options]
 * @param {boolean} [options.includeDetails=true] - Si incluir el detalle de aportaciones auditadas.
 * @param {boolean} [options.includeAuthorBreakdown=true] - Si incluir la tabla por autor.
 * @returns {string} Contenido Markdown listo para visualización.
 */
function formatMarkdownReport(analysisResult = {}, options = {}) {
  const { includeDetails = true, includeAuthorBreakdown = true } = options;

  const delivery = analysisResult.delivery || {};
  const authorship = analysisResult.authorship || {};
  const verdict = analysisResult.verdict || {};
  const threshold = Number(analysisResult.thresholdAi ?? 50);
  const contributions = Array.isArray(analysisResult.contributions)
    ? analysisResult.contributions
    : [];

  const totalCommits = authorship.total ?? 0;
  const humanCommits = authorship.human ?? 0;
  const aiCommits = authorship.aiAssisted ?? 0;
  const unknownCommits = authorship.unknown ?? 0;

  const lines = authorship.lines || {};
  const totalLines = lines.total ?? 0;
  const humanLines = lines.human ?? 0;
  const aiLines = lines.aiAssisted ?? 0;
  const unknownLines = lines.unknown ?? 0;

  const isPassed = verdict.status === 'passed' && !verdict.exceedsThreshold && unknownCommits === 0;
  const statusBadge = isPassed ? '🟢 APROBADO' : '🟡 REVISIÓN REQUERIDA';

  const linesOut = [];

  linesOut.push('## 📊 Informe de Auditoría de Autoría y Calidad');
  linesOut.push('');

  const contextMeta = [];
  if (delivery.repository) {
    contextMeta.push(`**Repositorio:** \`${delivery.repository}\``);
  }
  if (delivery.pullRequest) {
    contextMeta.push(`**PR #${delivery.pullRequest}**`);
  }
  if (delivery.baseBranch && delivery.headBranch) {
    contextMeta.push(`**Ramas:** \`${delivery.headBranch}\` ➔ \`${delivery.baseBranch}\``);
  }
  if (contextMeta.length > 0) {
    linesOut.push(contextMeta.join(' | '));
    linesOut.push('');
  }

  linesOut.push(`> **Estado del análisis:** ${statusBadge}`);
  linesOut.push('');

  if (totalCommits === 0) {
    linesOut.push('ℹ️ *Sin aportaciones detectadas en esta entrega.*');
    return linesOut.join('\n');
  }

  // Tabla resumen cuantitativo
  linesOut.push('### 📈 Resumen Cuantitativo de Autoría');
  linesOut.push('');
  linesOut.push('| Origen | Aportaciones | % Aportaciones | Líneas | % Líneas |');
  linesOut.push('| :--- | :---: | :---: | :---: | :---: |');
  linesOut.push(formatTableRow('Humana', humanCommits, totalCommits, humanLines, totalLines));
  linesOut.push(formatTableRow('Asistida por IA', aiCommits, totalCommits, aiLines, totalLines));
  linesOut.push(
    formatTableRow('Desconocida', unknownCommits, totalCommits, unknownLines, totalLines),
  );
  linesOut.push(formatTableRow('**Total**', totalCommits, totalCommits, totalLines, totalLines));
  linesOut.push('');

  // Comparativa con umbral
  const aiPct =
    authorship.percentage?.aiAssisted ?? (totalCommits > 0 ? (aiCommits / totalCommits) * 100 : 0);
  linesOut.push('### 🎯 Control de Umbrales');
  linesOut.push('');
  linesOut.push(`- **Umbral máximo tolerado de IA:** \`${threshold}%\``);
  linesOut.push(`- **Porcentaje de IA detectado:** \`${aiPct}%\``);
  if (aiPct > threshold) {
    linesOut.push(
      `- ⚠️ **Alerta:** Se ha superado el umbral pactado por ${Number((aiPct - threshold).toFixed(1))}%.`,
    );
  } else {
    linesOut.push(
      '- ✅ **Conformidad:** El nivel de código asistido por IA se encuentra dentro del margen admitido.',
    );
  }
  linesOut.push('');

  // Desglose por colaborador
  if (includeAuthorBreakdown) {
    const authors = groupByAuthor(contributions);
    if (authors.length > 0) {
      linesOut.push('### 👥 Desglose por Colaborador');
      linesOut.push('');
      linesOut.push('| Colaborador | Commits | % Humano | % IA | Líneas Añadidas |');
      linesOut.push('| :--- | :---: | :---: | :---: | :---: |');
      for (const author of authors) {
        linesOut.push(
          `| ${author.name} | ${author.totalCommits} | ${author.humanPercentage}% | ${author.aiPercentage}% | ${author.totalLines} |`,
        );
      }
      linesOut.push('');
    }
  }

  // Detalle de aportaciones auditadas (IA / Unknown)
  if (includeDetails) {
    const auditedItems = contributions.filter((c) => c.origin !== 'human');
    if (auditedItems.length > 0) {
      linesOut.push('### 🔍 Detalle de Aportaciones Auditadas');
      linesOut.push('');
      linesOut.push('| Commit | Autor | Origen | Regla Activada | Motivo / Auditoría |');
      linesOut.push('| :---: | :--- | :---: | :--- | :--- |');
      for (const item of auditedItems) {
        const shortSha = item.sha ? `\`${item.sha.slice(0, 7)}\`` : '`-`';
        const authorName = item.author?.name || 'Desconocido';
        const originLabel = item.origin === 'ai-assisted' ? '🤖 IA' : '❓ Desconocido';
        const ruleName = item.rule || '-';
        const reason = item.reason || '-';
        linesOut.push(
          `| ${shortSha} | ${authorName} | ${originLabel} | \`${ruleName}\` | ${reason} |`,
        );
      }
      linesOut.push('');
    }
  }

  // Justificaciones de auditoría si las hay
  if (verdict.reasons && verdict.reasons.length > 0) {
    linesOut.push('### 📋 Motivos del Dictamen');
    linesOut.push('');
    for (const reason of verdict.reasons) {
      linesOut.push(`- ${reason}`);
    }
    linesOut.push('');
  }

  return linesOut.join('\n');
}

/**
 * Genera un resumen conciso para logs de consola o salida de GitHub Actions.
 *
 * @param {object} analysisResult - Resultado de `detectAuthorship`.
 * @returns {string} Resumen de una línea para `core.info`.
 */
function formatConsoleSummary(analysisResult = {}) {
  const authorship = analysisResult.authorship || {};
  const pct = authorship.percentage || {};
  const verdict = analysisResult.verdict || {};

  return `Autoría: Humana: ${pct.human ?? 0}%, IA: ${pct.aiAssisted ?? 0}%, Desconocida: ${pct.unknown ?? 0}% | Estado: ${verdict.status ?? 'pending'}`;
}

/**
 * Construye el objeto completo listo para publicación con `pr-notifier`.
 *
 * @param {object} analysisResult - Resultado producido por `detectAuthorship`.
 * @param {object} [targetContext] - Contexto de entrega (owner, repo, pullNumber).
 * @returns {object} Objeto de reporte con `body` formateado y marcador invisible.
 */
function buildEnrichedReport(analysisResult = {}, targetContext = {}) {
  const markdownBody = formatMarkdownReport(analysisResult);
  const bodyWithMarker = markdownBody.includes(REPORT_MARKER)
    ? markdownBody
    : `${markdownBody}\n\n${REPORT_MARKER}`;

  return {
    owner: targetContext.owner || analysisResult.delivery?.repository?.split('/')[0] || '',
    repo: targetContext.repo || analysisResult.delivery?.repository?.split('/')[1] || '',
    pullNumber: targetContext.pullNumber || analysisResult.delivery?.pullRequest || null,
    body: bodyWithMarker,
    authorship: analysisResult.authorship || {},
    verdict: analysisResult.verdict || {},
    thresholdAi: analysisResult.thresholdAi,
  };
}

module.exports = {
  filterContributions,
  groupByAuthor,
  getAuditAlerts,
  formatMarkdownReport,
  formatConsoleSummary,
  buildEnrichedReport,
};
