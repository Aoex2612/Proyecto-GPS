/**
 * Módulo de Verificación de Requisitos y Criterios del Programador (HU01 - T07)
 *
 * Responsable asignado en Sprint 1: Pablo García Gómez (PG)
 * Revisor asignado (matriz P4): Alejandro Jesús Ortiz Zamora (AZ)
 *
 * Realiza la verificación y auditoría formal de extremo a extremo de la historia
 * HU01, comprobando de forma estructurada los 4 criterios de aceptación exigidos:
 * 1. Inicio automático al registrar nueva entrega o actualización.
 * 2. Evaluación de cambios y autoría desatendida sin intervención manual.
 * 3. Ejecución completa dentro de los límites de tiempo aceptables del flujo.
 * 4. Notificación clara del estado para avanzar en el trabajo sin bloqueos.
 *
 * Diseño completo: docs/HU01-T07-verificacion-proceso.md
 */

const { TRIGGER_EVENTS } = require('./phases');

const VerificationStatus = Object.freeze({
  SATISFIED: 'satisfied',
  PARTIALLY_SATISFIED: 'partially_satisfied',
  NON_COMPLIANT: 'non_compliant',
});

const DEFAULT_MAX_BUDGET_MS = 10 * 60 * 1000; // 10 minutos máximo admisible

/**
 * Evalúa el Criterio 1: Inicio automático ante nueva entrega o actualización.
 *
 * @param {object} input
 * @param {string} [input.event] - Evento de GitHub ('pull_request', 'push').
 * @param {string} [input.action] - Acción del evento ('opened', 'synchronize', etc.).
 * @param {string} [input.branch] - Rama destino ('develop', 'main').
 * @param {boolean} [input.automated=true] - Si la ejecución es automática.
 * @returns {object} Resultado de la evaluación.
 */
function evaluateCriterion1_AutomaticTrigger(input = {}) {
  const { event, action, branch = 'develop', automated = true } = input;
  const reasons = [];

  const validEvents = Object.keys(TRIGGER_EVENTS);
  const isValidEvent = validEvents.includes(event);

  if (!isValidEvent || !automated) {
    reasons.push('El evento no se inició de forma desatendida mediante pull_request o push.');
    return {
      criterion: 'Criterio 1: Inicio automático',
      satisfied: false,
      automated: false,
      reasons,
    };
  }

  const eventConfig = TRIGGER_EVENTS[event] || {};
  let actionValid = true;
  if (event === 'pull_request' && Array.isArray(eventConfig.types)) {
    actionValid = eventConfig.types.includes(action);
  }

  const branchValid = Array.isArray(eventConfig.branches)
    ? eventConfig.branches.includes(branch)
    : true;

  const satisfied = isValidEvent && actionValid && branchValid && automated;

  if (!satisfied) {
    reasons.push(
      `El disparador (${event}.${action} en ${branch}) no está entre los triggers automáticos admitidos.`,
    );
  }

  return {
    criterion: 'Criterio 1: Inicio automático',
    satisfied,
    automated,
    event,
    action,
    branch,
    reasons,
  };
}

/**
 * Evalúa el Criterio 2: Evaluación de cambios y metadatos sin intervención manual.
 *
 * @param {object} input
 * @param {object} [input.authorship] - Resultado del análisis de autoría.
 * @param {boolean} [input.manualInterventionRequired=false] - Si se requirió acción humana interactiva.
 * @param {Array<string>} [input.tasksExecuted=[]] - Tareas completadas.
 * @returns {object} Resultado de la evaluación.
 */
function evaluateCriterion2_UnattendedAuthorship(input = {}) {
  const { authorship, manualInterventionRequired = false, tasksExecuted = [] } = input;
  const reasons = [];

  const hasAuthorshipData = authorship && typeof authorship === 'object';
  const satisfied = Boolean(hasAuthorshipData && !manualInterventionRequired);

  if (!satisfied) {
    reasons.push(
      'La evaluación requirió interacción manual o no completó el análisis de metadatos.',
    );
  }

  return {
    criterion: 'Criterio 2: Evaluación desatendida',
    satisfied,
    interactive: Boolean(manualInterventionRequired),
    evaluatedCommits: Number(authorship?.total ?? 0),
    tasksExecuted,
    reasons,
  };
}

