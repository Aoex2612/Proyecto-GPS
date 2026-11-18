/**
 * Tests unitarios y de verificación para HU01-T07:
 * Verificar que el proceso cumple con lo demandado por el programador
 *
 * Responsable asignado en Sprint 1: Pablo García Gómez (PG)
 * Revisor asignado (matriz P4): Alejandro Jesús Ortiz Zamora (AZ)
 *
 * Ciclo TDD - Cobertura exhaustiva de branches y líneas
 */

const {
  verifyProgrammerDemands,
  evaluateCriterion1_AutomaticTrigger,
  evaluateCriterion2_UnattendedAuthorship,
  evaluateCriterion3_ExecutionTiming,
  evaluateCriterion4_ClearNotification,
  VerificationStatus,
} = require('../../src/pipeline/process-verifier');

const pipelineFacade = require('../../src/pipeline/index');
const { DeliveryPhase } = require('../../src/pipeline/phases');

describe('HU01-T07 - Verificar que el proceso cumple con lo demandado por el programador', () => {
  const sampleDeliveryContext = {
    repository: 'Aoex2612/Proyecto-GPS',
    pullRequest: 19,
    baseBranch: 'develop',
    headBranch: 'HU01-T06-seleccion-reportes-autoria',
    commitSha: '6fab4621b712',
  };

  const sampleAuthorshipReport = {
    human: 2,
    aiAssisted: 1,
    unknown: 0,
    total: 3,
    percentage: { human: 66.7, aiAssisted: 33.3, unknown: 0 },
    lines: { human: 120, aiAssisted: 30, unknown: 0, total: 150 },
  };

  const successfulCiReport = {
    delivery: sampleDeliveryContext,
    status: 'passed',
    timing: {
      startedAt: '2026-11-18T10:00:00.000Z',
      completedAt: '2026-11-18T10:00:45.000Z',
      durationMs: 45000,
      budgetMs: 600000,
    },
    trigger: {
      event: 'pull_request',
      action: 'opened',
      valid: true,
      automated: true,
    },
    phases: [
      { id: DeliveryPhase.PULL_REQUEST, status: 'passed', automated: true },
      { id: DeliveryPhase.ANALYSIS, status: 'passed', automated: true },
      { id: DeliveryPhase.REPORTING, status: 'passed', automated: true },
    ],
    tasks: [
      { id: 'verify-trigger', status: 'passed', durationMs: 250 },
      { id: 'assemble-delivery', status: 'passed', durationMs: 150 },
      { id: 'analyze-authorship', status: 'passed', durationMs: 1200 },
      { id: 'analyze-quality', status: 'passed', durationMs: 3500 },
      { id: 'publish-report', status: 'passed', durationMs: 800 },
      { id: 'publish-status', status: 'passed', durationMs: 400 },
    ],
    authorship: sampleAuthorshipReport,
    notification: {
      published: true,
      commentId: 98765,
      statusCheck: 'success',
      notified: true,
    },
  };

  // --------------------------------------------------------------------------
  // FACHADA
  // --------------------------------------------------------------------------
  test('la fachada src/pipeline/index.js expone las utilidades del verificador', () => {
    expect(typeof pipelineFacade.verifyProgrammerDemands).toBe('function');
    expect(pipelineFacade.VerificationStatus).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // 1. CRITERIO 1: INICIO AUTOMÁTICO ANTE NUEVA ENTREGA
  // --------------------------------------------------------------------------
  describe('Criterio 1: Inicio automático ante entregas o actualizaciones', () => {
    test('cumple cuando el evento es un disparador automático admitido (pull_request opened)', () => {
      const evaluation = evaluateCriterion1_AutomaticTrigger({
        event: 'pull_request',
        action: 'opened',
        branch: 'develop',
      });

      expect(evaluation.satisfied).toBe(true);
      expect(evaluation.automated).toBe(true);
      expect(evaluation.criterion).toContain('Inicio automático');
    });

    test('cumple ante sincronización de commits en una PR (synchronize)', () => {
      const evaluation = evaluateCriterion1_AutomaticTrigger({
        event: 'pull_request',
        action: 'synchronize',
        branch: 'develop',
      });

      expect(evaluation.satisfied).toBe(true);
      expect(evaluation.automated).toBe(true);
    });

    test('cumple ante evento push en rama admitida', () => {
      const evaluation = evaluateCriterion1_AutomaticTrigger({
        event: 'push',
        branch: 'main',
      });

      expect(evaluation.satisfied).toBe(true);
      expect(evaluation.automated).toBe(true);
    });

    test('falla cuando el evento requiere disparo manual o no está soportado', () => {
      const evaluation = evaluateCriterion1_AutomaticTrigger({
        event: 'workflow_dispatch',
        automated: false,
      });

      expect(evaluation.satisfied).toBe(false);
      expect(evaluation.reasons).toContain(
        'El evento no se inició de forma desatendida mediante pull_request o push.',
      );
    });

    test('falla si la acción no está entre los types válidos o la rama no está admitida', () => {
      const evalAction = evaluateCriterion1_AutomaticTrigger({
        event: 'pull_request',
        action: 'closed',
        branch: 'develop',
      });
      expect(evalAction.satisfied).toBe(false);

      const evalBranch = evaluateCriterion1_AutomaticTrigger({
        event: 'pull_request',
        action: 'opened',
        branch: 'feature-unsupported',
      });
      expect(evalBranch.satisfied).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 2. CRITERIO 2: EVALUACIÓN DE CAMBIOS Y METADATOS SIN INTERVENCIÓN MANUAL
  // --------------------------------------------------------------------------
  describe('Criterio 2: Evaluación desatendida de metadatos y cambios', () => {
    test('cumple cuando la autoría y los metadatos se resuelven en memoria sin prompts ni pausas', () => {
      const evaluation = evaluateCriterion2_UnattendedAuthorship({
        authorship: sampleAuthorshipReport,
        manualInterventionRequired: false,
        tasksExecuted: ['assemble-delivery', 'analyze-authorship'],
      });

      expect(evaluation.satisfied).toBe(true);
      expect(evaluation.interactive).toBe(false);
      expect(evaluation.evaluatedCommits).toBe(3);
    });

    test('falla si se detecta que alguna tarea requirió intervención del programador', () => {
      const evaluation = evaluateCriterion2_UnattendedAuthorship({
        authorship: null,
        manualInterventionRequired: true,
        tasksExecuted: [],
      });

      expect(evaluation.satisfied).toBe(false);
      expect(evaluation.reasons).toContain(
        'La evaluación requirió interacción manual o no completó el análisis de metadatos.',
      );
    });
  });

  // --------------------------------------------------------------------------
  // 3. CRITERIO 3: LÍMITES DE TIEMPO ACEPTABLES DEL FLUJO
  // --------------------------------------------------------------------------
  describe('Criterio 3: Finalización dentro de los límites de tiempo aceptables', () => {
    test('cumple cuando el tiempo de ejecución está dentro del presupuesto (< 10 minutos)', () => {
      const evaluation = evaluateCriterion3_ExecutionTiming({
        durationMs: 45000,
        budgetMs: 600000,
      });

      expect(evaluation.satisfied).toBe(true);
      expect(evaluation.durationSeconds).toBe(45);
      expect(evaluation.acceptable).toBe(true);
    });

    test('falla si la duración excede el presupuesto máximo tolerable o es negativa/inválida', () => {
      const evaluation = evaluateCriterion3_ExecutionTiming({
        durationMs: 650000,
        budgetMs: 600000,
      });

      expect(evaluation.satisfied).toBe(false);
      expect(evaluation.reasons[0]).toContain('Tiempo de ejecución excedido');

      const evalNegative = evaluateCriterion3_ExecutionTiming({ durationMs: -10 });
      expect(evalNegative.satisfied).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 4. CRITERIO 4: NOTIFICACIÓN CLARA DEL ESTADO SIN BLOQUEOS
  // --------------------------------------------------------------------------
  describe('Criterio 4: Notificación del estado para continuar sin bloqueos', () => {
    test('cumple cuando se publica comentario o status check con el dictamen explícito', () => {
      const evaluation = evaluateCriterion4_ClearNotification({
        published: true,
        statusCheck: 'success',
        status: 'passed',
      });

      expect(evaluation.satisfied).toBe(true);
      expect(evaluation.canDeveloperProceed).toBe(true);
    });

    test('notifica correctamente cuando se requiere revisión (review_required) sin quedar silencioso', () => {
      const evaluation = evaluateCriterion4_ClearNotification({
        published: true,
        statusCheck: 'failure',
        status: 'review_required',
      });

      expect(evaluation.satisfied).toBe(true);
      expect(evaluation.canDeveloperProceed).toBe(false);
      expect(evaluation.requiresAudit).toBe(true);
    });

    test('falla si la notificación nunca se emite dejando al desarrollador a ciegas', () => {
      const evaluation = evaluateCriterion4_ClearNotification({
        published: false,
        statusCheck: null,
      });

      expect(evaluation.satisfied).toBe(false);
      expect(evaluation.reasons).toContain(
        'El sistema no notificó el estado del análisis al desarrollador.',
      );
    });
  });

  // --------------------------------------------------------------------------
  // 5. AUDITORÍA INTEGRAL DE EXTREMO A EXTREMO (verifyProgrammerDemands)
  // --------------------------------------------------------------------------
  describe('verifyProgrammerDemands (Evaluación global de HU01)', () => {
    test('dictamina CUMPLIMIENTO TOTAL cuando los 4 criterios de aceptación son superados', () => {
      const audit = verifyProgrammerDemands(successfulCiReport);

      expect(audit.status).toBe(VerificationStatus.SATISFIED);
      expect(audit.passedCriteriaCount).toBe(4);
      expect(audit.totalCriteriaCount).toBe(4);
      expect(audit.compliancePercentage).toBe(100.0);
      expect(audit.allCriteriaSatisfied).toBe(true);
      expect(audit.summary).toContain('criterios de aceptación de HU01 están verificados');
    });

    test('calcula timing a partir de startedAt y completedAt cuando durationMs no viene dado', () => {
      const reportWithoutDuration = {
        ...successfulCiReport,
        timing: {
          startedAt: '2026-11-18T10:00:00.000Z',
          completedAt: '2026-11-18T10:00:30.000Z',
        },
      };
      const audit = verifyProgrammerDemands(reportWithoutDuration);
      expect(audit.criteria.criterion3_executionTiming.durationSeconds).toBe(30);
    });

    test('deduce el statusCheck en Criterio 4 cuando notification.published es true y ciReport.status es review_required', () => {
      const reportReview = {
        ...successfulCiReport,
        status: 'review_required',
        notification: { published: true },
      };
      const audit = verifyProgrammerDemands(reportReview);
      expect(audit.criteria.criterion4_clearNotification.statusCheck).toBe('failure');
    });

    test('genera informe Markdown formateado para auditoría de entrega', () => {
      const audit = verifyProgrammerDemands(successfulCiReport);

      expect(audit.markdown).toContain('## 📋 Verificación de Criterios de Aceptación (HU01)');
      expect(audit.markdown).toContain('Criterio 1: Inicio automático');
      expect(audit.markdown).toContain('✅ Superado');
      expect(audit.markdown).toContain('Criterio 2: Evaluación desatendida');
      expect(audit.markdown).toContain('Criterio 3: Tiempos de ejecución');
      expect(audit.markdown).toContain('Criterio 4: Notificación del estado');
      expect(audit.markdown).toContain('100%');
    });

    test('identifica incumplimientos parciales e indica acciones correctivas', () => {
      const defectiveCiReport = {
        ...successfulCiReport,
        timing: { durationMs: 700000, budgetMs: 600000 },
        notification: { published: false, notified: false },
      };

      const audit = verifyProgrammerDemands(defectiveCiReport);

      expect(audit.status).toBe(VerificationStatus.PARTIALLY_SATISFIED);
      expect(audit.passedCriteriaCount).toBe(2);
      expect(audit.compliancePercentage).toBe(50.0);
      expect(audit.unmetCriteria.length).toBe(2);
      expect(audit.allCriteriaSatisfied).toBe(false);
    });

    test('dictamina NON_COMPLIANT si ningún criterio es satisfecho', () => {
      const totallyFailedReport = {
        trigger: { automated: false, event: 'manual' },
        authorship: null,
        timing: { durationMs: -1 },
        notification: { published: false, statusCheck: null },
      };

      const audit = verifyProgrammerDemands(totallyFailedReport);
      expect(audit.status).toBe(VerificationStatus.NON_COMPLIANT);
      expect(audit.passedCriteriaCount).toBe(0);
    });
  });
});
