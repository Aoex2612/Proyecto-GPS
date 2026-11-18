const {
  DEFAULT_MAX_PAGES,
  PAGE_SIZE,
  createAuthorshipHandler,
  loadDeliveryCommits,
  loadPullRequestCommits,
  loadPushCommits,
  splitRepository,
} = require('../../src/pipeline/authorship-handler');

/**
 * Construye commits simulados de la API de GitHub.
 * @param {number} count
 * @returns {Array<object>}
 */
function buildCommits(count) {
  return Array.from({ length: count }, (_, index) => ({
    sha: `sha-${index}`,
    commit: {
      message: `feat: cambio ${index}`,
      author: { name: 'Ana', email: 'ana@example.com', date: '2026-11-16T10:00:00Z' },
      committer: { name: 'Ana', email: 'ana@example.com', date: '2026-11-16T10:00:00Z' },
    },
    author: { name: 'Ana', email: 'ana@example.com', login: 'ana', type: 'User' },
    committer: { name: 'Ana', email: 'ana@example.com', login: 'ana', type: 'User' },
  }));
}

/**
 * Crea un cliente de GitHub simulado.
 * @returns {object}
 */
function createFakeClient() {
  return {
    rest: {
      pulls: { listCommits: jest.fn() },
      repos: { listCommits: jest.fn() },
    },
  };
}

describe('HU01-T5 - Handler de autoría para el motor de CI', () => {
  test('divide owner/repo y rechaza repositorios inválidos', () => {
    expect(splitRepository('equipo-uma/proyecto-gps')).toEqual({
      owner: 'equipo-uma',
      repo: 'proyecto-gps',
    });
    expect(() => splitRepository(null)).toThrow('repositorio válido');
    expect(() => splitRepository('sin-barra')).toThrow('repositorio válido');
  });

  test('descarga una página de commits de la PR', async () => {
    const client = createFakeClient();
    const commits = buildCommits(3);
    client.rest.pulls.listCommits.mockResolvedValue({ data: commits });

    const result = await loadPullRequestCommits(client, {
      owner: 'owner',
      repo: 'repo',
      pullNumber: 42,
    });

    expect(result).toEqual(commits);
    expect(client.rest.pulls.listCommits).toHaveBeenCalledTimes(1);
    expect(client.rest.pulls.listCommits).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      pull_number: 42,
      per_page: PAGE_SIZE,
      page: 1,
    });
  });

  test('pagina mientras recibe páginas completas y se detiene en la última', async () => {
    const client = createFakeClient();
    client.rest.pulls.listCommits
      .mockResolvedValueOnce({ data: buildCommits(PAGE_SIZE) })
      .mockResolvedValueOnce({ data: buildCommits(2) });

    const result = await loadPullRequestCommits(client, {
      owner: 'owner',
      repo: 'repo',
      pullNumber: 7,
    });

    expect(result).toHaveLength(PAGE_SIZE + 2);
    expect(client.rest.pulls.listCommits).toHaveBeenCalledTimes(2);
  });

  test('acota la paginación al máximo configurado', async () => {
    const client = createFakeClient();
    client.rest.pulls.listCommits.mockResolvedValue({ data: buildCommits(PAGE_SIZE) });

    const result = await loadPullRequestCommits(client, {
      owner: 'owner',
      repo: 'repo',
      pullNumber: 7,
      maxPages: 2,
    });

    expect(result).toHaveLength(PAGE_SIZE * 2);
    expect(client.rest.pulls.listCommits).toHaveBeenCalledTimes(2);
    expect(DEFAULT_MAX_PAGES).toBeGreaterThanOrEqual(2);
  });

  test('descarga los commits de un push', async () => {
    const client = createFakeClient();
    const commits = buildCommits(1);
    client.rest.repos.listCommits.mockResolvedValue({ data: commits });

    const result = await loadPushCommits(client, {
      owner: 'owner',
      repo: 'repo',
      sha: 'abc1234',
    });

    expect(result).toEqual(commits);
    expect(client.rest.repos.listCommits).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      sha: 'abc1234',
      per_page: PAGE_SIZE,
    });
  });

  test('elige el endpoint según el tipo de entrega', async () => {
    const client = createFakeClient();
    client.rest.pulls.listCommits.mockResolvedValue({ data: [] });
    client.rest.repos.listCommits.mockResolvedValue({ data: [] });

    await loadDeliveryCommits(client, {
      repository: 'owner/repo',
      pullRequest: 42,
      commitSha: 'abc',
    });
    await loadDeliveryCommits(client, {
      repository: 'owner/repo',
      pullRequest: null,
      commitSha: 'abc',
    });

    expect(client.rest.pulls.listCommits).toHaveBeenCalledTimes(1);
    expect(client.rest.repos.listCommits).toHaveBeenCalledTimes(1);
  });

  test('rechaza entregas sin PR ni SHA', async () => {
    await expect(
      loadDeliveryCommits(createFakeClient(), { repository: 'owner/repo' }),
    ).rejects.toThrow('número de PR o el SHA');
  });

  test('rechaza clientes sin los métodos REST necesarios', async () => {
    await expect(
      loadDeliveryCommits({}, { repository: 'owner/repo', pullRequest: 1 }),
    ).rejects.toThrow('Cliente de GitHub no válido');
  });

  test('crea un handler que entrega commits, delivery y umbral al detector', async () => {
    const client = createFakeClient();
    const commits = buildCommits(2);
    client.rest.pulls.listCommits.mockResolvedValue({ data: commits });
    const detector = jest.fn().mockReturnValue({ authorship: { total: 2 } });
    const delivery = {
      repository: 'owner/repo',
      pullRequest: 42,
      baseBranch: 'develop',
      headBranch: 'rama',
      commitSha: 'abc',
    };

    const handler = createAuthorshipHandler({
      client,
      thresholdAi: 35,
      detectAuthorshipImpl: detector,
    });
    const result = await handler({ delivery });

    expect(detector).toHaveBeenCalledWith({ commits, delivery, thresholdAi: 35 });
    expect(result).toEqual({ authorship: { total: 2 } });
  });

  test('propaga los errores de la API para que el motor los degrade a aviso', async () => {
    const client = createFakeClient();
    client.rest.pulls.listCommits.mockRejectedValue(new Error('API no disponible'));

    const handler = createAuthorshipHandler({
      client,
      detectAuthorshipImpl: jest.fn(),
    });

    await expect(
      handler({ delivery: { repository: 'owner/repo', pullRequest: 1 } }),
    ).rejects.toThrow('API no disponible');
  });
});
