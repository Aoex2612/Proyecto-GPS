const {
  buildDefaultHandlers,
  buildSummaryMarkdown,
  loadEventPayload,
  parseBoolean,
  parseNumber,
  resolveDeliveryContext,
  runCli,
} = require('../../src/pipeline/cli');
const { LifecycleTask } = require('../../src/pipeline/ci-engine');

/**
 * Payload mínimo de un evento pull_request.
 * @param {object} [overrides]
 * @returns {object}
 */
function buildPullRequestPayload(overrides = {}) {
  return {
    action: 'opened',
    number: 42,
    repository: { full_name: 'equipo-uma/proyecto-gps' },
    pull_request: {
      number: 42,
      base: { ref: 'develop' },
      head: { ref: 'HU01-T05-motor-integracion-continua', sha: 'abc1234' },
    },
    ...overrides,
  };
}

/**
 * Cliente de GitHub simulado para el handler de autoría.
 * @returns {object}
 */
function createFakeClient() {
  return {
    rest: {
      pulls: {
        listCommits: jest.fn().mockResolvedValue({
          data: [
            {
              sha: 'sha-1',
              commit: {
                message: 'feat: cambio humano',
                author: { name: 'Ana', email: 'ana@example.com', date: '2026-11-16T10:00:00Z' },
                committer: {
                  name: 'Ana',
                  email: 'ana@example.com',
                  date: '2026-11-16T10:00:00Z',
                },
              },
              author: { name: 'Ana', email: 'ana@example.com', login: 'ana', type: 'User' },
              committer: { name: 'Ana', email: 'ana@example.com', login: 'ana', type: 'User' },
            },
          ],
        }),
      },
      repos: { listCommits: jest.fn().mockResolvedValue({ data: [] }) },
    },
  };
}