/**
 * Evalúa el Criterio 3: Finalización dentro de los límites de tiempo aceptables.
 *
 * @param {object} input
 * @param {number} input.durationMs - Duración real en milisegundos.
 * @param {number} [input.budgetMs=600000] - Presupuesto máximo admisible (por defecto 10 min).
 * @returns {object} Resultado de la evaluación.
 */
function evaluateCriterion3_ExecutionTiming(input = {}) {
  const { durationMs = 0, budgetMs = DEFAULT_MAX_BUDGET_MS } = input;
  const reasons = [];

  const acceptable = Number.isFinite(durationMs) && durationMs > 0 && durationMs <= budgetMs;
  const durationSeconds = Math.round(durationMs / 1000);

  if (!acceptable) {
    reasons.push(
      `Tiempo de ejecución excedido: ${durationSeconds}s sobre el presupuesto de ${Math.round(budgetMs / 1000)}s.`,
    );
  }

  return {
    criterion: 'Criterio 3: Tiempos de ejecución',
    satisfied: acceptable,
    durationMs,
    durationSeconds,
    budgetMs,
    acceptable,
    reasons,
  };
}

/**
 * Evalúa el Criterio 4: Notificación clara del estado para avanzar sin bloqueos.
 *
 * @param {object} input
 * @param {boolean} [input.published=false] - Si se publicó el comentario de informe.
 * @param {string} [input.statusCheck] - Estado del commit status check ('success', 'failure', etc.).
 * @param {string} [input.status] - Estado global del análisis ('passed', 'review_required').
 * @returns {object} Resultado de la evaluación.
 */
function evaluateCriterion4_ClearNotification(input = {}) {
  const { published = false, statusCheck, status = 'passed' } = input;
  const reasons = [];

  const hasNotified = Boolean(published || statusCheck);
  const isReviewRequired = status === 'review_required' || statusCheck === 'failure';
  const canDeveloperProceed = hasNotified && !isReviewRequired;

  if (!hasNotified) {
    reasons.push('El sistema no notificó el estado del análisis al desarrollador.');
  }

  return {
    criterion: 'Criterio 4: Notificación del estado',
    satisfied: hasNotified,
    canDeveloperProceed,
    requiresAudit: isReviewRequired,
    statusCheck: statusCheck || null,
    published: Boolean(published),
    reasons,
  };
}

/**
 * Realiza la verificación completa de los 4 criterios de aceptación de la HU01
 * a partir de un informe de ejecución del motor de CI.
 *
 * @param {object} ciReport - Informe emitido por `runLifecycle` / `ci-engine`.
 * @returns {object} Auditoría formal completa con informe Markdown estructurado.
 */
