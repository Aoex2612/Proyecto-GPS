const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const {
  CLASSIFICATION_SCHEMA_VERSION,
  DEFAULT_FILE_NAME,
  buildClassificationRecord,
  serializeClassificationRecord,
  saveClassification,
  loadClassification,
  validateClassificationRecord,
} = require('../../src/persistence/classification-store');

const GENERATED_AT = '2026-11-16T10:00:00.000Z';

function createReport(overrides = {}) {
  return {
    delivery: {
      repository: 'Aoex2612/Proyecto-GPS',
      pullRequest: 17,
      baseBranch: 'develop',
      headBranch: 'HU07-T05-guardar-clasificacion',
      commitSha: 'abc1234',
    },
    authorship: {
      human: 2,
      aiAssisted: 1,
      unknown: 1,
      total: 4,
      percentage: { human: 50, aiAssisted: 25, unknown: 25 },
      lines: { human: 80, aiAssisted: 20, unknown: 10, total: 110 },
    },
    verdict: {
      status: 'review_required',
      exceedsThreshold: false,
      reasons: ['1 aportación desconocida requiere revisión manual.'],
    },
    thresholdAi: 50,
    identities: [{ name: 'Jorge Torres', email: 'jorge@example.com' }],
    contributions: [{ sha: 'abc1234', origin: 'unknown' }],
    unknownReview: { total: 1, requiresManualReview: true },
    ...overrides,
  };
}

async function createTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'classification-store-'));
}

