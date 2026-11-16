/**
 * Fachada del motor de integración continua (HU01 - T5)
 *
 * Expone el contrato de fases (T1), el catálogo de procesos (T2) y el motor
 * que los orquesta, de modo que la Action y los tests consuman una única API.
 */

const phases = require('./phases');
const uploadProcesses = require('./upload-processes');
const ciEngine = require('./ci-engine');

module.exports = {
  ...phases,
  ...uploadProcesses,
  ...ciEngine,
};
