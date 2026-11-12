jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  getInput: jest.fn(),
  setOutput: jest.fn(),
  setFailed: jest.fn(),
}));

jest.mock('../../src/quality', () => ({
  analyzeQuality: jest.fn(),
}));

const core = require('@actions/core');
const { analyzeQuality } = require('../../src/quality');
const { run } = require('../../src/index');

/**
 * Configura los inputs simulados de la Action.
 * @param {object} [overrides]
 */
function mockInputs(overrides = {}) {
  const inputs = {
    'github-token': 'github-token',
    'sonar-enabled': 'true',
    'sonar-token': 'sonar-token',
    'sonar-project-key': 'Aoex2612_Proyecto-GPS',
    ...overrides,
  };
  core.getInput.mockImplementation((name) => inputs[name] || '');
}

describe('HU01-T4 - Integración en la GitHub Action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInputs();
  });

  test('publica el estado de calidad cuando el análisis pasa', async () => {
    const report = { status: 'passed', reasons: [] };
    analyzeQuality.mockResolvedValue(report);

    await run();

    expect(core.setOutput).toHaveBeenCalledWith('quality-status', 'passed');
    expect(core.setOutput).toHaveBeenCalledWith('quality-summary', JSON.stringify(report));
    expect(core.setOutput).toHaveBeenCalledWith('review-status', 'passed');
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  test('falla la Action cuando el Quality Gate falla y el bloqueo está activo', async () => {
    analyzeQuality.mockResolvedValue({
      status: 'failed',
      reasons: ['Cobertura 50% < mínimo 80%'],
    });

    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('El Quality Gate de SonarCloud ha fallado'),
    );
  });

  test('no falla la Action si el bloqueo está desactivado', async () => {
    mockInputs({ 'fail-on-quality-gate': 'false' });
    analyzeQuality.mockResolvedValue({ status: 'failed', reasons: [] });

    await run();

    expect(core.setFailed).not.toHaveBeenCalled();
  });

  test('degrada a skipped si el análisis lanza una excepción inesperada', async () => {
    analyzeQuality.mockRejectedValue(new Error('fallo inesperado'));

    await run();

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('No se pudo ejecutar el análisis de calidad'),
    );
    expect(core.setOutput).toHaveBeenCalledWith('quality-status', 'skipped');
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  test('mantiene review-status en pending si Sonar está deshabilitado', async () => {
    mockInputs({ 'sonar-enabled': 'false' });
    analyzeQuality.mockResolvedValue({ status: 'skipped', reasons: ['deshabilitado'] });

    await run();

    expect(core.setOutput).toHaveBeenCalledWith('review-status', 'pending');
  });
});
