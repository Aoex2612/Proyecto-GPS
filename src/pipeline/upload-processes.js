/**
 * Procesos implicados en la subida de código (HU01 - T2)
 *
 * Responsable: Ángel López Sánchez (AS)
 * Revisor asignado: Jorge Torres Sánchez (JS)
 *
 * Identifica y cataloga los procesos que ocurren cuando un desarrollador
 * sube su código al repositorio remoto y abre o actualiza una Pull Request.
 * Complementa el contrato de fases de HU01-T1 detallando los comandos Git,
 * eventos de GitHub y acciones automáticas implicados en las fases
 * `development`, `push` y `pull_request` del ciclo de entrega.
 *
 * Diseño completo: docs/HU01-T02-procesos-subida.md
 */

const { DeliveryPhase, TRIGGER_EVENTS, getPhase } = require('./phases');

// ────────────────────────────────────────────────────────────────────────────
// Tipos de proceso
// ────────────────────────────────────────────────────────────────────────────

const ProcessType = Object.freeze({
  GIT_COMMAND: 'git_command',
  GITHUB_EVENT: 'github_event',
  CI_ACTION: 'ci_action',
});

// ────────────────────────────────────────────────────────────────────────────
// Catálogo de procesos implicados en la subida
// ────────────────────────────────────────────────────────────────────────────

const UPLOAD_PROCESSES = deepFreeze([
  // ── Fase: development — comandos git locales previos a la subida ─────────
  {
    id: 'git-add',
    phase: DeliveryPhase.DEVELOPMENT,
    type: ProcessType.GIT_COMMAND,
    command: 'git add',
    description:
      'El desarrollador prepara los archivos modificados en el staging area antes de confirmarlos.',
    order: 1,
    required: true,
  },
  {
    id: 'git-commit',
    phase: DeliveryPhase.DEVELOPMENT,
    type: ProcessType.GIT_COMMAND,
    command: 'git commit',
    description:
      'El desarrollador confirma los cambios en el historial local con metadatos de autoría ' +
      '(autor, fecha, mensaje y trailers como Co-authored-by). Estos metadatos son la fuente ' +
      'principal para el análisis de autoría.',
    order: 2,
    required: true,
  },

  // ── Fase: push — publicación de la rama en el remoto ────────────────────
  {
    id: 'git-push',
    phase: DeliveryPhase.PUSH,
    type: ProcessType.GIT_COMMAND,
    command: 'git push origin <rama-de-tarea>',
    description:
      'Publica la rama de tarea en el repositorio remoto (origin), haciéndola disponible ' +
      'para revisión e integración. Este es el punto de entrada al flujo automatizado.',
    order: 3,
    required: true,
  },
  {
    id: 'push-to-protected',
    phase: DeliveryPhase.PUSH,
    type: ProcessType.GITHUB_EVENT,
    event: 'push',
    eventType: null,
    description:
      'Un push directo a develop o main (tras merge) emite un evento push que dispara ' +
      'una validación posterior a la integración.',
    order: 4,
    required: false,
  },

  // ── Fase: pull_request — apertura y eventos de GitHub ───────────────────
  {
    id: 'pr-open',
    phase: DeliveryPhase.PULL_REQUEST,
    type: ProcessType.GITHUB_EVENT,
    event: 'pull_request',
    eventType: 'opened',
    description:
      'Se abre una nueva Pull Request contra develop. GitHub emite pull_request.opened, ' +
      'que dispara el análisis automático por primera vez.',
    order: 5,
    required: true,
  },
  {
    id: 'pr-synchronize',
    phase: DeliveryPhase.PULL_REQUEST,
    type: ProcessType.GITHUB_EVENT,
    event: 'pull_request',
    eventType: 'synchronize',
    description:
      'Nuevos commits son subidos a una PR ya abierta. GitHub emite pull_request.synchronize, ' +
      'que vuelve a disparar el análisis para reflejar los últimos cambios.',
    order: 6,
    required: false,
  },
  {
    id: 'pr-reopen',
    phase: DeliveryPhase.PULL_REQUEST,
    type: ProcessType.GITHUB_EVENT,
    event: 'pull_request',
    eventType: 'reopened',
    description: 'Una PR previamente cerrada es reabierta. GitHub emite pull_request.reopened.',
    order: 7,
    required: false,
  },
  {
    id: 'pr-ready-for-review',
    phase: DeliveryPhase.PULL_REQUEST,
    type: ProcessType.GITHUB_EVENT,
    event: 'pull_request',
    eventType: 'ready_for_review',
    description:
      'Una PR en borrador pasa a lista para revisión. GitHub emite pull_request.ready_for_review.',
    order: 8,
    required: false,
  },

  // ── Acción CI disparada por los eventos de PR ────────────────────────────
  {
    id: 'ci-trigger',
    phase: DeliveryPhase.PULL_REQUEST,
    type: ProcessType.CI_ACTION,
    description:
      'Los eventos de PR disparan el workflow de CI (HU01-T5) que ejecuta lint, tests ' +
      'y el análisis automático de autoría y calidad.',
    order: 9,
    required: true,
    triggeredBy: ['pr-open', 'pr-synchronize', 'pr-reopen', 'pr-ready-for-review'],
  },
]);

