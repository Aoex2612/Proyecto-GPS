/**
 * Fachada del subsistema de reportes y publicación (HU01 - T06 / HU08)
 */

const authorshipReport = require('./authorship-report');
const prNotifier = require('./pr-notifier');
const publicationLimits = require('./publication-limits');

module.exports = {
  ...authorshipReport,
  ...prNotifier,
  ...publicationLimits,
};
