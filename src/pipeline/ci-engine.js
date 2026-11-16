/**
 * Motor de integración continua (HU01 - T5)
 *
 * Responsable: Jesús Cañete García (JG)
 * Revisor asignado (matriz P4): Ángel López Sánchez (AS)
 *
 * Orquesta las tareas del ciclo de vida del software a partir del contrato de
 * fases de HU01-T1 y del catálogo de procesos de HU01-T2. El motor no ejecuta
 * comandos por sí mismo: recibe un mapa de handlers inyectables, de modo que
 * cada subsistema (autoría, calidad, publicación) se conecta sin acoplar el
 * orquestador a la red ni a la API de GitHub.
 *
 * Garantías del motor:
 * - Solo ejecuta fases automáticas del contrato, en orden consecutivo.
 * - Valida el evento de GitHub contra `TRIGGER_EVENTS` antes de ejecutar nada.
 * - Aísla los fallos: un error bloqueante detiene las tareas restantes de su
 *   fase, pero la fase de `reporting` siempre se intenta para notificar.
 * - Acota la ejecución con un presupuesto global y un timeout por tarea.
 * - Devuelve un informe serializable y auditable (`ci-report.json`).
 *
 * Diseño completo: docs/HU01-T05-motor-ci.md
 */

const { DELIVERY_PHASES, DeliveryPhase, TRIGGER_EVENTS, isValidTransition } = require('./phases');
const { getProcessesByPhase, validateAgainstTriggerEvents } = require('./upload-processes');

// ────────────────────────────────────────────────────────────────────────────
// Catálogo de tareas del ciclo de vida
// ────────────────────────────────────────────────────────────────────────────

const LifecycleTask = Object.freeze({
  VERIFY_TRIGGER: 'verify-trigger',
  ASSEMBLE_DELIVERY: 'assemble-delivery',
  ANALYZE_AUTHORSHIP: 'analyze-authorship',
  ANALYZE_QUALITY: 'analyze-quality',
  PUBLISH_REPORT: 'publish-report',
  PUBLISH_STATUS: 'publish-status',
});

const TaskStatus = Object.freeze({
  PENDING: 'pending',
  PASSED: 'passed',
  WARNING: 'warning',
  FAILED: 'failed',
  SKIPPED: 'skipped',
});

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_TASK_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Tareas que el motor sabe orquestar. `blocking` indica si un fallo impide
 * continuar con el resto de tareas de la fase y bloquea la integración.
 */
const LIFECYCLE_TASKS = deepFreeze([
  {
    id: LifecycleTask.VERIFY_TRIGGER,
    phase: DeliveryPhase.PULL_REQUEST,
    order: 1,
    name: 'Verificar disparador del evento',
    description:
      'Comprueba que el evento de GitHub está en TRIGGER_EVENTS y que el catálogo de procesos es coherente.',
    blocking: true,
    timeoutMs: 30 * 1000,
  },
  {
    id: LifecycleTask.ASSEMBLE_DELIVERY,
    phase: DeliveryPhase.PULL_REQUEST,
    order: 2,
    name: 'Consolidar datos de la entrega',
    description:
      'Normaliza repositorio, PR, ramas y commit para el contrato `delivery` de HU01-T1.',
    blocking: true,
    timeoutMs: 30 * 1000,
  },
  {
    id: LifecycleTask.ANALYZE_AUTHORSHIP,
    phase: DeliveryPhase.ANALYSIS,
    order: 3,
    name: 'Analizar autoría',
    description: 'Invoca el detector de procedencia (HU01-T3) sobre los commits de la entrega.',
    blocking: false,
    timeoutMs: DEFAULT_TASK_TIMEOUT_MS,
  },
  {
    id: LifecycleTask.ANALYZE_QUALITY,
    phase: DeliveryPhase.ANALYSIS,
    order: 4,
    name: 'Analizar calidad',
    description: 'Invoca el análisis de calidad y complejidad (HU01-T4) y aplica sus umbrales.',
    blocking: true,
    timeoutMs: DEFAULT_TASK_TIMEOUT_MS,
  },
  {
    id: LifecycleTask.PUBLISH_REPORT,
    phase: DeliveryPhase.REPORTING,
    order: 5,
    name: 'Publicar informe en la PR',
    description:
      'Publica o actualiza el comentario de resultados mediante el notificador (HU08-T3).',
    blocking: false,
    timeoutMs: 60 * 1000,
  },
  {
    id: LifecycleTask.PUBLISH_STATUS,
    phase: DeliveryPhase.REPORTING,
    order: 6,
    name: 'Publicar Status Check',
    description:
      'Actualiza el estado del análisis para que el desarrollador sepa si puede continuar.',
    blocking: false,
    timeoutMs: 60 * 1000,
  },
]);