// ────────────────────────────────────────────────────────────────────────────
// Funciones de consulta — usadas por HU01-T5 (motor de CI)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve todos los procesos asociados a una fase concreta.
 * @param {string} phaseId - Identificador de la fase (DeliveryPhase).
 * @returns {Array<object>}
 */
function getProcessesByPhase(phaseId) {
  return UPLOAD_PROCESSES.filter((p) => p.phase === phaseId);
}

/**
 * Devuelve un proceso por su identificador.
 * @param {string} id - Identificador del proceso.
 * @returns {object|null}
 */
function getProcess(id) {
  return UPLOAD_PROCESSES.find((p) => p.id === id) || null;
}

/**
 * Verifica que los eventos de GitHub catalogados aquí son coherentes con los
 * TRIGGER_EVENTS definidos en el contrato de T1.
 * @param {Array<object>} [processes=UPLOAD_PROCESSES] - Lista de procesos a validar.
 * @param {object} [triggerEvents=TRIGGER_EVENTS] - Contrato de triggers de T1.
 * @returns {{ valid: boolean, missingEvents: string[], extraEvents: string[] }}
 */
function validateAgainstTriggerEvents(
  processes = UPLOAD_PROCESSES,
  triggerEvents = TRIGGER_EVENTS,
) {
  const prProcesses = processes.filter(
    (p) => p.type === ProcessType.GITHUB_EVENT && p.event === 'pull_request' && p.eventType,
  );

  const catalogedTypes = prProcesses.map((p) => p.eventType);
  const contractTypes = triggerEvents.pull_request.types;

  const missingEvents = contractTypes.filter((t) => !catalogedTypes.includes(t));
  const extraEvents = catalogedTypes.filter((t) => !contractTypes.includes(t));

  return {
    valid: missingEvents.length === 0 && extraEvents.length === 0,
    missingEvents,
    extraEvents,
  };
}

/**
 * Devuelve un resumen de los procesos de subida, agrupados por fase.
 * Pensado para que T5 pueda iterar las fases y sus procesos.
 * @returns {Array<{ phase: object, processes: Array<object> }>}
 */
function getUploadSummary() {
  const phases = [DeliveryPhase.DEVELOPMENT, DeliveryPhase.PUSH, DeliveryPhase.PULL_REQUEST];
  return phases.map((phaseId) => ({
    phase: getPhase(phaseId),
    processes: getProcessesByPhase(phaseId),
  }));
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
  ProcessType,
  UPLOAD_PROCESSES,
  getProcessesByPhase,
  getProcess,
  validateAgainstTriggerEvents,
  getUploadSummary,
};