describe('HU01-T5 - CLI del motor de integración continua', () => {
  describe('parseo de entorno', () => {
    test('normaliza números y booleanos', () => {
      expect(parseNumber('1500', undefined)).toBe(1500);
      expect(parseNumber('', 10)).toBe(10);
      expect(parseNumber('no-es-numero', 10)).toBe(10);
      expect(parseBoolean(undefined)).toBe(true);
      expect(parseBoolean('false')).toBe(false);
      expect(parseBoolean('0')).toBe(false);
      expect(parseBoolean('true')).toBe(true);
    });
  });

  describe('contexto de la entrega', () => {
    test('extrae los datos de una pull_request', () => {
      const context = resolveDeliveryContext(
        { GITHUB_REPOSITORY: 'equipo-uma/proyecto-gps' },
        buildPullRequestPayload(),
      );

      expect(context).toEqual({
        eventName: 'pull_request',
        eventAction: 'opened',
        baseBranch: 'develop',
        headBranch: 'HU01-T05-motor-integracion-continua',
        repository: 'equipo-uma/proyecto-gps',
        pullNumber: 42,
        commitSha: 'abc1234',
      });
    });

    test('extrae los datos de un push', () => {
      const context = resolveDeliveryContext(
        {
          GITHUB_EVENT_NAME: 'push',
          GITHUB_REPOSITORY: 'equipo-uma/proyecto-gps',
          GITHUB_REF_NAME: 'develop',
          GITHUB_SHA: 'def5678',
        },
        { ref: 'refs/heads/develop', after: 'def5678' },
      );

      expect(context).toEqual({
        eventName: 'push',
        eventAction: 'push',
        baseBranch: 'develop',
        headBranch: 'develop',
        repository: 'equipo-uma/proyecto-gps',
        pullNumber: null,
        commitSha: 'def5678',
      });
    });

    test('normaliza referencias refs/heads/ en eventos push', () => {
      const context = resolveDeliveryContext(
        { GITHUB_EVENT_NAME: 'push', GITHUB_REPOSITORY: 'owner/repo' },
        { ref: 'refs/heads/main', after: 'abc1234' },
      );

      expect(context.baseBranch).toBe('main');
      expect(context.headBranch).toBe('main');
    });

    test('cae a valores por defecto sin payload ni entorno de GitHub', () => {
      const context = resolveDeliveryContext({}, null);

      expect(context.eventName).toBe('pull_request');
      expect(context.eventAction).toBe('opened');
      expect(context.baseBranch).toBe('develop');
      expect(context.pullNumber).toBeNull();
    });
  });

  describe('lectura del payload', () => {
    test('tolera la ausencia o corrupción del fichero de evento', async () => {
      expect(await loadEventPayload({}, async () => '{}')).toBeNull();
      expect(
        await loadEventPayload(
          { GITHUB_EVENT_PATH: 'evento.json' },
          async () => 'contenido inválido',
        ),
      ).toBeNull();
      expect(
        await loadEventPayload({ GITHUB_EVENT_PATH: 'evento.json' }, async () =>
          JSON.stringify({ action: 'opened' }),
        ),
      ).toEqual({ action: 'opened' });
    });
  });

  describe('ejecución completa', () => {
    test('escribe ci-report.json y devuelve código 0 si todo pasa', async () => {
      const written = [];
      const result = await runCli({
        env: {
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_REPOSITORY: 'equipo-uma/proyecto-gps',
          GITHUB_EVENT_PATH: 'evento.json',
        },
        readFileImpl: async () => JSON.stringify(buildPullRequestPayload()),
        writeFileImpl: async (filePath, content) => {
          written.push({ filePath, content });
        },
        appendFileImpl: async () => {},
      });

      expect(result.exitCode).toBe(0);
      expect(result.report.summary.status).toBe('passed');
      expect(result.report.summary.phases.executed).toBe(3);
      expect(result.reportPath.endsWith('ci-report.json')).toBe(true);
      expect(written).toHaveLength(1);

      const parsed = JSON.parse(written[0].content);
      expect(parsed.delivery.pullRequest).toBe(42);
      expect(parsed.lifecycle.concurrencyGroup).toBe('ci-equipo-uma-proyecto-gps-pr-42');
      expect(parsed.phase).toBe('reporting');
    });

    test('devuelve código 1 cuando una tarea bloqueante falla', async () => {
      const result = await runCli({
        env: {
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_REPOSITORY: 'equipo-uma/proyecto-gps',
        },
        handlers: {
          [LifecycleTask.ANALYZE_QUALITY]: async () => {
            throw new Error('Quality Gate en ERROR');
          },
        },
        writeFileImpl: async () => {},
        appendFileImpl: async () => {},
      });

      expect(result.exitCode).toBe(1);
      expect(result.report.summary.status).toBe('failed');
    });

    test('respeta CI_ENGINE_FAIL_ON_ERROR=false', async () => {
      const result = await runCli({
        env: {
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_REPOSITORY: 'equipo-uma/proyecto-gps',
          CI_ENGINE_FAIL_ON_ERROR: 'false',
        },
        handlers: {
          [LifecycleTask.ANALYZE_QUALITY]: async () => {
            throw new Error('Quality Gate en ERROR');
          },
        },
        writeFileImpl: async () => {},
        appendFileImpl: async () => {},
      });

      expect(result.exitCode).toBe(0);
      expect(result.report.summary.status).toBe('failed');
    });

    test('no ejecuta el ciclo si el evento no dispara el análisis', async () => {
      const result = await runCli({
        env: {
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_REPOSITORY: 'equipo-uma/proyecto-gps',
          GITHUB_EVENT_PATH: 'evento.json',
        },
        readFileImpl: async () => JSON.stringify(buildPullRequestPayload({ action: 'closed' })),
        writeFileImpl: async () => {},
        appendFileImpl: async () => {},
      });

      expect(result.exitCode).toBe(0);
      expect(result.report.lifecycle.valid).toBe(false);
      expect(result.report.summary.status).toBe('skipped');
      expect(result.report.summary.phases.executed).toBe(0);
    });

    test('añade el resumen al step summary cuando está disponible', async () => {
      const appended = [];
      await runCli({
        env: {
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_REPOSITORY: 'equipo-uma/proyecto-gps',
          GITHUB_STEP_SUMMARY: 'summary.md',
        },
        writeFileImpl: async () => {},
        appendFileImpl: async (filePath, content) => {
          appended.push({ filePath, content });
        },
      });

      expect(appended).toHaveLength(1);
      expect(appended[0].filePath).toBe('summary.md');
      expect(appended[0].content).toContain('Motor de integración continua (HU01-T5)');
      expect(appended[0].content).toContain('pull_request.opened');
    });
  });

  describe('handlers por defecto', () => {
    test('no registra autoría si CI_ANALYZE_AUTHORSHIP no está activo', () => {
      const handlers = buildDefaultHandlers({ env: {} });

      expect(handlers[LifecycleTask.ANALYZE_AUTHORSHIP]).toBeUndefined();
      expect(handlers[LifecycleTask.VERIFY_TRIGGER]).toEqual(expect.any(Function));
    });

    test('avisa si se activa la autoría sin token', async () => {
      const handlers = buildDefaultHandlers({ env: { CI_ANALYZE_AUTHORSHIP: 'true' } });

      await expect(handlers[LifecycleTask.ANALYZE_AUTHORSHIP]({ delivery: {} })).rejects.toThrow(
        'GITHUB_TOKEN',
      );
    });

    test('analiza la autoría con el cliente inyectado', async () => {
      const client = createFakeClient();
      const result = await runCli({
        env: {
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_EVENT_PATH: 'evento.json',
          GITHUB_REPOSITORY: 'equipo-uma/proyecto-gps',
          GITHUB_TOKEN: 'token',
          CI_ANALYZE_AUTHORSHIP: 'true',
          CI_AI_THRESHOLD: '50',
        },
        readFileImpl: async () => JSON.stringify(buildPullRequestPayload()),
        createClient: () => client,
        writeFileImpl: async () => {},
        appendFileImpl: async () => {},
      });

      expect(client.rest.pulls.listCommits).toHaveBeenCalledTimes(1);
      expect(result.report.authorship.authorship).toEqual(
        expect.objectContaining({ human: 1, aiAssisted: 0, unknown: 0, total: 1 }),
      );
      expect(result.report.summary.status).toBe('passed');
      expect(result.summaryMarkdown).toContain('Autoría:');
    });

    test('degrada la autoría a aviso cuando falta el token', async () => {
      const result = await runCli({
        env: {
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_REPOSITORY: 'equipo-uma/proyecto-gps',
          GITHUB_SHA: 'abc1234',
          CI_ANALYZE_AUTHORSHIP: 'true',
        },
        writeFileImpl: async () => {},
        appendFileImpl: async () => {},
      });
      const task = result.report.phases
        .flatMap((phase) => phase.tasks)
        .find((item) => item.id === LifecycleTask.ANALYZE_AUTHORSHIP);

      expect(task.status).toBe('warning');
      expect(task.error.message).toContain('GITHUB_TOKEN');
      expect(result.report.summary.status).toBe('warning');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('resumen Markdown', () => {
    test('incluye estado, tareas y fases ejecutadas', () => {
      const markdown = buildSummaryMarkdown({
        lifecycle: {
          event: { name: 'pull_request', action: 'synchronize', branch: 'develop' },
          concurrencyGroup: 'ci-owner-repo-pr-7',
        },
        summary: {
          status: 'passed',
          durationMs: 120,
          tasks: { passed: 4, warning: 0, failed: 0, skipped: 2 },
        },
        phases: [
          { id: 'pull_request', automated: true, status: 'passed', tasks: [1, 2] },
          { id: 'analysis', automated: true, status: 'passed', tasks: [3, 4] },
          { id: 'reporting', automated: true, status: 'passed', tasks: [5, 6] },
        ],
      });

      expect(markdown).toContain('**passed**');
      expect(markdown).toContain('pull_request.synchronize');
      expect(markdown).toContain('ci-owner-repo-pr-7');
      expect(markdown).toContain('| `analysis` | passed | 2 |');
    });
  });
});