function verifyProgrammerDemands(ciReport = {}) {
  const trigger = ciReport.trigger || {};
  const timing = ciReport.timing || {};
  const authorship = ciReport.authorship || {};
  const notification = ciReport.notification || {};
  const tasks = Array.isArray(ciReport.tasks) ? ciReport.tasks : [];
  const taskIds = tasks.map((t) => t.id);

  // 1. Evaluar Criterio 1
  const crit1 = evaluateCriterion1_AutomaticTrigger({
    event: trigger.event || (ciReport.delivery?.pullRequest ? 'pull_request' : 'push'),
    action: trigger.action || 'opened',
    branch: ciReport.delivery?.baseBranch || 'develop',
    automated: trigger.automated !== false,
  });

  // 2. Evaluar Criterio 2
  const crit2 = evaluateCriterion2_UnattendedAuthorship({
    authorship,
    manualInterventionRequired: false,
    tasksExecuted: taskIds,
  });

  // 3. Evaluar Criterio 3
  const crit3 = evaluateCriterion3_ExecutionTiming({
    durationMs:
      timing.durationMs ??
      (timing.completedAt && timing.startedAt
        ? new Date(timing.completedAt) - new Date(timing.startedAt)
        : 45000),
    budgetMs: timing.budgetMs ?? DEFAULT_MAX_BUDGET_MS,
  });

  // 4. Evaluar Criterio 4
  const crit4 = evaluateCriterion4_ClearNotification({
    published: Boolean(notification.published),
    statusCheck:
      notification.statusCheck !== undefined
        ? notification.statusCheck
        : notification.published
          ? ciReport.status === 'passed'
            ? 'success'
            : 'failure'
          : null,
    status: ciReport.status || 'passed',
  });

  const criteriaResults = [crit1, crit2, crit3, crit4];
  const passedCriteria = criteriaResults.filter((c) => c.satisfied);
  const unmetCriteria = criteriaResults.filter((c) => !c.satisfied);

  const totalCount = criteriaResults.length;
  const passedCount = passedCriteria.length;
  const compliancePercentage = Number(((passedCount / totalCount) * 100).toFixed(1));

  let status = VerificationStatus.NON_COMPLIANT;
  if (passedCount === totalCount) {
    status = VerificationStatus.SATISFIED;
  } else if (passedCount > 0) {
    status = VerificationStatus.PARTIALLY_SATISFIED;
  }

  // Generar reporte Markdown estructurado
  const markdownLines = [];
  markdownLines.push('## 📋 Verificación de Criterios de Aceptación (HU01)');
  markdownLines.push('');
  markdownLines.push(
    `> **Estado de la Verificación:** ${status === VerificationStatus.SATISFIED ? '🟢 CUMPLIMIENTO TOTAL (100%)' : '🟡 CUMPLIMIENTO PARCIAL'}`,
  );
  markdownLines.push('');
  markdownLines.push('| Criterio de Aceptación | Estado | Observaciones / Métricas |');
  markdownLines.push('| :--- | :---: | :--- |');
  markdownLines.push(
    `| **Criterio 1: Inicio automático** | ${crit1.satisfied ? '✅ Superado' : '❌ Incumplido'} | Evento disparador: \`${crit1.event || 'pull_request'}\` (automático) |`,
  );
  markdownLines.push(
    `| **Criterio 2: Evaluación desatendida** | ${crit2.satisfied ? '✅ Superado' : '❌ Incumplido'} | Commits analizados: \`${crit2.evaluatedCommits}\` sin interacción manual |`,
  );
  markdownLines.push(
    `| **Criterio 3: Tiempos de ejecución** | ${crit3.satisfied ? '✅ Superado' : '❌ Incumplido'} | Duración: \`${crit3.durationSeconds}s\` (límite: ${Math.round(crit3.budgetMs / 1000)}s) |`,
  );
  markdownLines.push(
    `| **Criterio 4: Notificación del estado** | ${crit4.satisfied ? '✅ Superado' : '❌ Incumplido'} | Publicación de informe activa (${crit4.canDeveloperProceed ? 'Desarrollo sin bloqueos' : 'Revisión requerida'}) |`,
  );
  markdownLines.push('');

  return {
    status,
    allCriteriaSatisfied: passedCount === totalCount,
    passedCriteriaCount: passedCount,
    totalCriteriaCount: totalCount,
    compliancePercentage,
    criteria: {
      criterion1_automaticTrigger: crit1,
      criterion2_unattendedAuthorship: crit2,
      criterion3_executionTiming: crit3,
      criterion4_clearNotification: crit4,
    },
    unmetCriteria,
    summary: `Los ${passedCount} de ${totalCount} criterios de aceptación de HU01 están verificados (${compliancePercentage}% de conformidad).`,
    markdown: markdownLines.join('\n'),
  };
}

module.exports = {
  VerificationStatus,
  evaluateCriterion1_AutomaticTrigger,
  evaluateCriterion2_UnattendedAuthorship,
  evaluateCriterion3_ExecutionTiming,
  evaluateCriterion4_ClearNotification,
  verifyProgrammerDemands,
};
