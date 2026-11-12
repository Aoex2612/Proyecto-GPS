const core = require('@actions/core');
const github = require('@actions/github');

/**
 * Módulo de Autenticación y Cliente de GitHub (HU08 - T1 / T2)
 *
 * Responsable asignado en Sprint 1: Félix Jiménez Almanza (FA)
 * Revisor asignado: Ángel López Sánchez (AS) / Germán Peláez Gallardo (GG)
 */

/**
 * Valida un token de GitHub asegurando que sea una cadena no vacía.
 * @param {string} token
 */
function validateToken(token) {
  if (!token || typeof token !== 'string' || token.trim() === '') {
    throw new Error('GitHub token es requerido y debe ser una cadena válida no vacía.');
  }
}

/**
 * Inicializa y retorna el cliente seguro para interactuar con la API de GitHub.
 * @param {string} [token] - Token de autenticación de GitHub opcional.
 * @param {object} [options] - Opciones adicionales para Octokit.
 * @returns {object} Instancia de Octokit autenticada.
 */
function createGitHubClient(token, options = {}) {
  const resolvedToken =
    token !== undefined ? token : core.getInput('github-token', { required: true });

  validateToken(resolvedToken);
  core.setSecret(resolvedToken);

  return github.getOctokit(resolvedToken, options);
}

module.exports = {
  createGitHubClient,
  validateToken,
};
