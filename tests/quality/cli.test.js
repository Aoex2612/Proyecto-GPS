const { buildConfigFromEnv, parseBoolean, parseNumber, runCli } = require('../../src/quality/cli');
const { sonarFetch } = require('./helpers');

const TOKEN = 'secret-token';
const PROJECT_KEY = 'Aoex2612_Proyecto-GPS';

const GOOD_MEASURES = [
  { metric: 'complexity', value: '10' },
  { metric: 'coverage', value: '90' },
  { metric: 'duplicated_lines_density', value: '1' },
];

function baseEnv(overrides = {}) {
  return {
    SONAR_TOKEN: TOKEN,
    SONAR_PROJECT_KEY: PROJECT_KEY,
    ...overrides,
  };
}

describe('HU01-T4 - CLI del reporte de calidad', () => {
  describe('parseNumber y parseBoolean', () => {
    test('parsea números y aplica el valor por defecto', () => {
      expect(parseNumber('42', null)).toBe(42);
      expect(parseNumber('3.5', null)).toBe(3.5);
      expect(parseNumber('', 80)).toBe(80);
      expect(parseNumber('no-numero', 80)).toBe(80);
    });

    test('parsea booleanos con valores habituales', () => {
      expect(parseBoolean('true', false)).toBe(true);
      expect(parseBoolean('false', true)).toBe(false);
      expect(parseBoolean('0', true)).toBe(false);
      expect(parseBoolean('no', true)).toBe(false);
      expect(parseBoolean(undefined, true)).toBe(true);
    });
  });

  describe('buildConfigFromEnv', () => {
    test('aplica los valores por defecto', () => {
      const config = buildConfigFromEnv({});

      expect(config).toMatchObject({
        enabled: true,
        hostUrl: 'https://sonarcloud.io',
        thresholds: { minCoverage: 80, maxComplexity: null, maxDuplication: 3 },
        qualityGateRequired: true,
        failOnQualityGate: true,
      });
    });

    test('lee y convierte la configuración del entorno', () => {
      const config = buildConfigFromEnv({
        SONAR_ENABLED: 'false',
        SONAR_TOKEN: TOKEN,
        SONAR_HOST_URL: 'https://sonar.ejemplo.test',
        SONAR_PROJECT_KEY: PROJECT_KEY,
        SONAR_MIN_COVERAGE: '90',
        SONAR_MAX_COMPLEXITY: '15',
        SONAR_MAX_DUPLICATION: '2',
        SONAR_QUALITY_GATE_REQUIRED: 'false',
        SONAR_FAIL_ON_QUALITY_GATE: 'false',
      });

      expect(config).toMatchObject({
        enabled: false,
        token: TOKEN,
        hostUrl: 'https://sonar.ejemplo.test',
        projectKey: PROJECT_KEY,
        thresholds: { minCoverage: 90, maxComplexity: 15, maxDuplication: 2 },
        qualityGateRequired: false,
        failOnQualityGate: false,
      });
    });
  });

  describe('runCli', () => {
    test('escribe el reporte y devuelve código 0 cuando pasa', async () => {
      const writeFileImpl = jest.fn().mockResolvedValue(undefined);
      const result = await runCli({
        env: baseEnv({ SONAR_REPORT_PATH: 'out/quality-report.json' }),
        cwd: process.cwd(),
        fetchImpl: sonarFetch({ measures: GOOD_MEASURES }),
        writeFileImpl,
      });

      expect(result.exitCode).toBe(0);
      expect(result.report.status).toBe('passed');
      expect(writeFileImpl).toHaveBeenCalledTimes(1);

      const [filePath, content] = writeFileImpl.mock.calls[0];
      expect(filePath.endsWith('quality-report.json')).toBe(true);
      expect(JSON.parse(content)).toMatchObject({ status: 'passed', projectKey: PROJECT_KEY });
    });

    test('devuelve código 1 cuando falla y el fallo es bloqueante', async () => {
      const result = await runCli({
        env: baseEnv(),
        cwd: process.cwd(),
        fetchImpl: sonarFetch({ gate: 'ERROR', measures: GOOD_MEASURES }),
        writeFileImpl: jest.fn().mockResolvedValue(undefined),
      });

      expect(result.report.status).toBe('failed');
      expect(result.exitCode).toBe(1);
    });

    test('devuelve código 0 cuando falla pero el bloqueo está desactivado', async () => {
      const result = await runCli({
        env: baseEnv({ SONAR_FAIL_ON_QUALITY_GATE: 'false' }),
        cwd: process.cwd(),
        fetchImpl: sonarFetch({ gate: 'ERROR', measures: GOOD_MEASURES }),
        writeFileImpl: jest.fn().mockResolvedValue(undefined),
      });

      expect(result.report.status).toBe('failed');
      expect(result.exitCode).toBe(0);
    });

    test('devuelve skipped y código 0 si no hay token', async () => {
      const result = await runCli({
        env: { SONAR_PROJECT_KEY: PROJECT_KEY },
        cwd: process.cwd(),
        fetchImpl: jest.fn(),
        writeFileImpl: jest.fn().mockResolvedValue(undefined),
      });

      expect(result.report.status).toBe('skipped');
      expect(result.exitCode).toBe(0);
    });
  });
});
