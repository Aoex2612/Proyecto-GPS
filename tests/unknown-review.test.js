const { AuthorshipOrigin } = require('../src/classifier/authorship-classifier');

const {
  UNKNOWN_RULES,
  isUnknown,
  buildUnknownRecord,
  collectUnknownContributions,
  buildUnknownReview,
} = require('../src/classifier/unknown-review');

const { HUMAN, AI_ASSISTED, UNKNOWN } = AuthorshipOrigin;

function createContribution(overrides = {}) {
  return {
    sha: 'abc1234',
    author: { name: 'Jorge Torres', email: 'jorge@example.com', login: 'Joalts8' },
    committer: { name: 'Jorge Torres', email: 'jorge@example.com' },
    date: '2026-11-14T10:00:00Z',
    message: 'feat: cambio',
    files: [],
    stats: { additions: 12, elapsedMinutes: 0 },
    ...overrides,
  };
}

describe('HU07-T04 - Tratamiento de aportaciones desconocidas', () => {
  describe('Catálogo de motivos de incertidumbre', () => {
    test('define severidad y acción de revisión para cada regla conocida', () => {
      expect(UNKNOWN_RULES['invalid-identity']).toEqual(
        expect.objectContaining({
          severity: 'high',
          action: 'verify-commit-identity',
        }),
      );

      expect(UNKNOWN_RULES['velocity-anomaly']).toEqual(
        expect.objectContaining({
          severity: 'medium',
          action: 'request-manual-review',
        }),
      );

      expect(UNKNOWN_RULES['ambiguous-identity']).toEqual(
        expect.objectContaining({
          severity: 'high',
          action: 'verify-author-identity',
        }),
      );
    });

    test('el catálogo es inmutable', () => {
      expect(Object.isFrozen(UNKNOWN_RULES)).toBe(true);
    });
  });

  describe('Identificación de aportaciones desconocidas', () => {
    test('reconoce únicamente el origen UNKNOWN', () => {
      expect(isUnknown(UNKNOWN)).toBe(true);
      expect(isUnknown(HUMAN)).toBe(false);
      expect(isUnknown(AI_ASSISTED)).toBe(false);
      expect(isUnknown(undefined)).toBe(false);
    });
  });

  describe('Ficha auditable de una aportación desconocida', () => {
    test('genera la ficha con regla, motivo, severidad y acción', () => {
      const record = buildUnknownRecord(createContribution(), {
        origin: UNKNOWN,
        rule: 'invalid-identity',
        reason: 'El committer no tiene una identidad válida (nombre y correo) (T1 §5.1).',
      });

      expect(record).toEqual({
        sha: 'abc1234',
        origin: UNKNOWN,
        rule: 'invalid-identity',
        reason: 'El committer no tiene una identidad válida (nombre y correo) (T1 §5.1).',
        severity: 'high',
        action: 'verify-commit-identity',
        requiresManualReview: true,
        author: {
          name: 'Jorge Torres',
          email: 'jorge@example.com',
          login: 'Joalts8',
        },
        date: '2026-11-14T10:00:00Z',
        additions: 12,
      });
    });

    test('no genera ficha para aportaciones humanas o asistidas por IA', () => {
      expect(
        buildUnknownRecord(createContribution(), {
          origin: HUMAN,
          rule: 'no-ai-evidence',
          reason: 'Sin indicios de IA.',
        }),
      ).toBeNull();

      expect(
        buildUnknownRecord(createContribution(), {
          origin: AI_ASSISTED,
          rule: 'ai-trailer',
          reason: 'Trailer explícito de IA.',
        }),
      ).toBeNull();
    });

    test('usa una ficha genérica cuando la regla no está catalogada', () => {
      const record = buildUnknownRecord(createContribution(), {
        origin: UNKNOWN,
        rule: 'regla-nueva',
        reason: 'Motivo sin catalogar.',
      });

      expect(record.rule).toBe('regla-nueva');
      expect(record.severity).toBe('medium');
      expect(record.action).toBe('request-manual-review');
      expect(record.requiresManualReview).toBe(true);
    });

    test('tolera aportaciones sin autor, fecha ni estadísticas', () => {
      const record = buildUnknownRecord(
        { sha: 'sin-datos' },
        { origin: UNKNOWN, rule: 'invalid-identity', reason: 'Sin identidad.' },
      );

      expect(record.author).toEqual({ name: null, email: null, login: null });
      expect(record.date).toBeNull();
      expect(record.additions).toBe(0);
    });

    test('no muta la aportación original', () => {
      const contribution = createContribution();

      buildUnknownRecord(contribution, { origin: UNKNOWN, rule: 'invalid-identity' });

      expect(contribution.review).toBeUndefined();
      expect(contribution.origin).toBeUndefined();
    });
  });

  describe('Cola de revisión manual', () => {
    test('solo recoge las aportaciones clasificadas como UNKNOWN', () => {
      const records = collectUnknownContributions([
        createContribution({ sha: 'humano' }),
        createContribution({ sha: 'ia', message: 'feat: [ai-generated]' }),
        createContribution({ sha: 'dudoso', author: { name: 'Anónimo', email: 'invalido' } }),
      ]);

      expect(records).toHaveLength(1);
      expect(records[0].sha).toBe('dudoso');
      expect(records[0].origin).toBe(UNKNOWN);
    });

    test('respeta las clasificaciones ya calculadas en lugar de reclasificar', () => {
      const records = collectUnknownContributions([
        {
          ...createContribution({ sha: 'forzado' }),
          classification: { origin: UNKNOWN, rule: 'velocity-anomaly', reason: 'Ritmo alto.' },
        },
      ]);

      expect(records[0].rule).toBe('velocity-anomaly');
    });
  });

  describe('Resumen para auditoría', () => {
    test('agrupa las aportaciones desconocidas por regla y severidad', () => {
      const review = buildUnknownReview([
        {
          ...createContribution({ sha: 'identidad' }),
          classification: { origin: UNKNOWN, rule: 'invalid-identity', reason: 'Sin identidad.' },
        },
        {
          ...createContribution({ sha: 'velocidad' }),
          classification: { origin: UNKNOWN, rule: 'velocity-anomaly', reason: 'Ritmo alto.' },
        },
        createContribution({ sha: 'humano' }),
        createContribution({ sha: 'ia', message: 'feat: [ai-generated]' }),
      ]);

      expect(review.total).toBe(2);
      expect(review.requiresManualReview).toBe(true);
      expect(review.byRule).toEqual({ 'invalid-identity': 1, 'velocity-anomaly': 1 });
      expect(review.bySeverity).toEqual({ high: 1, medium: 1, low: 0 });
      expect(review.items).toHaveLength(2);
      expect(review.message).toContain('2 aportación');
    });

    test('indica que no hay revisión pendiente cuando todo es identificable', () => {
      const review = buildUnknownReview([createContribution()]);

      expect(review.total).toBe(0);
      expect(review.requiresManualReview).toBe(false);
      expect(review.items).toEqual([]);
      expect(review.byRule).toEqual({});
      expect(review.message).toContain('No hay aportaciones desconocidas');
    });

    test('trata una entrada vacía como ausencia de revisión pendiente', () => {
      const review = buildUnknownReview();

      expect(review.total).toBe(0);
      expect(review.requiresManualReview).toBe(false);
    });
  });
});
