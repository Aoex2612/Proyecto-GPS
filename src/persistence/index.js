/**
 * Fachada del subsistema de persistencia (HU07 - T5)
 */

const classificationStore = require('./classification-store');

module.exports = {
  ...classificationStore,
};
