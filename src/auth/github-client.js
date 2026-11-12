const core = require('@actions/core');
const github = require('@actions/github');

/**
 * Módulo de Autenticación y Cliente de GitHub (HU08 - T1 / T2)
 *
 * Responsable asignado en Sprint 1: Félix Jiménez Almanza (FA)
 * Revisor asignado: Ángel López Sánchez (AS) / Germán Peláez Gallardo (GG)
 */

const TOKEN_INPUT = 'github-token';
const TOKEN_ERROR_MESSAGE = 'GitHub token es requerido y debe ser una cadena válida no vacía.';
const OPTIONS_ERROR_MESSAGE = 'Las opciones de Octokit deben ser un objeto válido.';

/**
 * Valida un token de GitHub asegurando que sea una cadena no vacía.
 * @param {*} token
 * @throws {Error} Si el token es nulo, indefinido, no es string o está vacío.
 */
function validateToken(token) {
  if (typeof token !== 'string' || token.trim() === '') {
    throw new Error(TOKEN_ERROR_MESSAGE);
  }
}

/**
 * Resuelve el token de autenticación.
 *
 * Solo `undefined` se interpreta como "no proporcionado" y se lee del input
 * `github-token` de la Action. `null` y la cadena vacía se consideran tokens
 * inválidos explícitos y se rechazan en `validateToken`, evitando que un valor
 * incorrecto pase desapercibido.
 *
 * @param {string|null|undefined} token
 * @returns {string|null|undefined}
 */
function resolveToken(token) {
  if (token === undefined) {
    return core.getInput(TOKEN_INPUT, { required: true });
  }
  return token;
}

/**
 * Normaliza y valida las opciones adicionales de Octokit.
 * @param {*} options
 * @returns {object}
 * @throws {Error} Si las opciones no son un objeto.
 */
function normalizeOptions(options) {
  if (options === undefined || options === null) {
    return {};
  }
  if (typeof options !== 'object' || Array.isArray(options)) {
    throw new Error(OPTIONS_ERROR_MESSAGE);
  }
  return options;
}

/**
 * Inicializa y retorna el cliente seguro para interactuar con la API de GitHub.
 * @param {string} [token] - Token de autenticación de GitHub opcional.
 * @param {object} [options] - Opciones adicionales para Octokit.
 * @returns {object} Instancia de Octokit autenticada.
 * @throws {Error} Si el token o las opciones no son válidos.
 */
function createGitHubClient(token, options = {}) {
  const resolvedToken = resolveToken(token);
  validateToken(resolvedToken);

  const clientOptions = normalizeOptions(options);

  core.setSecret(resolvedToken);
  return github.getOctokit(resolvedToken, clientOptions);
}

module.exports = {
  createGitHubClient,
  resolveToken,
  validateToken,
};
