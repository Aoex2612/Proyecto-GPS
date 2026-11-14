const { detectAuthorship, analyzeAuthorship } = require('../src/classifier/authorship-detector');
const { AuthorshipOrigin } = require('../src/classifier/authorship-classifier');

describe('HU01-T03 - Sistema de detección de procedencia del código con metadatos', () => {
  const humanAuthor = {
    name: 'Ángel López',
    email: 'angel@example.com',
    date: '2026-11-14T10:00:00Z',
  };

  function createRawGithubCommit({
    sha,
    author = humanAuthor,
    committer = humanAuthor,
    message = 'feat: add feature',
    files = [{ filename: 'src/index.js', additions: 20, patch: '+const x = 1;' }],
    date = '2026-11-14T10:00:00Z',
    authorLogin = 'alopez',
    authorType = 'User',
  } = {}) {
    return {
      sha,
      author: { login: authorLogin, type: authorType },
      committer: { login: committer.login || authorLogin, type: authorType },
      commit: {
        author: { ...author, date },
        committer: { ...committer, date },
        message,
      },
      files,
    };
  }

  describe('Análisis con lista vacía o nula', () => {
    test('devuelve estructura con contadores a cero cuando no hay commits', () => {
      const result = detectAuthorship({ commits: [] });

      expect(result.authorship).toEqual({
        human: 0,
        aiAssisted: 0,
        unknown: 0,
        total: 0,
        percentage: {
          human: 0,
          aiAssisted: 0,
          unknown: 0,
        },
        lines: {
          human: 0,
          aiAssisted: 0,
          unknown: 0,
          total: 0,
        },
      });
      expect(result.verdict.status).toBe('passed');
      expect(result.verdict.exceedsThreshold).toBe(false);
      expect(result.contributions).toEqual([]);
      expect(result.identities).toEqual([]);
    });

    test('acepta invocación sin argumentos de forma segura', () => {
      const result = detectAuthorship();
      expect(result.authorship.total).toBe(0);
      expect(result.verdict.status).toBe('passed');
    });

    test('detectAuthorship y analyzeAuthorship son la misma función', () => {
      expect(detectAuthorship).toBe(analyzeAuthorship);
    });
  });

  describe('Detección sobre commits individuales', () => {
    test('clasifica commits puramente humanos', () => {
      const rawCommits = [
        createRawGithubCommit({ sha: 'commit-1', message: 'feat: implement login' }),
        createRawGithubCommit({ sha: 'commit-2', message: 'test: add login unit tests' }),
      ];

      const result = detectAuthorship({ commits: rawCommits });

      expect(result.authorship.human).toBe(2);
      expect(result.authorship.aiAssisted).toBe(0);
      expect(result.authorship.unknown).toBe(0);
      expect(result.authorship.total).toBe(2);
      expect(result.authorship.percentage.human).toBe(100);
      expect(result.authorship.percentage.aiAssisted).toBe(0);
      expect(result.verdict.status).toBe('passed');
      expect(result.verdict.exceedsThreshold).toBe(false);
    });

    test('detecta commit asistido por IA mediante trailers de metadatos', () => {
      const rawCommits = [
        createRawGithubCommit({
          sha: 'commit-ai',
          message: 'feat: complex logic\n\nAI-Assisted: true\nGenerated-by: ChatGPT',
        }),
      ];

      const result = detectAuthorship({ commits: rawCommits });

      expect(result.authorship.aiAssisted).toBe(1);
      expect(result.authorship.human).toBe(0);
      expect(result.authorship.percentage.aiAssisted).toBe(100);
      expect(result.contributions[0].origin).toBe(AuthorshipOrigin.AI_ASSISTED);
      expect(result.contributions[0].rule).toBe('ai-trailer');
    });

    test('detecta commit asistido por IA mediante coautoría con bot o herramienta IA', () => {
      const rawCommits = [
        createRawGithubCommit({
          sha: 'commit-coauthor',
          message: 'feat: parser\n\nCo-authored-by: GitHub Copilot <copilot@github.com>',
        }),
      ];

      const result = detectAuthorship({ commits: rawCommits });

      expect(result.authorship.aiAssisted).toBe(1);
      expect(result.contributions[0].rule).toBe('ai-coauthor');
    });

    test('detecta bot en autor o committer', () => {
      const rawCommits = [
        createRawGithubCommit({
          sha: 'commit-bot',
          authorLogin: 'github-actions[bot]',
          authorType: 'Bot',
        }),
      ];

      const result = detectAuthorship({ commits: rawCommits });

      expect(result.authorship.aiAssisted).toBe(1);
      expect(result.contributions[0].rule).toBe('bot-identity');
    });

    test('detecta residuos textuales de chat LLM en el diff', () => {
      const rawCommits = [
        createRawGithubCommit({
          sha: 'commit-diff-residue',
          files: [
            {
              filename: 'src/utils.js',
              additions: 15,
              patch: '+// ```javascript\n+const a = 1;',
            },
          ],
        }),
      ];

      const result = detectAuthorship({ commits: rawCommits });

      expect(result.authorship.aiAssisted).toBe(1);
      expect(result.contributions[0].rule).toBe('ai-text-residue');
    });
  });

  describe('Detección de anomalías de velocidad temporal', () => {
    test('clasifica como UNKNOWN commits con adiciones sobrehumanas en corto tiempo', () => {
      const rawCommits = [
        createRawGithubCommit({
          sha: 'c1',
          date: '2026-11-14T10:00:00Z',
          files: [{ filename: 'src/app.js', additions: 10, patch: '+line' }],
        }),
        createRawGithubCommit({
          sha: 'c2',
          date: '2026-11-14T10:00:30Z', // 30 segundos después
          files: [{ filename: 'src/massive.js', additions: 1500, patch: '+massive' }],
        }),
      ];

      const result = detectAuthorship({ commits: rawCommits });

      expect(result.authorship.human).toBe(1);
      expect(result.authorship.unknown).toBe(1);
      expect(result.contributions[1].origin).toBe(AuthorshipOrigin.UNKNOWN);
      expect(result.contributions[1].rule).toBe('velocity-anomaly');
    });
  });

  describe('Evaluación de umbrales y dictamen global (verdict)', () => {
    test('dictamina passed cuando el porcentaje de IA está por debajo o igual al umbral', () => {
      const rawCommits = [
        createRawGithubCommit({ sha: 'c1' }), // human
        createRawGithubCommit({ sha: 'c2' }), // human
        createRawGithubCommit({ sha: 'c3', message: 'feat: [ai-generated]' }), // ai
      ]; // 1/3 = 33.3% <= 50%

      const result = detectAuthorship({ commits: rawCommits, thresholdAi: 50 });

      expect(result.authorship.percentage.aiAssisted).toBe(33.3);
      expect(result.verdict.status).toBe('passed');
      expect(result.verdict.exceedsThreshold).toBe(false);
    });

    test('dictamina review_required cuando el porcentaje de IA supera el umbral configurado', () => {
      const rawCommits = [
        createRawGithubCommit({ sha: 'c1' }), // human
        createRawGithubCommit({ sha: 'c2', message: 'feat: [ai-generated]' }), // ai
        createRawGithubCommit({ sha: 'c3', message: 'feat: [ai-assisted]' }), // ai
      ]; // 2/3 = 66.7% > 50%

      const result = detectAuthorship({ commits: rawCommits, thresholdAi: 50 });

      expect(result.authorship.percentage.aiAssisted).toBe(66.7);
      expect(result.verdict.status).toBe('review_required');
      expect(result.verdict.exceedsThreshold).toBe(true);
      expect(result.verdict.reasons.length).toBeGreaterThan(0);
    });

    test('acepta umbral como cadena de texto o número y lo normaliza', () => {
      const rawCommits = [
        createRawGithubCommit({ sha: 'c1' }),
        createRawGithubCommit({ sha: 'c2', message: 'feat: [ai-generated]' }),
      ]; // 50%

      const result1 = detectAuthorship({ commits: rawCommits, thresholdAi: '40' });
      expect(result1.verdict.exceedsThreshold).toBe(true); // 50% > 40%

      const result2 = detectAuthorship({ commits: rawCommits, thresholdAi: '60' });
      expect(result2.verdict.exceedsThreshold).toBe(false); // 50% <= 60%

      const resultDefault = detectAuthorship({ commits: rawCommits, thresholdAi: 'invalido' });
      expect(resultDefault.thresholdAi).toBe(50);

      const resultEmpty = detectAuthorship({ commits: rawCommits, thresholdAi: '' });
      expect(resultEmpty.thresholdAi).toBe(50);
    });

    test('procesa commits ya normalizados sin la estructura cruda de GitHub', () => {
      const parsedCommits = [
        {
          sha: 'parsed-1',
          author: { name: 'Ángel López', email: 'angel@example.com' },
          committer: { name: 'Ángel López', email: 'angel@example.com' },
          message: 'feat: already parsed commit',
          files: null,
        },
      ];

      const result = detectAuthorship({ commits: parsedCommits });
      expect(result.authorship.human).toBe(1);
      expect(result.authorship.total).toBe(1);
    });

    test('la fachada src/classifier/index reexporta detectAuthorship y classifyContribution', () => {
      const classifierIndex = require('../src/classifier');
      expect(classifierIndex.detectAuthorship).toBeDefined();
      expect(classifierIndex.classifyContribution).toBeDefined();
    });

    test('alerta en reasons si existen aportaciones desconocidas (UNKNOWN)', () => {
      const rawCommits = [
        createRawGithubCommit({
          sha: 'c1',
          author: { name: 'Anonymous', email: 'invalid-email' },
        }),
      ];

      const result = detectAuthorship({ commits: rawCommits });

      expect(result.authorship.unknown).toBe(1);
      expect(
        result.verdict.reasons.some((r) => r.includes('desconocida') || r.includes('UNKNOWN')),
      ).toBe(true);
    });
  });

  describe('Cálculo agregado de líneas de código (lines)', () => {
    test('computa las líneas añadidas acumuladas por origen', () => {
      const rawCommits = [
        createRawGithubCommit({
          sha: 'c1',
          files: [{ filename: 'src/a.js', additions: 40, patch: '+a' }],
        }), // human: 40
        createRawGithubCommit({
          sha: 'c2',
          message: 'feat: ai [ai-assisted]',
          files: [{ filename: 'src/b.js', additions: 60, patch: '+b' }],
        }), // ai: 60
      ];

      const result = detectAuthorship({ commits: rawCommits });

      expect(result.authorship.lines).toEqual({
        human: 40,
        aiAssisted: 60,
        unknown: 0,
        total: 100,
      });
    });
  });

  describe('Preservación del contrato delivery de HU01-T1', () => {
    test('incluye metadatos de entrega cuando se suministran en options', () => {
      const delivery = {
        repository: 'equipo-uma/proyecto-gps',
        pullRequest: 42,
        baseBranch: 'develop',
        headBranch: 'HU01-T03-desarrollar-sistema',
        commitSha: 'abc1234',
      };

      const result = detectAuthorship({
        commits: [],
        delivery,
      });

      expect(result.delivery).toEqual(delivery);
    });

    test('proporciona delivery por defecto seguro si no se especifica', () => {
      const result = detectAuthorship({ commits: [] });
      expect(result.delivery).toEqual({
        repository: null,
        pullRequest: null,
        baseBranch: null,
        headBranch: null,
        commitSha: null,
      });
    });
  });
});
