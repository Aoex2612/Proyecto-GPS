const core = require('@actions/core');

/**
 * Envoltorio uniforme para logging en la GitHub Action.
 */
const logger = {
  info: (message) => core.info(message),
  warning: (message) => core.warning(message),
  error: (message) => core.error(message),
  debug: (message) => core.debug(message),
};

module.exports = { logger };
