const {
  DeliveryPhase,
  DELIVERY_PHASES,
  TRIGGER_EVENTS,
  getPhase,
  getNextPhase,
  isValidTransition,
} = require('../../src/pipeline/phases');

describe('HU01-T1 - Contrato de fases del ciclo de entrega', () => {
  test('expone las fases en el orden definido', () => {
    expect(DELIVERY_PHASES.map((phase) => phase.id)).toEqual([
      DeliveryPhase.DEVELOPMENT,
      DeliveryPhase.PUSH,
      DeliveryPhase.PULL_REQUEST,
      DeliveryPhase.ANALYSIS,
      DeliveryPhase.REPORTING,
      DeliveryPhase.REVIEW,
      DeliveryPhase.MERGE,
    ]);
  });

  test('cada fase incluye los campos obligatorios del contrato', () => {
    for (const phase of DELIVERY_PHASES) {
      expect(phase).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          order: expect.any(Number),
          name: expect.any(String),
          description: expect.any(String),
          automated: expect.any(Boolean),
        }),
      );
    }
  });

  test('los órdenes son consecutivos y empiezan en 1', () => {
    DELIVERY_PHASES.forEach((phase, index) => {
      expect(phase.order).toBe(index + 1);
    });
  });

  test('getPhase devuelve la fase por id y null si no existe', () => {
    expect(getPhase(DeliveryPhase.ANALYSIS).name).toBe('Análisis automático');
    expect(getPhase('fase-inexistente')).toBeNull();
  });

  test('getNextPhase devuelve la fase siguiente y null en la última o si no existe', () => {
    expect(getNextPhase(DeliveryPhase.PUSH).id).toBe(DeliveryPhase.PULL_REQUEST);
    expect(getNextPhase(DeliveryPhase.MERGE)).toBeNull();
    expect(getNextPhase('fase-inexistente')).toBeNull();
  });

  test('isValidTransition solo permite avanzar a la fase inmediatamente siguiente', () => {
    expect(isValidTransition(DeliveryPhase.DEVELOPMENT, DeliveryPhase.PUSH)).toBe(true);
    expect(isValidTransition(DeliveryPhase.PUSH, DeliveryPhase.PULL_REQUEST)).toBe(true);
    expect(isValidTransition(DeliveryPhase.DEVELOPMENT, DeliveryPhase.ANALYSIS)).toBe(false);
    expect(isValidTransition(DeliveryPhase.MERGE, DeliveryPhase.DEVELOPMENT)).toBe(false);
    expect(isValidTransition('fase-inexistente', DeliveryPhase.PUSH)).toBe(false);
  });

  test('define los eventos de GitHub que disparan el análisis', () => {
    expect(TRIGGER_EVENTS.pull_request.types).toEqual(
      expect.arrayContaining(['opened', 'synchronize', 'reopened', 'ready_for_review']),
    );
    expect(TRIGGER_EVENTS.pull_request.branches).toEqual(
      expect.arrayContaining(['develop', 'main']),
    );
    expect(TRIGGER_EVENTS.push.branches).toEqual(expect.arrayContaining(['develop', 'main']));
  });

  test('el contrato es inmutable en todos sus niveles', () => {
    expect(Object.isFrozen(DELIVERY_PHASES)).toBe(true);
    expect(Object.isFrozen(DELIVERY_PHASES[0])).toBe(true);
    expect(Object.isFrozen(TRIGGER_EVENTS)).toBe(true);
    expect(Object.isFrozen(TRIGGER_EVENTS.pull_request)).toBe(true);
  });
});