describe('HU07-T05 - Guardado de la clasificación para análisis posteriores', () => {
  describe('Construcción del registro', () => {
    test('normaliza el informe con versión de esquema y fecha de generación', () => {
      const record = buildClassificationRecord(createReport(), { generatedAt: GENERATED_AT });

      expect(record.schemaVersion).toBe(CLASSIFICATION_SCHEMA_VERSION);
      expect(record.generatedAt).toBe(GENERATED_AT);
      expect(record.delivery).toEqual({
        repository: 'Aoex2612/Proyecto-GPS',
        pullRequest: 17,
        baseBranch: 'develop',
        headBranch: 'HU07-T05-guardar-clasificacion',
        commitSha: 'abc1234',
      });
      expect(record.authorship).toEqual({
        human: 2,
        aiAssisted: 1,
        unknown: 1,
        total: 4,
        percentage: { human: 50, aiAssisted: 25, unknown: 25 },
        lines: { human: 80, aiAssisted: 20, unknown: 10, total: 110 },
      });
      expect(record.verdict).toEqual({
        status: 'review_required',
        exceedsThreshold: false,
        reasons: ['1 aportación desconocida requiere revisión manual.'],
      });
      expect(record.thresholdAi).toBe(50);
      expect(record.identities).toHaveLength(1);
      expect(record.contributions).toHaveLength(1);
      expect(record.unknownReview).toEqual({ total: 1, requiresManualReview: true });
    });

    test('rellena valores seguros cuando faltan bloques del informe', () => {
      const record = buildClassificationRecord({}, { generatedAt: GENERATED_AT });

      expect(record.authorship).toEqual({
        human: 0,
        aiAssisted: 0,
        unknown: 0,
        total: 0,
        percentage: { human: 0, aiAssisted: 0, unknown: 0 },
        lines: { human: 0, aiAssisted: 0, unknown: 0, total: 0 },
      });
      expect(record.verdict).toEqual({
        status: 'unknown',
        exceedsThreshold: false,
        reasons: [],
      });
      expect(record.thresholdAi).toBe(50);
      expect(record.identities).toEqual([]);
      expect(record.contributions).toEqual([]);
      expect(record.unknownReview).toBeNull();
    });

    test('no muta el informe original ni comparte referencias internas', () => {
      const report = createReport();
      const snapshot = JSON.stringify(report);

      const record = buildClassificationRecord(report, { generatedAt: GENERATED_AT });
      record.verdict.reasons.push('motivo añadido al registro');
      record.authorship.percentage.human = 0;

      expect(JSON.stringify(report)).toBe(snapshot);
    });

    test('rechaza un informe que no sea un objeto', () => {
      expect(() => buildClassificationRecord(null)).toThrow(TypeError);
      expect(() => buildClassificationRecord([])).toThrow(TypeError);
      expect(() => buildClassificationRecord('informe')).toThrow(TypeError);
    });

    test('rechaza una fecha de generación inválida', () => {
      expect(() =>
        buildClassificationRecord(createReport(), { generatedAt: 'no-es-una-fecha' }),
      ).toThrow(TypeError);
    });

    test.each([null, ''])(
      'normaliza el umbral %p al valor por defecto (50, nunca 0)',
      (thresholdAi) => {
        const record = buildClassificationRecord(createReport({ thresholdAi }), {
          generatedAt: GENERATED_AT,
        });

        expect(record.thresholdAi).toBe(50);
      },
    );

    test('normaliza el umbral ausente al valor por defecto (50)', () => {
      const record = buildClassificationRecord(createReport({ thresholdAi: undefined }), {
        generatedAt: GENERATED_AT,
      });

      expect(record.thresholdAi).toBe(50);
    });

    test.each([0, 100])('acepta el umbral %p dentro del rango [0, 100]', (thresholdAi) => {
      const record = buildClassificationRecord(createReport({ thresholdAi }), {
        generatedAt: GENERATED_AT,
      });

      expect(record.thresholdAi).toBe(thresholdAi);
    });

    test.each([500, -1])('rechaza el umbral %p fuera del rango [0, 100]', (thresholdAi) => {
      expect(() =>
        buildClassificationRecord(createReport({ thresholdAi }), { generatedAt: GENERATED_AT }),
      ).toThrow(/umbral/i);
    });
  });

  describe('Serialización del registro', () => {
    test('genera JSON indentado y termina con salto de línea', () => {
      const record = buildClassificationRecord(createReport(), { generatedAt: GENERATED_AT });
      const serialized = serializeClassificationRecord(record);

      expect(serialized.endsWith('\n')).toBe(true);
      expect(serialized).toContain('\n  "schemaVersion": 1,');
      expect(JSON.parse(serialized)).toEqual(record);
    });
  });

  describe('Validación del registro', () => {
    test('acepta un registro construido por el propio módulo', () => {
      const record = buildClassificationRecord(createReport(), { generatedAt: GENERATED_AT });

      expect(validateClassificationRecord(record)).toEqual({ valid: true, errors: [] });
    });

    test('acumula errores cuando el esquema o los bloques obligatorios no son válidos', () => {
      const result = validateClassificationRecord({
        schemaVersion: 99,
        authorship: null,
        verdict: {},
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
      expect(result.errors.join(' ')).toContain('Versión de esquema');
    });

    test.each([
      'authorship.human',
      'authorship.aiAssisted',
      'authorship.unknown',
      'authorship.total',
      'authorship.percentage',
      'authorship.lines',
      'verdict.reasons',
    ])('marca el registro como inválido si falta %s', (field) => {
      const record = buildClassificationRecord(createReport(), { generatedAt: GENERATED_AT });
      const keys = field.split('.');
      delete record[keys[0]][keys[1]];

      const result = validateClassificationRecord(record);

      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toContain(field);
    });

    test.each([500, -1])(
      'marca el registro como inválido si thresholdAi vale %p',
      (thresholdAi) => {
        const record = buildClassificationRecord(createReport(), { generatedAt: GENERATED_AT });
        record.thresholdAi = thresholdAi;

        const result = validateClassificationRecord(record);

        expect(result.valid).toBe(false);
        expect(result.errors.join(' ')).toContain('thresholdAi');
      },
    );
  });

  describe('Guardado en metrics.json', () => {
    test('escribe el registro en la ruta indicada', async () => {
      const cwd = await createTempDir();

      try {
        const { record, reportPath } = await saveClassification(createReport(), {
          cwd,
          generatedAt: GENERATED_AT,
        });

        expect(reportPath).toBe(path.join(cwd, DEFAULT_FILE_NAME));

        const raw = await fs.readFile(reportPath, 'utf8');
        expect(raw.endsWith('\n')).toBe(true);
        expect(JSON.parse(raw)).toEqual(record);
      } finally {
        await fs.rm(cwd, { recursive: true, force: true });
      }
    });

    test('permite personalizar el nombre del fichero', async () => {
      const cwd = await createTempDir();

      try {
        const { reportPath } = await saveClassification(createReport(), {
          cwd,
          filePath: 'custom-metrics.json',
          generatedAt: GENERATED_AT,
        });

        expect(reportPath).toBe(path.join(cwd, 'custom-metrics.json'));
        await expect(fs.access(reportPath)).resolves.toBeUndefined();
      } finally {
        await fs.rm(cwd, { recursive: true, force: true });
      }
    });

    test('propaga los errores de escritura', async () => {
      const writeFileImpl = jest.fn().mockRejectedValue(new Error('disco lleno'));

      await expect(
        saveClassification(createReport(), { writeFileImpl, generatedAt: GENERATED_AT }),
      ).rejects.toThrow('disco lleno');
    });

    test.each([
      ['un objeto vacío', {}],
      ['un informe sin authorship', { verdict: { status: 'human', reasons: [] } }],
      ['un informe sin verdict', { authorship: { human: 1, aiAssisted: 0, unknown: 0, total: 1 } }],
      ['un informe con bloques vacíos', { authorship: {}, verdict: {} }],
    ])('rechaza guardar %s y no escribe ningún registro', async (_label, report) => {
      const writeFileImpl = jest.fn();

      await expect(saveClassification(report, { writeFileImpl })).rejects.toThrow(Error);
      expect(writeFileImpl).not.toHaveBeenCalled();
    });
  });

  describe('Lectura de la clasificación guardada', () => {
    test('recupera exactamente el registro previamente guardado', async () => {
      const cwd = await createTempDir();

      try {
        const { record } = await saveClassification(createReport(), {
          cwd,
          generatedAt: GENERATED_AT,
        });

        const loaded = await loadClassification({ cwd });

        expect(loaded).toEqual(record);
      } finally {
        await fs.rm(cwd, { recursive: true, force: true });
      }
    });

    test('devuelve null cuando el fichero no existe', async () => {
      const cwd = await createTempDir();

      try {
        expect(await loadClassification({ cwd })).toBeNull();
      } finally {
        await fs.rm(cwd, { recursive: true, force: true });
      }
    });

    test('rechaza un fichero que no contiene JSON válido', async () => {
      const cwd = await createTempDir();

      try {
        await fs.writeFile(path.join(cwd, DEFAULT_FILE_NAME), 'esto no es json', 'utf8');

        await expect(loadClassification({ cwd })).rejects.toThrow('JSON válido');
      } finally {
        await fs.rm(cwd, { recursive: true, force: true });
      }
    });

    test('rechaza un registro con versión de esquema no soportada', async () => {
      const cwd = await createTempDir();
      const record = buildClassificationRecord(createReport(), { generatedAt: GENERATED_AT });

      try {
        await fs.writeFile(
          path.join(cwd, DEFAULT_FILE_NAME),
          JSON.stringify({ ...record, schemaVersion: 99 }),
          'utf8',
        );

        await expect(loadClassification({ cwd })).rejects.toThrow('no es válido');
      } finally {
        await fs.rm(cwd, { recursive: true, force: true });
      }
    });

    test('rechaza un registro sin los bloques obligatorios', async () => {
      const cwd = await createTempDir();

      try {
        await fs.writeFile(
          path.join(cwd, DEFAULT_FILE_NAME),
          JSON.stringify({ schemaVersion: CLASSIFICATION_SCHEMA_VERSION }),
          'utf8',
        );

        await expect(loadClassification({ cwd })).rejects.toThrow('no es válido');
      } finally {
        await fs.rm(cwd, { recursive: true, force: true });
      }
    });
  });
});