// ────────────────────────────────────────────────────────────────────────────
// Planificación
// ────────────────────────────────────────────────────────────────────────────

/**
 * Normaliza el identificador de una rama o evento a una cadena.
 * @param {*} value
 * @returns {string|null}
 */
function normalizeText(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

/**
 * Comprueba si un evento de GitHub dispara el análisis según el contrato T1.
 * @param {string} eventName
 * @param {string} eventAction
 * @param {string|null} branch
 * @returns {{ allowed: boolean, reason: string|null }}
 */
function resolveTrigger(eventName, eventAction, branch) {
  if (eventName === 'pull_request') {
    if (!TRIGGER_EVENTS.pull_request.types.includes(eventAction)) {
      return {
        allowed: false,
        reason: `El evento pull_request.${eventAction} no está en TRIGGER_EVENTS.pull_request.types.`,
      };
    }
    if (!TRIGGER_EVENTS.pull_request.branches.includes(branch)) {
      return {
        allowed: false,
        reason: `La rama base "${branch}" no está en TRIGGER_EVENTS.pull_request.branches.`,
      };
    }
    return { allowed: true, reason: null };
  }

  if (eventName === 'push') {
    if (!TRIGGER_EVENTS.push.branches.includes(branch)) {
      return {
        allowed: false,
        reason: `La rama "${branch}" no está en TRIGGER_EVENTS.push.branches.`,
      };
    }
    return { allowed: true, reason: null };
  }

  return {
    allowed: false,
    reason: `El evento "${eventName}" no está contemplado en TRIGGER_EVENTS.`,
  };
}

/**
 * Devuelve las tareas de una fase, ordenadas por `order`.
 * @param {string} phaseId
 * @returns {Array<object>}
 */
function getTasksByPhase(phaseId) {
  return LIFECYCLE_TASKS.filter((task) => task.phase === phaseId).sort(
    (left, right) => left.order - right.order,
  );
}

/**
 * Construye el plan de ejecución de una entrega.
 *
 * Incluye todas las fases del contrato: las manuales quedan marcadas como
 * `skipped` para que el informe refleje el ciclo completo, y las automáticas
 * llevan sus tareas en estado `pending`.
 *
 * @param {object} [options]
 * @param {string} [options.eventName='pull_request']
 * @param {string} [options.eventAction='opened']
 * @param {string} [options.baseBranch='develop']
 * @param {string} [options.headBranch]
 * @returns {object}
 */
function buildLifecyclePlan({
  eventName = 'pull_request',
  eventAction = 'opened',
  baseBranch = 'develop',
  headBranch = null,
} = {}) {
  const name = normalizeText(eventName) || 'pull_request';
  const action = name === 'push' ? 'push' : normalizeText(eventAction) || 'opened';
  const branch = normalizeText(baseBranch) || 'develop';
  const trigger = resolveTrigger(name, action, branch);
  const contract = validateAgainstTriggerEvents();

  const phases = DELIVERY_PHASES.map((phase) => {
    const tasks = phase.automated
      ? getTasksByPhase(phase.id).map((task) => ({ ...task, status: TaskStatus.PENDING }))
      : [];

    let status = phase.automated ? TaskStatus.PENDING : TaskStatus.SKIPPED;
    let reason = phase.automated ? null : 'Fase manual: no la ejecuta el motor de CI.';

    if (!trigger.allowed) {
      status = TaskStatus.SKIPPED;
      reason = trigger.reason;
    }

    return {
      ...phase,
      status,
      reason,
      // Procesos de subida catalogados en HU01-T2 para esta fase.
      processes: getProcessesByPhase(phase.id).map((process) => process.id),
      tasks: tasks.map((task) => ({
        ...task,
        status: status === TaskStatus.SKIPPED ? TaskStatus.SKIPPED : task.status,
        reason: status === TaskStatus.SKIPPED ? reason : null,
      })),
    };
  });

  const automatedPhases = phases.filter((phase) => phase.automated).map((phase) => phase.id);
  const invalidTransitions = [];
  for (let index = 1; index < automatedPhases.length; index += 1) {
    if (!isValidTransition(automatedPhases[index - 1], automatedPhases[index])) {
      invalidTransitions.push(`${automatedPhases[index - 1]} -> ${automatedPhases[index]}`);
    }
  }

  const transitionsValid = invalidTransitions.length === 0;
  const allowed = trigger.allowed && contract.valid && transitionsValid;

  let reason = trigger.reason;
  if (!contract.valid) {
    reason = `El catálogo de procesos no coincide con TRIGGER_EVENTS (faltan: ${
      contract.missingEvents.join(', ') || 'ninguno'
    }; sobran: ${contract.extraEvents.join(', ') || 'ninguno'}).`;
  } else if (!transitionsValid) {
    reason = `Transiciones de fase inválidas: ${invalidTransitions.join(', ')}.`;
  }

  return {
    valid: allowed,
    allowed,
    reason,
    event: { name, action, branch, headBranch: normalizeText(headBranch) },
    contract,
    transitions: { valid: transitionsValid, invalid: invalidTransitions },
    phases,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Ejecución
// ────────────────────────────────────────────────────────────────────────────

/**
 * Error lanzado cuando una tarea excede su tiempo máximo de ejecución.
 */
class TaskTimeoutError extends Error {
  /**
   * @param {number} timeoutMs
   */
  constructor(timeoutMs) {
    super(`La tarea excedió el tiempo máximo de ${timeoutMs} ms.`);
    this.name = 'TaskTimeoutError';
    this.code = 'TASK_TIMEOUT';
  }
}

/**
 * Resuelve una promesa con límite de tiempo.
 * @param {Promise<*>} promise
 * @param {number} timeoutMs
 * @param {object} [deps]
 * @param {Function} [deps.setTimeoutImpl]
 * @param {Function} [deps.clearTimeoutImpl]
 * @returns {Promise<*>}
 */
function runWithTimeout(promise, timeoutMs, deps = {}) {
  const setTimer = deps.setTimeoutImpl || setTimeout;
  const clearTimer = deps.clearTimeoutImpl || clearTimeout;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimer(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new TaskTimeoutError(timeoutMs));
    }, timeoutMs);

    if (timer && typeof timer.unref === 'function') {
      timer.unref();
    }

    promise.then(
      (value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimer(timer);
        resolve(value);
      },
      (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimer(timer);
        reject(error);
      },
    );
  });
}

