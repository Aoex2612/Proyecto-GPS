const {
  ProcessType,
  UPLOAD_PROCESSES,
  getProcessesByPhase,
  getProcess,
  validateAgainstTriggerEvents,
  getUploadSummary,
} = require('../../src/pipeline/upload-processes');
const { DeliveryPhase } = require('../../src/pipeline/phases');

describe('HU01-T2 - Procesos implicados en la subida', () => {
  // ────────────────────────────────────────────────────────────────────────
  // Integridad del catálogo
  // ────────────────────────────────────────────────────────────────────────

  test('el catálogo de procesos es inmutable en todos sus niveles', () => {
    expect(Object.isFrozen(UPLOAD_PROCESSES)).toBe(true);
    expect(Object.isFrozen(UPLOAD_PROCESSES[0])).toBe(true);
  });

  test('cada proceso tiene los campos obligatorios del contrato', () => {
    for (const process of UPLOAD_PROCESSES) {
      expect(process).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          phase: expect.any(String),
          type: expect.any(String),
          description: expect.any(String),
          order: expect.any(Number),
          required: expect.any(Boolean),
        }),
      );
    }
  });

  test('los identificadores de proceso son únicos', () => {
    const ids = UPLOAD_PROCESSES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('los órdenes de proceso son únicos y en secuencia ascendente', () => {
    const orders = UPLOAD_PROCESSES.map((p) => p.order);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]).toBeGreaterThan(orders[i - 1]);
    }
  });

  test('todos los procesos pertenecen a una fase válida del contrato de T1', () => {
    const validPhases = Object.values(DeliveryPhase);
    for (const process of UPLOAD_PROCESSES) {
      expect(validPhases).toContain(process.phase);
    }
  });

  test('todos los tipos de proceso pertenecen a ProcessType', () => {
    const validTypes = Object.values(ProcessType);
    for (const process of UPLOAD_PROCESSES) {
      expect(validTypes).toContain(process.type);
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Fase: development — comandos git locales
  // ────────────────────────────────────────────────────────────────────────

  test('identifica los comandos git de la fase development (previos a la subida)', () => {
    const devProcesses = getProcessesByPhase(DeliveryPhase.DEVELOPMENT);
    const ids = devProcesses.map((p) => p.id);
    expect(ids).toContain('git-add');
    expect(ids).toContain('git-commit');
  });

  test('git-commit está en development porque genera los metadatos de autoría', () => {
    const gitCommit = getProcess('git-commit');
    expect(gitCommit.phase).toBe(DeliveryPhase.DEVELOPMENT);
    expect(gitCommit.type).toBe(ProcessType.GIT_COMMAND);
    expect(gitCommit.required).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Fase: push — publicación en el remoto
  // ────────────────────────────────────────────────────────────────────────

  test('identifica el comando git push en la fase push', () => {
    const gitPush = getProcess('git-push');
    expect(gitPush.phase).toBe(DeliveryPhase.PUSH);
    expect(gitPush.type).toBe(ProcessType.GIT_COMMAND);
    expect(gitPush.required).toBe(true);
  });

  test('el push a ramas protegidas está en la fase push y no es obligatorio', () => {
    const pushProtected = getProcess('push-to-protected');
    expect(pushProtected.phase).toBe(DeliveryPhase.PUSH);
    expect(pushProtected.required).toBe(false);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Fase: pull_request — eventos de GitHub
  // ────────────────────────────────────────────────────────────────────────

  test('identifica los cuatro eventos de GitHub en la fase pull_request', () => {
    const prProcesses = getProcessesByPhase(DeliveryPhase.PULL_REQUEST);
    const ids = prProcesses.map((p) => p.id);
    expect(ids).toContain('pr-open');
    expect(ids).toContain('pr-synchronize');
    expect(ids).toContain('pr-reopen');
    expect(ids).toContain('pr-ready-for-review');
  });

  test('la apertura de PR (pr-open) es obligatoria', () => {
    const prOpen = getProcess('pr-open');
    expect(prOpen.required).toBe(true);
    expect(prOpen.eventType).toBe('opened');
  });

  test('synchronize, reopen y ready_for_review no son obligatorios', () => {
    expect(getProcess('pr-synchronize').required).toBe(false);
    expect(getProcess('pr-reopen').required).toBe(false);
    expect(getProcess('pr-ready-for-review').required).toBe(false);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Acción CI — lo que T5 consumirá
  // ────────────────────────────────────────────────────────────────────────

  test('identifica la acción CI disparada por los eventos de PR', () => {
    const ciTrigger = getProcess('ci-trigger');
    expect(ciTrigger.type).toBe(ProcessType.CI_ACTION);
    expect(ciTrigger.required).toBe(true);
    expect(ciTrigger.phase).toBe(DeliveryPhase.PULL_REQUEST);
  });

  test('la acción CI referencia exactamente los cuatro eventos que la disparan', () => {
    const ciTrigger = getProcess('ci-trigger');
    expect(ciTrigger.triggeredBy).toEqual(
      expect.arrayContaining(['pr-open', 'pr-synchronize', 'pr-reopen', 'pr-ready-for-review']),
    );
    expect(ciTrigger.triggeredBy).toHaveLength(4);
  });

  // ────────────────────────────────────────────────────────────────────────
  // getProcess
  // ────────────────────────────────────────────────────────────────────────

  test('getProcess devuelve null para un id inexistente', () => {
    expect(getProcess('proceso-inexistente')).toBeNull();
  });

  // ────────────────────────────────────────────────────────────────────────
  // Coherencia con el contrato de T1 (TRIGGER_EVENTS)
  // ────────────────────────────────────────────────────────────────────────

  test('los eventos catalogados son coherentes con TRIGGER_EVENTS de T1', () => {
    const validation = validateAgainstTriggerEvents();
    expect(validation.valid).toBe(true);
    expect(validation.missingEvents).toEqual([]);
    expect(validation.extraEvents).toEqual([]);
  });

  // ────────────────────────────────────────────────────────────────────────
  // getUploadSummary — agrupación por fase para T5
  // ────────────────────────────────────────────────────────────────────────

  test('getUploadSummary agrupa los procesos en las tres fases de subida', () => {
    const summary = getUploadSummary();
    expect(summary).toHaveLength(3);
    expect(summary[0].phase.id).toBe(DeliveryPhase.DEVELOPMENT);
    expect(summary[1].phase.id).toBe(DeliveryPhase.PUSH);
    expect(summary[2].phase.id).toBe(DeliveryPhase.PULL_REQUEST);
  });

  test('getUploadSummary incluye los procesos de cada fase', () => {
    const summary = getUploadSummary();
    const devIds = summary[0].processes.map((p) => p.id);
    const pushIds = summary[1].processes.map((p) => p.id);
    const prIds = summary[2].processes.map((p) => p.id);

    expect(devIds).toContain('git-add');
    expect(devIds).toContain('git-commit');
    expect(pushIds).toContain('git-push');
    expect(prIds).toContain('pr-open');
    expect(prIds).toContain('ci-trigger');
  });
});
