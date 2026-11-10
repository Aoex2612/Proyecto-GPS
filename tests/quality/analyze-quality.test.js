const { analyzeQuality } = require('../../src/quality');
const { jsonResponse, sonarFetch } = require('./helpers');

const TOKEN = 'secret-token';
const PROJECT_KEY = 'Aoex2612_Proyecto-GPS';

const GOOD_MEASURES = [
  { metric: 'complexity', value: '10' },
  { metric: 'cognitive_complexity', value: '4' },
  { metric: 'coverage', value: '90' },
  { metric: 'duplicated_lines_density', value: '1' },
  { metric: 'code_smells', value: '2' },
  { metric: 'bugs', value: '0' },
  { metric: 'vulnerabilities', value: '0' },
];

function baseConfig(overrides = {}) {
  return {
    enabled: true,
    token: TOKEN,
    projectKey: PROJECT_KEY,
    thresholds: { minCoverage: 80, maxComplexity: 20, maxDuplication: 3 },
    fetchImpl: sonarFetch({ measures: GOOD_MEASURES }),
    retryDelayMs: 0,
    ...overrides,
  };
}

describe('HU01-T4 - Análisis de calidad', () => {
  test('devuelve skipped si el análisis está deshabilitado', async () => {
    const fetchImpl = jest.fn();
    const report = await analyzeQuality(baseConfig({ enabled: false, fetchImpl }));

    expect(report.status).toBe('skipped');
    expect(report.reasons).toContain('Análisis de calidad deshabilitado');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('devuelve skipped si no hay token', async () => {
    const report = await analyzeQuality(baseConfig({ token: undefined }));

    expect(report.status).toBe('skipped');
    expect(report.reasons).toContain('SONAR_TOKEN no configurado');
  });

  test('devuelve skipped si no hay project key', async () => {
    const report = await analyzeQuality(baseConfig({ projectKey: undefined }));

    expect(report.status).toBe('skipped');
    expect(report.reasons).toContain('sonar-project-key no configurado');
  });

  test('devuelve passed con Quality Gate OK y métricas correctas', async () => {
    const report = await analyzeQuality(baseConfig());

    expect(report.status).toBe('passed');
    expect(report.qualityGate).toBe('OK');
    expect(report.projectKey).toBe(PROJECT_KEY);
    expect(report.metrics).toMatchObject({
      complexity: 10,
      cognitiveComplexity: 4,
      coverage: 90,
      duplication: 1,
      codeSmells: 2,
    });
  });

  test('devuelve failed cuando el Quality Gate está en ERROR', async () => {
    const report = await analyzeQuality(
      baseConfig({ fetchImpl: sonarFetch({ gate: 'ERROR', measures: GOOD_MEASURES }) }),
    );

    expect(report.status).toBe('failed');
    expect(report.reasons).toContain('Quality Gate en estado ERROR');
  });

  test('devuelve warning cuando el Quality Gate está en WARN', async () => {
    const report = await analyzeQuality(
      baseConfig({ fetchImpl: sonarFetch({ gate: 'WARN', measures: GOOD_MEASURES }) }),
    );

    expect(report.status).toBe('warning');
    expect(report.reasons).toContain('Quality Gate en estado WARN');
  });

  test('devuelve failed cuando la cobertura no alcanza el umbral', async () => {
    const report = await analyzeQuality(
      baseConfig({
        fetchImpl: sonarFetch({
          measures: [
            { metric: 'complexity', value: '10' },
            { metric: 'coverage', value: '50' },
            { metric: 'duplicated_lines_density', value: '1' },
          ],
        }),
      }),
    );

    expect(report.status).toBe('failed');
    expect(report.reasons).toContain('Cobertura 50% < mínimo 80%');
  });

  test('devuelve failed ante un error de credenciales sin filtrar el token', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({}, { ok: false, status: 401 }));
    const report = await analyzeQuality(baseConfig({ fetchImpl }));

    expect(report.status).toBe('failed');
    expect(report.reasons[0]).toContain('Credenciales de SonarQube inválidas');
    expect(JSON.stringify(report)).not.toContain(TOKEN);
  });

  test('trata el Quality Gate como no bloqueante si así se configura', async () => {
    const report = await analyzeQuality(
      baseConfig({
        fetchImpl: sonarFetch({ gate: 'ERROR', measures: GOOD_MEASURES }),
        qualityGateRequired: false,
      }),
    );

    expect(report.status).toBe('warning');
    expect(report.reasons).toContain('Quality Gate en estado ERROR (no bloqueante)');
  });

  test('incluye los issues normalizados en el reporte', async () => {
    const report = await analyzeQuality(
      baseConfig({
        fetchImpl: sonarFetch({
          measures: GOOD_MEASURES,
          issues: [
            {
              key: 'issue-1',
              rule: 'javascript:S1234',
              severity: 'MAJOR',
              type: 'CODE_SMELL',
              component: 'src/a.js',
              line: 7,
              message: 'Revisar complejidad',
            },
          ],
        }),
      }),
    );

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toMatchObject({
      key: 'issue-1',
      rule: 'javascript:S1234',
      severity: 'MAJOR',
      line: 7,
    });
  });
});