/**
 * Normaliza un timeout a un entero positivo.
 * @param {*} value
 * @param {number} fallback
 * @returns {number}
 */
function normalizeTimeout(value, fallback) {
  const timeout = Number(value);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : fallback;
}

/**
 * Clona el plan para no mutar el objeto recibido del llamador.
 * @param {object} plan
 * @returns {object}
 */
function clonePlan(plan) {
  return {
    ...plan,
    event: { ...plan.event },
    contract: { ...plan.contract },
    transitions: { ...plan.transitions },
    phases: plan.phases.map((phase) => ({
      ...phase,
      tasks: phase.tasks.map((task) => ({ ...task })),
    })),
  };
}

/**
 * Describe un error de forma segura para el informe.
 * @param {*} error
 * @returns {{ message: string, code: string|null }}
 */
function describeError(error) {
  if (!error) {
    return { message: 'Error desconocido', code: null };
  }
  return {
    message: error.message || String(error),
    code: error.code || null,
  };
}

/**
 * Construye el contexto que recibe cada handler.
 * @param {object} state
 * @returns {object}
 */
function buildTaskContext(state) {
  return {
    delivery: { ...state.delivery },
    plan: state.plan,
    event: state.plan.event,
    outputs: state.outputs,
    logger: state.logger,
    signal: state.signal,
  };
}

/**
 * Ejecuta una tarea concreta y actualiza su estado.
 * @param {object} task
 * @param {object} state
 * @returns {Promise<void>}
 */
async function executeTask(task, state) {
  const handler = state.handlers[task.id];
  task.startedAt = new Date(state.now()).toISOString();

  if (typeof handler !== 'function') {
    task.status = TaskStatus.SKIPPED;
    task.reason = 'Sin handler registrado para la tarea.';
    task.finishedAt = task.startedAt;
    task.durationMs = 0;
    return;
  }

  const startedAt = state.now();
  const remaining = state.deadline - startedAt;
  const configuredTimeout = normalizeTimeout(task.timeoutMs, state.taskTimeoutMs);
  const effectiveTimeout = Math.min(configuredTimeout, remaining);

  try {
    const result = await runWithTimeout(
      Promise.resolve().then(() => handler(buildTaskContext(state))),
      effectiveTimeout,
      state.timerDeps,
    );

    task.status = TaskStatus.PASSED;
    task.result = result;
    state.outputs[task.id] = result;
  } catch (error) {
    const described = describeError(error);
    const isTimeout = described.code === 'TASK_TIMEOUT';
    const limitedByBudget = remaining < configuredTimeout;

    if (isTimeout && limitedByBudget) {
      state.timedOut = true;
    }

    task.status = task.blocking ? TaskStatus.FAILED : TaskStatus.WARNING;
    task.error = described;
    state.logger(`[ci-engine] Tarea ${task.id} ${task.status}: ${described.message}`);
  } finally {
    task.finishedAt = new Date(state.now()).toISOString();
    task.durationMs = Math.max(state.now() - startedAt, 0);
  }
}

