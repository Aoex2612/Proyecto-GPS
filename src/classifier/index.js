/**
 * Fachada del subsistema de clasificación y detección de autoría (HU01 - T3 / HU07)
 */

const classifier = require('./authorship-classifier');
const detector = require('./authorship-detector');
const unknownReview = require('./unknown-review');

module.exports = {
  ...classifier,
  ...detector,
  ...unknownReview,
};
