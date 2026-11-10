/**
 * Contrato de fases del ciclo de entrega (HU01 - T1)
 *
 * Responsable: Jesús Cañete García (JG)
 * Revisora asignada: Candela Marco Jiménez (CJ)
 *
 * Este módulo describe, como código y no solo como documentación, las fases
 * que recorre un cambio desde el desarrollo local hasta su integración, y los
 * eventos de GitHub que disparan el análisis automático. Es el contrato que
 * consumirá el motor de integración continua de HU01-T5.
 *
 * Diseño completo: docs/HU01-T01-diseno-fases.md
 */

const DeliveryPhase = Object.freeze({
  DEVELOPMENT: 'development',
  PUSH: 'push',
  PULL_REQUEST: 'pull_request',
  ANALYSIS: 'analysis',
  REPORTING: 'reporting',
  REVIEW: 'review',
  MERGE: 'merge',
});

const DELIVERY_PHASES = deepFreeze([
  {
    id: DeliveryPhase.DEVELOPMENT,
    order: 1,
    name: 'Desarrollo local',
    description:
      'El desarrollador implementa el cambio en su rama de tarea y registra la autoría en los commits.',
    automated: false,
  },
  {
    id: DeliveryPhase.PUSH,
    order: 2,
    name: 'Subida de la rama',
    description:
      'La rama de tarea se publica en origin y queda disponible para revisión e integración.',
    automated: false,
  },
  {
    id: DeliveryPhase.PULL_REQUEST,
    order: 3,
    name: 'Apertura o actualización de la Pull Request',
    description:
      'Se abre o actualiza una PR contra develop. Este evento dispara el análisis automático.',
    automated: true,
  },
  {
    id: DeliveryPhase.ANALYSIS,
    order: 4,
    name: 'Análisis automático',
    description:
      'La Action extrae metadatos de Git, clasifica la autoría y evalúa la calidad sin intervención manual.',
    automated: true,
  },
  {
    id: DeliveryPhase.REPORTING,
    order: 5,
    name: 'Publicación de resultados',
    description:
      'Se publica el comentario en la PR y se actualiza el Status Check con el estado del análisis.',
    automated: true,
  },
  {
    id: DeliveryPhase.REVIEW,
    order: 6,
    name: 'Revisión por pares',
    description:
      'El revisor asignado en la matriz P4 valida el cambio y deja constancia de la supervisión.',
    automated: false,
  },
  {
    id: DeliveryPhase.MERGE,
    order: 7,
    name: 'Integración',
    description:
      'La PR se integra en develop una vez en verde y, al cierre del sprint, develop pasa a main.',
    automated: false,
  },
]);

const TRIGGER_EVENTS = deepFreeze({
  pull_request: {
    types: ['opened', 'synchronize', 'reopened', 'ready_for_review'],
    branches: ['develop', 'main'],
  },
  push: {
    branches: ['develop', 'main'],
  },
});

/**
 * Congela recursivamente un valor para que el contrato no pueda mutarse en
 * tiempo de ejecución.
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

/**
 * Devuelve la fase con el identificador indicado.
 * @param {string} id
 * @returns {object|null}
 */
function getPhase(id) {
  return DELIVERY_PHASES.find((phase) => phase.id === id) || null;
}

/**
 * Devuelve la fase inmediatamente posterior, o null si no existe.
 * @param {string} id
 * @returns {object|null}
 */
function getNextPhase(id) {
  const index = DELIVERY_PHASES.findIndex((phase) => phase.id === id);
  if (index === -1 || index === DELIVERY_PHASES.length - 1) {
    return null;
  }
  return DELIVERY_PHASES[index + 1];
}

/**
 * Indica si se puede pasar de una fase a otra. Solo se permite avanzar a la
 * fase inmediatamente siguiente.
 * @param {string} fromId
 * @param {string} toId
 * @returns {boolean}
 */
function isValidTransition(fromId, toId) {
  const next = getNextPhase(fromId);
  return next !== null && next.id === toId;
}

module.exports = {
  DeliveryPhase,
  DELIVERY_PHASES,
  TRIGGER_EVENTS,
  getPhase,
  getNextPhase,
  isValidTransition,
};
