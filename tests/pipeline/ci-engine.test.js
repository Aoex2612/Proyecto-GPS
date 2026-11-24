const {
  LifecycleTask,
  TaskStatus,
  LIFECYCLE_TASKS,
  buildLifecyclePlan,
  createContractHandlers,
  getTasksByPhase,
  resolveTrigger,
  runLifecycle,
} = require('../../src/pipeline/ci-engine');
const { DeliveryPhase, DELIVERY_PHASES } = require('../../src/pipeline/phases');
const { validateAgainstTriggerEvents } = require('../../src/pipeline/upload-processes');

/**
 * Construye un mapa de handlers que registra el orden de ejecución.
 * @param {object} [overrides]
 * @returns {{ handlers: object, calls: string[] }}
 */
function createRecordingHandlers(overrides = {}) {
  const calls = [];
  const handlers = {};

  for (const task of LIFECYCLE_TASKS) {
    handlers[task.id] = async () => {
      calls.push(task.id);
      const override = overrides[task.id];
      return typeof override === 'function' ? override() : { task: task.id };
    };
  }

  return { handlers, calls };
}

describe('HU01-T5 - Motor de integración continua', () => {
  // ────────────────────────────────────────────────────────────────────────
  // Catálogo de tareas
  // ────────────────────────────────────────────────────────────────────────

  describe('catálogo de tareas del ciclo de vida', () => {
    test('es inmutable en todos sus niveles', () => {
      expect(Object.isFrozen(LIFECYCLE_TASKS)).toBe(true);
      expect(Object.isFrozen(LIFECYCLE_TASKS[0])).toBe(true);
    });

    test('cada tarea tiene el contrato mínimo y un timeout positivo', () => {
      for (const task of LIFECYCLE_TASKS) {
        expect(task).toEqual(
          expect.objectContaining({
            id: expect.any(String),
            phase: expect.any(String),
            order: expect.any(Number),
            name: expect.any(String),
            description: expect.any(String),
            blocking: expect.any(Boolean),
          }),
        );
        expect(task.timeoutMs).toBeGreaterThan(0);
      }
    });

    test('los identificadores y órdenes son únicos y ascendentes', () => {
      const ids = LIFECYCLE_TASKS.map((task) => task.id);
      const orders = LIFECYCLE_TASKS.map((task) => task.order);

      expect(new Set(ids).size).toBe(ids.length);
      expect(orders).toEqual([...orders].sort((left, right) => left - right));
    });

    test('solo usa fases automáticas del contrato de T1', () => {
      const automated = DELIVERY_PHASES.filter((phase) => phase.automated).map((phase) => phase.id);
      for (const task of LIFECYCLE_TASKS) {
        expect(automated).toContain(task.phase);
      }
    });

    test('cubre las tres fases automáticas y respeta su orden', () => {
      expect(getTasksByPhase(DeliveryPhase.PULL_REQUEST).map((task) => task.id)).toEqual([
        LifecycleTask.VERIFY_TRIGGER,
        LifecycleTask.ASSEMBLE_DELIVERY,
      ]);
      expect(getTasksByPhase(DeliveryPhase.ANALYSIS).map((task) => task.id)).toEqual([
        LifecycleTask.ANALYZE_AUTHORSHIP,
        LifecycleTask.ANALYZE_QUALITY,
      ]);
      expect(getTasksByPhase(DeliveryPhase.REPORTING).map((task) => task.id)).toEqual([
        LifecycleTask.PUBLISH_REPORT,
        LifecycleTask.PUBLISH_STATUS,
      ]);
      expect(getTasksByPhase(DeliveryPhase.DEVELOPMENT)).toEqual([]);
    });

    test('el catálogo de procesos es coherente con TRIGGER_EVENTS', () => {
      expect(validateAgainstTriggerEvents()).toEqual({
        valid: true,
        missingEvents: [],
        extraEvents: [],
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Planificación y triggers
  // ────────────────────────────────────────────────────────────────────────

  describe('planificación de la entrega', () => {
    test('acepta una PR abierta contra develop y planifica las fases automáticas', () => {
      const plan = buildLifecyclePlan({
        eventName: 'pull_request',
        eventAction: 'opened',
        baseBranch: 'develop',
        headBranch: 'HU01-T05-motor-integracion-continua',
      });

      expect(plan.valid).toBe(true);
      expect(plan.allowed).toBe(true);
      expect(plan.event).toEqual({
        name: 'pull_request',
        action: 'opened',
        branch: 'develop',
        headBranch: 'HU01-T05-motor-integracion-continua',
      });
      expect(plan.phases.map((phase) => phase.id)).toEqual(DELIVERY_PHASES.map((p) => p.id));
      expect(
        plan.phases.find((phase) => phase.id === DeliveryPhase.PULL_REQUEST).processes,
      ).toEqual(['pr-open', 'pr-synchronize', 'pr-reopen', 'pr-ready-for-review', 'ci-trigger']);

      const automated = plan.phases.filter((phase) => phase.automated);
      expect(automated.map((phase) => phase.status)).toEqual([
        TaskStatus.PENDING,
        TaskStatus.PENDING,
        TaskStatus.PENDING,
      ]);
      expect(
        automated.flatMap((phase) => phase.tasks).every((task) => task.status === 'pending'),
      ).toBe(true);
    });

    test('marca las fases manuales como omitidas y sin tareas', () => {
      const plan = buildLifecyclePlan();
      const manual = plan.phases.filter((phase) => !phase.automated);

      expect(manual).toHaveLength(4);
      for (const phase of manual) {
        expect(phase.status).toBe(TaskStatus.SKIPPED);
        expect(phase.reason).toContain('manual');
        expect(phase.tasks).toEqual([]);
      }
    });

    test('rechaza acciones de PR que no están en TRIGGER_EVENTS', () => {
      const plan = buildLifecyclePlan({ eventAction: 'closed' });

      expect(plan.valid).toBe(false);
      expect(plan.allowed).toBe(false);
      expect(plan.reason).toContain('pull_request.closed');
      expect(plan.phases.every((phase) => phase.status === TaskStatus.SKIPPED)).toBe(true);
    });

    test('rechaza ramas base fuera del contrato', () => {
      expect(
        buildLifecyclePlan({ eventAction: 'opened', baseBranch: 'feature/login' }).allowed,
      ).toBe(false);
      expect(resolveTrigger('pull_request', 'opened', 'release').allowed).toBe(false);
    });

    test('acepta push a develop y main, y rechaza otras ramas', () => {
      expect(buildLifecyclePlan({ eventName: 'push', baseBranch: 'develop' }).allowed).toBe(true);
      expect(buildLifecyclePlan({ eventName: 'push', baseBranch: 'main' }).allowed).toBe(true);
      expect(buildLifecyclePlan({ eventName: 'push', baseBranch: 'feature/x' }).allowed).toBe(
        false,
      );
    });

    test('rechaza eventos no contemplados', () => {
      const plan = buildLifecyclePlan({ eventName: 'workflow_dispatch' });

      expect(plan.valid).toBe(false);
      expect(plan.reason).toContain('workflow_dispatch');
      expect(resolveTrigger('schedule', 'cron', 'develop').allowed).toBe(false);
    });

    test('valida las transiciones consecutivas entre fases automáticas', () => {
      const plan = buildLifecyclePlan();

      expect(plan.transitions.valid).toBe(true);
      expect(plan.transitions.invalid).toEqual([]);
      expect(plan.contract).toEqual({ valid: true, missingEvents: [], extraEvents: [] });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Ejecución
  // ────────────────────────────────────────────────────────────────────────

  describe('ejecución del ciclo de vida', () => {
    test('ejecuta las tareas automáticas en el orden del contrato', async () => {
      const { handlers, calls } = createRecordingHandlers();
      const report = await runLifecycle({
        repository: 'equipo-uma/proyecto-gps',
        pullNumber: 42,
        headBranch: 'HU01-T05-motor-integracion-continua',
        handlers,
      });

      expect(calls).toEqual(LIFECYCLE_TASKS.map((task) => task.id));
      expect(report.summary.status).toBe(TaskStatus.PASSED);
      expect(report.phase).toBe(DeliveryPhase.REPORTING);
      expect(report.summary.tasks).toEqual({
        total: LIFECYCLE_TASKS.length,
        passed: LIFECYCLE_TASKS.length,
        warning: 0,
        failed: 0,
        skipped: 0,
      });
      expect(report.delivery).toEqual({
        repository: 'equipo-uma/proyecto-gps',
        pullRequest: 42,
        baseBranch: 'develop',
        headBranch: 'HU01-T05-motor-integracion-continua',
        commitSha: null,
      });
      expect(report.lifecycle.concurrencyGroup).toBe('ci-equipo-uma-proyecto-gps-pr-42');
      expect(report.summary.phases).toEqual({
        total: 7,
        automated: 3,
        executed: 3,
        failed: 0,
        skipped: 4,
      });
    });

    test('propaga los resultados de autoría y calidad al contrato de T1', async () => {
      const authorship = { authorship: { human: 2, aiAssisted: 1, unknown: 0 } };
      const quality = { status: 'passed', issues: [] };
      const { handlers } = createRecordingHandlers({
        [LifecycleTask.ANALYZE_AUTHORSHIP]: () => authorship,
        [LifecycleTask.ANALYZE_QUALITY]: () => quality,
      });

      const report = await runLifecycle({ repository: 'owner/repo', pullNumber: 7, handlers });

      expect(report.authorship).toEqual(authorship);
      expect(report.quality).toEqual(quality);
    });

    test('entrega null en autoría y skipped en calidad si no hay handlers', async () => {
      const report = await runLifecycle({ repository: 'owner/repo', pullNumber: 7 });

      expect(report.authorship).toBeNull();
      expect(report.quality.status).toBe(TaskStatus.SKIPPED);
      expect(report.quality.reasons[0]).toContain('no ejecutado');
      expect(report.summary.tasks.skipped).toBe(LIFECYCLE_TASKS.length);
      expect(report.summary.status).toBe(TaskStatus.SKIPPED);
    });

    test('pasa delivery, plan, outputs y logger a los handlers', async () => {
      const seen = [];
      const report = await runLifecycle({
        repository: 'owner/repo',
        pullNumber: 9,
        handlers: {
          [LifecycleTask.VERIFY_TRIGGER]: async (context) => {
            seen.push({ ...context, outputs: { ...context.outputs } });
            return { ok: true };
          },
        },
        logger: () => {},
      });

      expect(seen).toHaveLength(1);
      expect(seen[0].delivery.repository).toBe('owner/repo');
      expect(seen[0].plan.valid).toBe(true);
      expect(seen[0].event.action).toBe('opened');
      expect(seen[0].outputs).toEqual({});
      expect(report.summary.status).toBe(TaskStatus.PASSED);
      expect(report.summary.tasks.passed).toBe(1);
    });

    test('un fallo bloqueante detiene su fase pero permite publicar el resultado', async () => {
      const calls = [];
      const handlers = {
        [LifecycleTask.VERIFY_TRIGGER]: async () => {
          calls.push('verify');
        },
        [LifecycleTask.ASSEMBLE_DELIVERY]: async () => {
          calls.push('assemble');
        },
        [LifecycleTask.ANALYZE_AUTHORSHIP]: async () => {
          calls.push('authorship');
        },
        [LifecycleTask.ANALYZE_QUALITY]: async () => {
          calls.push('quality');
          throw new Error('Quality Gate en ERROR');
        },
        [LifecycleTask.PUBLISH_REPORT]: async () => {
          calls.push('report');
        },
        [LifecycleTask.PUBLISH_STATUS]: async () => {
          calls.push('status');
        },
      };

      const report = await runLifecycle({ repository: 'owner/repo', pullNumber: 3, handlers });
      const analysis = report.phases.find((phase) => phase.id === DeliveryPhase.ANALYSIS);
      const qualityTask = analysis.tasks.find((task) => task.id === LifecycleTask.ANALYZE_QUALITY);

      expect(calls).toEqual(['verify', 'assemble', 'authorship', 'quality', 'report', 'status']);
      expect(qualityTask.status).toBe(TaskStatus.FAILED);
      expect(qualityTask.error.message).toContain('Quality Gate');
      expect(analysis.status).toBe(TaskStatus.FAILED);
      expect(report.summary.status).toBe(TaskStatus.FAILED);
      expect(report.phase).toBe(DeliveryPhase.REPORTING);
    });

    test('un fallo no bloqueante deja aviso y continúa con la fase', async () => {
      const { handlers, calls } = createRecordingHandlers({
        [LifecycleTask.ANALYZE_AUTHORSHIP]: () => {
          throw new Error('API de commits no disponible');
        },
      });

      const report = await runLifecycle({ repository: 'owner/repo', pullNumber: 3, handlers });
      const authorshipTask = report.phases
        .flatMap((phase) => phase.tasks)
        .find((task) => task.id === LifecycleTask.ANALYZE_AUTHORSHIP);

      expect(authorshipTask.status).toBe(TaskStatus.WARNING);
      expect(calls).toContain(LifecycleTask.ANALYZE_QUALITY);
      expect(calls).toContain(LifecycleTask.PUBLISH_STATUS);
      expect(report.summary.tasks.warning).toBe(1);
      expect(report.summary.status).toBe(TaskStatus.WARNING);
    });

    test('no ejecuta handlers si el plan no es válido', async () => {
      const handlers = { [LifecycleTask.VERIFY_TRIGGER]: jest.fn() };
      const report = await runLifecycle({
        eventAction: 'closed',
        repository: 'owner/repo',
        pullNumber: 3,
        handlers,
      });

      expect(handlers[LifecycleTask.VERIFY_TRIGGER]).not.toHaveBeenCalled();
      expect(report.lifecycle.valid).toBe(false);
      expect(report.lifecycle.reason).toContain('pull_request.closed');
      expect(report.summary.status).toBe(TaskStatus.SKIPPED);
      expect(report.phase).toBeNull();
    });

    test('respeta el presupuesto global y omite el resto de tareas', async () => {
      const report = await runLifecycle({
        repository: 'owner/repo',
        pullNumber: 3,
        timeoutMs: 5,
        handlers: {
          [LifecycleTask.VERIFY_TRIGGER]: () => new Promise((resolve) => setTimeout(resolve, 40)),
        },
      });

      expect(report.lifecycle.timedOut).toBe(true);
      expect(report.summary.status).toBe(TaskStatus.FAILED);
      expect(report.summary.tasks.passed).toBe(0);
      expect(report.summary.tasks.skipped).toBeGreaterThan(0);
    });

    test('aplica el timeout por tarea sin agotar el presupuesto global', async () => {
      const plan = buildLifecyclePlan();
      const authorshipTask = plan.phases
        .flatMap((phase) => phase.tasks)
        .find((task) => task.id === LifecycleTask.ANALYZE_AUTHORSHIP);
      authorshipTask.timeoutMs = 5;

      const { handlers } = createRecordingHandlers({
        [LifecycleTask.ANALYZE_AUTHORSHIP]: () =>
          new Promise((resolve) => setTimeout(() => resolve({}), 40)),
      });

      const report = await runLifecycle({
        repository: 'owner/repo',
        pullNumber: 3,
        plan,
        handlers,
      });
      const task = report.phases
        .flatMap((phase) => phase.tasks)
        .find((item) => item.id === LifecycleTask.ANALYZE_AUTHORSHIP);

      expect(task.status).toBe(TaskStatus.WARNING);
      expect(task.error.code).toBe('TASK_TIMEOUT');
      expect(report.lifecycle.timedOut).toBe(false);
      expect(report.summary.status).toBe(TaskStatus.WARNING);
    });

    test('clona el plan recibido y no muta el original', async () => {
      const plan = buildLifecyclePlan();
      const { handlers } = createRecordingHandlers();

      await runLifecycle({ repository: 'owner/repo', pullNumber: 3, plan, handlers });

      expect(
        plan.phases.every((phase) => phase.status === 'pending' || phase.status === 'skipped'),
      ).toBe(true);
      expect(
        plan.phases
          .flatMap((phase) => phase.tasks)
          .every((task) => task.status === 'pending' || task.status === 'skipped'),
      ).toBe(true);
    });

    test('cancela la ejecución si la señal ya está abortada', async () => {
      const controller = new AbortController();
      controller.abort();
      const { handlers, calls } = createRecordingHandlers();

      const report = await runLifecycle({
        repository: 'owner/repo',
        pullNumber: 3,
        handlers,
        signal: controller.signal,
      });

      expect(calls).toEqual([]);
      expect(report.lifecycle.aborted).toBe(true);
      expect(report.summary.status).toBe(TaskStatus.SKIPPED);
    });

    test('usa la rama como grupo de concurrencia cuando no hay PR', async () => {
      const report = await runLifecycle({
        eventName: 'push',
        baseBranch: 'develop',
        commitSha: 'abc1234',
        repository: 'owner/repo',
      });

      expect(report.lifecycle.concurrencyGroup).toBe('ci-owner-repo-abc1234');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Handlers de contrato
  // ────────────────────────────────────────────────────────────────────────

  describe('handlers de contrato', () => {
    test('verifican el trigger y consolidan la entrega', async () => {
      const handlers = createContractHandlers();
      const plan = buildLifecyclePlan();

      await expect(
        handlers[LifecycleTask.VERIFY_TRIGGER]({
          plan,
          delivery: { repository: 'owner/repo', pullRequest: 1 },
        }),
      ).resolves.toEqual({ valid: true, event: plan.event, contract: plan.contract });

      await expect(
        handlers[LifecycleTask.ASSEMBLE_DELIVERY]({
          delivery: { repository: 'owner/repo', pullRequest: 1, commitSha: 'abc' },
        }),
      ).resolves.toEqual({ repository: 'owner/repo', pullRequest: 1, commitSha: 'abc' });
    });

    test('rechazan entregas sin repositorio o sin PR/SHA', async () => {
      const handlers = createContractHandlers();

      await expect(
        handlers[LifecycleTask.ASSEMBLE_DELIVERY]({ delivery: { repository: null } }),
      ).rejects.toThrow('repositorio');
      await expect(
        handlers[LifecycleTask.ASSEMBLE_DELIVERY]({ delivery: { repository: 'owner/repo' } }),
      ).rejects.toThrow('número de PR o el SHA');
    });

    test('rechazan un plan inválido', async () => {
      const handlers = createContractHandlers();
      const plan = buildLifecyclePlan({ eventAction: 'closed' });

      await expect(handlers[LifecycleTask.VERIFY_TRIGGER]({ plan, delivery: {} })).rejects.toThrow(
        'pull_request.closed',
      );
    });
  });
});
