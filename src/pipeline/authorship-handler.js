/**
 * Handler de autoría para el motor de integración continua (HU01 - T5)
 *
 * Responsable: Jesús Cañete García (JG)
 * Revisor asignado (matriz P4): Ángel López Sánchez (AS)
 *
 * Conecta el motor de CI con el detector de procedencia de HU01-T3. El handler
 * descarga los commits de la entrega mediante la API de GitHub, los entrega a
 * `detectAuthorship` y devuelve el informe normalizado que el motor publica en
 * `report.authorship`.
 *
 * El token y el cliente se inyectan desde el llamador: este módulo no lee
 * secretos ni escribe credenciales en el informe.
 */

const { detectAuthorship } = require('../classifier');

const DEFAULT_THRESHOLD_AI = 50;
const DEFAULT_MAX_PAGES = 5;
const PAGE_SIZE = 100;

/**
 * Separa `owner/repo` en sus dos componentes.
 * @param {string|null} repository
 * @returns {{ owner: string, repo: string }}
 */
function splitRepository(repository) {
  const [owner, repo] = String(repository || '').split('/');
  if (!owner || !repo) {
    throw new Error('La entrega no incluye un repositorio válido (owner/repo).');
  }
  return { owner, repo };
}

/**
 * Comprueba que el cliente expone los métodos REST necesarios.
 * @param {object} client
 * @param {string} endpoint - `pulls` o `repos`.
 */
function assertClient(client, endpoint) {
  if (
    !client ||
    typeof client.rest !== 'object' ||
    typeof client.rest[endpoint]?.listCommits !== 'function'
  ) {
    throw new Error(
      `Cliente de GitHub no válido: se requiere rest.${endpoint}.listCommits autenticado.`,
    );
  }
}

/**
 * Descarga los commits de una Pull Request, con paginación acotada.
 * @param {object} client - Cliente Octokit autenticado.
 * @param {object} target
 * @param {string} target.owner
 * @param {string} target.repo
 * @param {number|string} target.pullNumber
 * @param {number} [target.maxPages=5]
 * @returns {Promise<Array<object>>}
 */
async function loadPullRequestCommits(
  client,
  { owner, repo, pullNumber, maxPages = DEFAULT_MAX_PAGES },
) {
  assertClient(client, 'pulls');

  const commits = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const response = await client.rest.pulls.listCommits({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: PAGE_SIZE,
      page,
    });
    const data = Array.isArray(response?.data) ? response.data : [];
    commits.push(...data);

    if (data.length < PAGE_SIZE) {
      break;
    }
  }

  return commits;
}

/**
 * Descarga los commits recientes de la rama de un push.
 * @param {object} client - Cliente Octokit autenticado.
 * @param {object} target
 * @param {string} target.owner
 * @param {string} target.repo
 * @param {string} target.sha
 * @returns {Promise<Array<object>>}
 */
async function loadPushCommits(client, { owner, repo, sha }) {
  assertClient(client, 'repos');

  const response = await client.rest.repos.listCommits({
    owner,
    repo,
    sha,
    per_page: PAGE_SIZE,
  });

  return Array.isArray(response?.data) ? response.data : [];
}

/**
 * Carga los commits de la entrega según su tipo (PR o push).
 * @param {object} client
 * @param {object} delivery
 * @param {number} [maxPages]
 * @returns {Promise<Array<object>>}
 */
async function loadDeliveryCommits(client, delivery = {}, maxPages = DEFAULT_MAX_PAGES) {
  const { owner, repo } = splitRepository(delivery.repository);

  if (delivery.pullRequest) {
    return loadPullRequestCommits(client, {
      owner,
      repo,
      pullNumber: delivery.pullRequest,
      maxPages,
    });
  }

  if (delivery.commitSha) {
    return loadPushCommits(client, { owner, repo, sha: delivery.commitSha });
  }

  throw new Error(
    'La entrega necesita el número de PR o el SHA del commit para analizar la autoría.',
  );
}

/**
 * Crea el handler de la tarea `analyze-authorship`.
 *
 * @param {object} options
 * @param {object} options.client - Cliente Octokit autenticado.
 * @param {number|string} [options.thresholdAi=50] - Umbral máximo de código IA.
 * @param {Function} [options.detectAuthorshipImpl] - Detector inyectable para pruebas.
 * @param {number} [options.maxPages=5] - Páginas máximas de commits de PR.
 * @returns {Function} Handler compatible con `runLifecycle`.
 */
function createAuthorshipHandler({
  client,
  thresholdAi = DEFAULT_THRESHOLD_AI,
  detectAuthorshipImpl = detectAuthorship,
  maxPages = DEFAULT_MAX_PAGES,
} = {}) {
  return async ({ delivery }) => {
    const commits = await loadDeliveryCommits(client, delivery, maxPages);

    return detectAuthorshipImpl({
      commits,
      delivery,
      thresholdAi,
    });
  };
}

module.exports = {
  DEFAULT_MAX_PAGES,
  DEFAULT_THRESHOLD_AI,
  PAGE_SIZE,
  splitRepository,
  loadPullRequestCommits,
  loadPushCommits,
  loadDeliveryCommits,
  createAuthorshipHandler,
};
