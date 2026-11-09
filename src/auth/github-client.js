/**
 * Módulo de Autenticación y Cliente de GitHub (HU08 - T1 / T2)
 *
 * Responsable asignado en Sprint 1: Félix Jiménez Almanza (FA)
 * Revisor asignado: Ángel López Sánchez (AS)
 */

/**
 * Inicializa y retorna el cliente seguro para interactuar con la API de GitHub.
 * @param {string} token - Token de autenticación de GitHub (GITHUB_TOKEN).
 */
function createGitHubClient(token) {
  if (!token) {
    throw new Error('GitHub token es requerido para inicializar el cliente.');
  }

  // TODO: Félix (HU08-T02): Implementar inicialización con @actions/github (Octokit)
  return null;
}

module.exports = { createGitHubClient };