/**
 * Ejecuta una fase automática del plan.
 * @param {object} phase
 * @param {object} state
 * @returns {Promise<void>}
 */
async function executePhase(phase, state) {
  if (!phase.automated) {
    phase.status = TaskStatus.SKIPPED;
    phase.reason = phase.reason || 'Fase manual: no la ejecuta el motor de CI.';
    return;
  }

  phase.startedAt = new Date(state.now()).toISOString();
  const phaseStart = state.now();
  let blocked = false;

  for (const task of phase.tasks) {
    if (state.signal?.aborted) {
      state.aborted = true;
      task.status = TaskStatus.SKIPPED;
      task.reason = 'Ejecución cancelada.';
      continue;
    }

    if (blocked) {
      task.status = TaskStatus.SKIPPED;
      task.reason = 'Una tarea bloqueante anterior falló.';
      continue;
    }

    if (state.deadline - state.now() <= 0) {
      state.timedOut = true;
      task.status = TaskStatus.SKIPPED;
      task.reason = 'Presupuesto de tiempo del pipeline agotado.';
      continue;
    }

    await executeTask(task, state);

    if (task.status === TaskStatus.FAILED) {
      blocked = true;
    }
  }

  phase.finishedAt = new Date(state.now()).toISOString();
  phase.durationMs = Math.max(state.now() - phaseStart, 0);

  if (phase.tasks.some((task) => task.status === TaskStatus.FAILED)) {
    phase.status = TaskStatus.FAILED;
  } else if (
    phase.tasks.some((task) => [TaskStatus.PASSED, TaskStatus.WARNING].includes(task.status))
  ) {
    phase.status = TaskStatus.PASSED;
  } else {
    phase.status = TaskStatus.SKIPPED;
  }
}

/**
 * Ejecuta el ciclo de vida de una entrega.
 *
 * @param {object} [options]
 * @param {string} [options.eventName]
 * @param {string} [options.eventAction]
 * @param {string} [options.baseBranch]
 * @param {string} [options.headBranch]
 * @param {string|null} [options.repository]
 * @param {number|string|null} [options.pullNumber]
 * @param {string|null} [options.commitSha]
 * @param {object} [options.handlers] - Mapa `taskId -> async (context) => result`.
 * @param {object} [options.plan] - Plan precalculado (se clona antes de usarlo).
 * @param {number} [options.timeoutMs] - Presupuesto global del pipeline.
 * @param {number} [options.taskTimeoutMs] - Timeout por tarea.
 * @param {Function} [options.now] - Reloj inyectable para pruebas.
 * @param {Function} [options.logger] - Logger inyectable.
 * @param {AbortSignal} [options.signal] - Señal de cancelación.
 * @param {object} [options.timerDeps] - Temporizadores inyectables.
 * @returns {Promise<object>} Informe del ciclo de vida.
 */
