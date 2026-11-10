const {
  DEFAULT_THRESHOLDS,
  normalizeMeasures,
  normalizeIssue,
  evaluateQuality,
} = require('../../src/quality/quality-evaluator');

describe('HU01-T4 - Evaluador de calidad', () => {
  describe('normalizeMeasures', () => {
    test('convierte las medidas de Sonar a un objeto normalizado', () => {
      const metrics = normalizeMeasures([
        { metric: 'complexity', value: '42' },
        { metric: 'cognitive_complexity', value: '18' },
        { metric: 'coverage', value: '87.5' },
        { metric: 'line_coverage', value: '88.1' },
        { metric: 'branch_coverage', value: '75' },
        { metric: 'duplicated_lines_density', value: '1.2' },
        { metric: 'code_smells', value: '3' },
        { metric: 'bugs', value: '0' },
        { metric: 'vulnerabilities', value: '0' },
        { metric: 'security_hotspots', value: '1' },
        { metric: 'sqale_index', value: '45' },
        { metric: 'sqale_rating', value: '1.0' },
        { metric: 'reliability_rating', value: '1.0' },
        { metric: 'security_rating', value: '1.0' },
        { metric: 'ncloc', value: '1234' },
        { metric: 'files', value: '12' },
      ]);

      expect(metrics).toEqual({
        complexity: 42,
        cognitiveComplexity: 18,
        coverage: 87.5,
        lineCoverage: 88.1,
        branchCoverage: 75,
        duplication: 1.2,
        codeSmells: 3,
        bugs: 0,
        vulnerabilities: 0,
        securityHotspots: 1,
        technicalDebtMinutes: 45,
        maintainabilityRating: '1.0',
        reliabilityRating: '1.0',
        securityRating: '1.0',
        ncloc: 1234,
        files: 12,
      });
    });

    test('ignora métricas desconocidas y convierte valores no numéricos en null', () => {
      const metrics = normalizeMeasures([
        { metric: 'desconocida', value: 'x' },
        { metric: 'complexity', value: 'no-es-un-numero' },
      ]);

      expect(metrics).toEqual({ complexity: null });
    });

    test('tolera entradas vacías o ausentes', () => {
      expect(normalizeMeasures()).toEqual({});
      expect(normalizeMeasures([])).toEqual({});
    });
  });

  describe('normalizeIssue', () => {
    test('normaliza un issue de Sonar al formato del reporte', () => {
      expect(
        normalizeIssue({
          key: 'issue-1',
          rule: 'javascript:S1234',
          severity: 'MAJOR',
          type: 'CODE_SMELL',
          component: 'src/quality/sonar-client.js',
          line: 10,
          message: 'Complejidad excesiva',
          effort: '5min',
          status: 'OPEN',
        }),
      ).toEqual({
        key: 'issue-1',
        rule: 'javascript:S1234',
        severity: 'MAJOR',
        type: 'CODE_SMELL',
        component: 'src/quality/sonar-client.js',
        line: 10,
        message: 'Complejidad excesiva',
        effort: '5min',
        status: 'OPEN',
      });
    });

    test('usa valores nulos cuando el issue no trae línea o esfuerzo', () => {
      const issue = normalizeIssue({ key: 'k', rule: 'r', severity: 'MINOR', type: 'BUG' });

      expect(issue.line).toBeNull();
      expect(issue.effort).toBeNull();
      expect(issue.status).toBeNull();
    });
  });

  describe('evaluateQuality', () => {
    test('expone umbrales por defecto inmutables', () => {
      expect(DEFAULT_THRESHOLDS).toEqual({
        minCoverage: 80,
        maxComplexity: null,
        maxDuplication: 3,
      });
      expect(Object.isFrozen(DEFAULT_THRESHOLDS)).toBe(true);
    });

    test('devuelve passed con Quality Gate OK y umbrales cumplidos', () => {
      const report = evaluateQuality({
        qualityGate: 'OK',
        metrics: { coverage: 90, complexity: 10, duplication: 1 },
        thresholds: { minCoverage: 80, maxComplexity: 20, maxDuplication: 3 },
        projectKey: 'Aoex2612_Proyecto-GPS',
      });

      expect(report.status).toBe('passed');
      expect(report.qualityGate).toBe('OK');
      expect(report.source).toBe('sonarqube');
      expect(report.projectKey).toBe('Aoex2612_Proyecto-GPS');
      expect(report.reasons).toEqual([]);
      expect(report.thresholds).toEqual({
        minCoverage: 80,
        maxComplexity: 20,
        maxDuplication: 3,
      });
    });

    test('devuelve failed con Quality Gate ERROR', () => {
      const report = evaluateQuality({ qualityGate: 'ERROR', metrics: { coverage: 90 } });

      expect(report.status).toBe('failed');
      expect(report.reasons).toContain('Quality Gate en estado ERROR');
    });

    test('devuelve warning con Quality Gate WARN', () => {
      const report = evaluateQuality({ qualityGate: 'WARN', metrics: { coverage: 90 } });

      expect(report.status).toBe('warning');
      expect(report.reasons).toContain('Quality Gate en estado WARN');
    });

    test('devuelve failed si la cobertura no llega al mínimo', () => {
      const report = evaluateQuality({
        qualityGate: 'OK',
        metrics: { coverage: 70, complexity: 10, duplication: 1 },
        thresholds: { minCoverage: 80 },
      });

      expect(report.status).toBe('failed');
      expect(report.reasons).toContain('Cobertura 70% < mínimo 80%');
    });

    test('devuelve failed si la complejidad supera el máximo', () => {
      const report = evaluateQuality({
        qualityGate: 'OK',
        metrics: { coverage: 90, complexity: 30, duplication: 1 },
        thresholds: { maxComplexity: 20 },
      });

      expect(report.status).toBe('failed');
      expect(report.reasons).toContain('Complejidad 30 > máximo 20');
    });

    test('devuelve failed si la duplicación supera el máximo', () => {
      const report = evaluateQuality({
        qualityGate: 'OK',
        metrics: { coverage: 90, complexity: 10, duplication: 5 },
        thresholds: { maxDuplication: 3 },
      });

      expect(report.status).toBe('failed');
      expect(report.reasons).toContain('Duplicación 5% > máximo 3%');
    });

    test('devuelve warning si faltan métricas necesarias para evaluar umbrales', () => {
      const report = evaluateQuality({
        qualityGate: 'OK',
        metrics: { complexity: 10, duplication: 1 },
        thresholds: { minCoverage: 80 },
      });

      expect(report.status).toBe('warning');
      expect(report.reasons).toContain('Métricas no disponibles: cobertura');
    });

    test('devuelve skipped si no hay Quality Gate ni métricas', () => {
      const report = evaluateQuality({
        qualityGate: 'NONE',
        metrics: {},
        thresholds: { minCoverage: null, maxComplexity: null, maxDuplication: null },
      });

      expect(report.status).toBe('skipped');
    });

    test('devuelve failed ante un error de consulta', () => {
      const report = evaluateQuality({ error: new Error('servicio no disponible') });

      expect(report.status).toBe('failed');
      expect(report.reasons).toContain('Error al consultar SonarQube: servicio no disponible');
    });

    test('trata el Quality Gate ERROR como warning si no es obligatorio', () => {
      const report = evaluateQuality({
        qualityGate: 'ERROR',
        metrics: { coverage: 90, complexity: 10, duplication: 1 },
        thresholds: { minCoverage: 80, maxComplexity: 20, maxDuplication: 3 },
        qualityGateRequired: false,
      });

      expect(report.status).toBe('warning');
      expect(report.reasons).toContain('Quality Gate en estado ERROR (no bloqueante)');
    });

    test('normaliza los issues incluidos en el reporte', () => {
      const report = evaluateQuality({
        qualityGate: 'OK',
        metrics: { coverage: 90, complexity: 10, duplication: 1 },
        issues: [
          {
            key: 'issue-1',
            rule: 'javascript:S1234',
            severity: 'MAJOR',
            type: 'CODE_SMELL',
            component: 'src/a.js',
            line: 3,
            message: 'm',
          },
        ],
      });

      expect(report.issues).toHaveLength(1);
      expect(report.issues[0]).toMatchObject({
        key: 'issue-1',
        rule: 'javascript:S1234',
        severity: 'MAJOR',
        line: 3,
      });
    });
  });
});
