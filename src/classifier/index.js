/**
 * Fachada del subsistema de clasificación y detección de autoría (HU01 - T3 / HU07)
 */

const classifier = require('./authorship-classifier');
const detector = require('./authorship-detector');

module.exports = {
  ...classifier,
  ...detector,
};