async function runLifecycle({
  eventName = 'pull_request',
  eventAction = 'opened',
  baseBranch = 'develop',
  headBranch = null,
  repository = null,
  pullNumber = null,
  commitSha = null,
  handlers = {},
  plan,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  taskTimeoutMs = DEFAULT_TASK_TIMEOUT_MS,
  now = Date.now,
  logger = () => {},
  signal = null,
  timerDeps = {},
} = {}) {
  const activePlan = clonePlan(
    plan ||
      buildLifecyclePlan({
        eventName,
        eventAction,
        baseBranch,
        headBranch,
      }),
  );

  const budget = normalizeTimeout(timeoutMs, DEFAULT_TIMEOUT_MS);
  const startedAt = now();

  const delivery = {
    repository: normalizeText(repository),
    pullRequest: pullNumber === undefined ? null : pullNumber,
    baseBranch: normalizeText(baseBranch),
    headBranch: normalizeText(headBranch),
    commitSha: normalizeText(commitSha),
  };

  const target = delivery.pullRequest
    ? `pr-${delivery.pullRequest}`
    : delivery.headBranch || delivery.commitSha || 'manual';
  const concurrencyGroup = `ci-${String(delivery.repository || 'repository').replace(
    /[/\\]/g,
    '-',
  )}-${target}`;

  const state = {
    plan: activePlan,
    delivery,
    handlers,
    outputs: {},
    deadline: startedAt + budget,
    taskTimeoutMs: normalizeTimeout(taskTimeoutMs, DEFAULT_TASK_TIMEOUT_MS),
    now,
    logger,
    signal,
    timerDeps,
    timedOut: false,
    aborted: false,
  };

  if (activePlan.valid) {
    for (const phase of activePlan.phases) {
      await executePhase(phase, state);
    }
  }

  const tasks = activePlan.phases.flatMap((phase) => phase.tasks);
  const counts = {
    total: tasks.length,
    passed: tasks.filter((task) => task.status === TaskStatus.PASSED).length,
    warning: tasks.filter((task) => task.status === TaskStatus.WARNING).length,
    failed: tasks.filter((task) => task.status === TaskStatus.FAILED).length,
    skipped: tasks.filter((task) => task.status === TaskStatus.SKIPPED).length,
  };

  let status = TaskStatus.SKIPPED;
  if (counts.failed > 0) {
    status = TaskStatus.FAILED;
  } else if (counts.warning > 0) {
    status = TaskStatus.WARNING;
  } else if (counts.passed > 0) {
    status = TaskStatus.PASSED;
  }

  if (state.timedOut) {
    status = TaskStatus.FAILED;
  }

  const executedPhases = activePlan.phases.filter((phase) => phase.automated);
  const lastAutomatedPhase = executedPhases[executedPhases.length - 1] || null;
  const durationMs = Math.max(now() - startedAt, 0);

  return {
    delivery,
    phase: activePlan.valid && lastAutomatedPhase ? lastAutomatedPhase.id : null,
    lifecycle: {
      event: activePlan.event,
      valid: activePlan.valid,
      reason: activePlan.reason,
      contract: activePlan.contract,
      transitions: activePlan.transitions,
      concurrencyGroup,
      startedAt: new Date(startedAt).toISOString(),
      timeoutMs: budget,
      taskTimeoutMs: state.taskTimeoutMs,
      durationMs,
      timedOut: state.timedOut,
      aborted: state.aborted,
    },
    phases: activePlan.phases,
    authorship: state.outputs[LifecycleTask.ANALYZE_AUTHORSHIP] ?? null,
    quality: state.outputs[LifecycleTask.ANALYZE_QUALITY] ?? {
      status: TaskStatus.SKIPPED,
      issues: [],
      reasons: ['Análisis de calidad no ejecutado por el motor de CI.'],
    },
    summary: {
      status,
      tasks: counts,
      phases: {
        total: activePlan.phases.length,
        automated: executedPhases.length,
        executed: executedPhases.filter((phase) => phase.startedAt).length,
        failed: executedPhases.filter((phase) => phase.status === TaskStatus.FAILED).length,
        skipped: activePlan.phases.filter((phase) => phase.status === TaskStatus.SKIPPED).length,
      },
      durationMs,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Handlers de contrato
// ────────────────────────────────────────────────────────────────────────────

/**
 * Handlers mínimos que validan el contrato sin llamar a servicios externos.
 * El resto de tareas se conectan por inyección desde el orquestador.
 * @returns {object}
 */
function createContractHandlers() {
  return {
    [LifecycleTask.VERIFY_TRIGGER]: async ({ plan }) => {
      if (!plan.valid) {
        throw new Error(plan.reason || 'El plan de ejecución no es válido.');
      }
      return {
        valid: true,
        event: plan.event,
        contract: plan.contract,
      };
    },
    [LifecycleTask.ASSEMBLE_DELIVERY]: async ({ delivery }) => {
      if (!delivery.repository) {
        throw new Error('Falta el repositorio de la entrega (GITHUB_REPOSITORY).');
      }
      if (!delivery.pullRequest && !delivery.commitSha) {
        throw new Error('La entrega necesita el número de PR o el SHA del commit.');
      }
      return { ...delivery };
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Utilidades internas
// ────────────────────────────────────────────────────────────────────────────

/**
 * Congela recursivamente un valor (misma estrategia que phases.js).
 * @param {*} value
 * @returns {*}
 */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze(value[key]);
    }
  }
  return value;
}

module.exports = {
  LifecycleTask,
  TaskStatus,
  LIFECYCLE_TASKS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_TASK_TIMEOUT_MS,
  TaskTimeoutError,
  resolveTrigger,
  getTasksByPhase,
  buildLifecyclePlan,
  runLifecycle,
  runWithTimeout,
  createContractHandlers,
};
