/**
 * Persistencia de la Clasificación de Autoría (HU07 - T5)
 *
 * Responsable asignado en Sprint 1: Alejandro Jesús Ortiz Zamora (AZ)
 * Revisor asignado (matriz P4): Jesús Cañete García (JG)
 *
 * Guarda el informe de autoría en `metrics.json` con un esquema versionado y
 * permite recuperarlo para reutilizar la clasificación en análisis posteriores
 * sin volver a calcularla.
 *
 * Interfaz de referencia: docs/HU07-T05-guardar-clasificacion.md.
 */

const fs = require('fs/promises');
const path = require('path');

const CLASSIFICATION_SCHEMA_VERSION = 1;
const DEFAULT_FILE_NAME = 'metrics.json';
const DEFAULT_AI_THRESHOLD = 50;

/**
 * Indica si un valor es un objeto plano (no nulo y no array).
 * @param {*} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Clona un valor serializable para que el registro no comparta referencias con
 * el informe original.
 * @param {*} value
 * @returns {*}
 */
function cloneSerializable(value) {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

/**
 * Normaliza un contador a un número no negativo.
 * @param {*} value
 * @returns {number}
 */
function toNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/**
 * Normaliza el umbral de IA a un porcentaje entre 0 y 100.
 *
 * Los valores ausentes o vacíos (`undefined`, `null` y `''`) se resuelven con
 * el umbral por defecto (50), igual que hace el detector de autoría. Cualquier
 * valor numérico fuera del rango `[0, 100]` se rechaza en lugar de recortarse,
 * para no ocultar una configuración inválida.
 *
 * @param {*} value
 * @returns {number}
 * @throws {RangeError} Si el umbral es un número fuera del rango `[0, 100]`.
 */
function normalizeThreshold(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return DEFAULT_AI_THRESHOLD;
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return DEFAULT_AI_THRESHOLD;
  }

  if (number < 0 || number > 100) {
    throw new RangeError(
      `El umbral de IA (\`thresholdAi\`) debe estar entre 0 y 100; se recibió ${number}.`,
    );
  }

  return number;
}

/**
 * Normaliza la fecha de generación a ISO 8601.
 * @param {*} value
 * @returns {string}
 */
function normalizeGeneratedAt(value) {
  if (value === undefined || value === null) {
    return new Date().toISOString();
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('La fecha de generación no es válida.');
  }

  return date.toISOString();
}

/**
 * Construye el registro versionado que se persiste en disco.
 *
 * @param {object} [report] - Informe devuelto por `detectAuthorship`.
 * @param {object} [options]
 * @param {string|Date} [options.generatedAt] - Fecha de generación; por defecto, ahora.
 * @returns {object} Registro normalizado y serializable.
 */
function buildClassificationRecord(report = {}, { generatedAt } = {}) {
  if (!isPlainObject(report)) {
    throw new TypeError('El informe de autoría debe ser un objeto.');
  }

  const authorship = isPlainObject(report.authorship) ? report.authorship : {};
  const verdict = isPlainObject(report.verdict) ? report.verdict : {};
  const delivery = isPlainObject(report.delivery) ? report.delivery : {};

  return {
    schemaVersion: CLASSIFICATION_SCHEMA_VERSION,
    generatedAt: normalizeGeneratedAt(generatedAt),
    delivery: {
      repository: delivery.repository ?? null,
      pullRequest: delivery.pullRequest ?? null,
      baseBranch: delivery.baseBranch ?? null,
      headBranch: delivery.headBranch ?? null,
      commitSha: delivery.commitSha ?? null,
    },
    authorship: {
      human: toNonNegativeNumber(authorship.human),
      aiAssisted: toNonNegativeNumber(authorship.aiAssisted),
      unknown: toNonNegativeNumber(authorship.unknown),
      total: toNonNegativeNumber(authorship.total),
      percentage: isPlainObject(authorship.percentage)
        ? cloneSerializable(authorship.percentage)
        : { human: 0, aiAssisted: 0, unknown: 0 },
      lines: isPlainObject(authorship.lines)
        ? cloneSerializable(authorship.lines)
        : { human: 0, aiAssisted: 0, unknown: 0, total: 0 },
    },
    verdict: {
      status: typeof verdict.status === 'string' ? verdict.status : 'unknown',
      exceedsThreshold: verdict.exceedsThreshold === true,
      reasons: Array.isArray(verdict.reasons) ? cloneSerializable(verdict.reasons) : [],
    },
    thresholdAi: normalizeThreshold(report.thresholdAi),
    identities: Array.isArray(report.identities) ? cloneSerializable(report.identities) : [],
    contributions: Array.isArray(report.contributions)
      ? cloneSerializable(report.contributions)
      : [],
    unknownReview: isPlainObject(report.unknownReview)
      ? cloneSerializable(report.unknownReview)
      : null,
  };
}

/**
 * Serializa un registro como JSON legible con salto de línea final.
 * @param {object} record
 * @returns {string}
 */
function serializeClassificationRecord(record) {
  return `${JSON.stringify(record, null, 2)}\n`;
}

/**
 * Valida la estructura y versión de un registro de clasificación.
 * @param {object} record
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateClassificationRecord(record) {
  if (!isPlainObject(record)) {
    return { valid: false, errors: ['El registro de clasificación debe ser un objeto.'] };
  }

  const errors = [];

  if (record.schemaVersion !== CLASSIFICATION_SCHEMA_VERSION) {
    errors.push(
      `Versión de esquema no soportada: ${record.schemaVersion}. Se esperaba ${CLASSIFICATION_SCHEMA_VERSION}.`,
    );
  }

  if (typeof record.generatedAt !== 'string' || Number.isNaN(Date.parse(record.generatedAt))) {
    errors.push('La fecha de generación (`generatedAt`) no es una fecha ISO válida.');
  }

  if (!isPlainObject(record.delivery)) {
    errors.push('Falta el bloque `delivery` o no es un objeto.');
  }

  if (!isPlainObject(record.authorship)) {
    errors.push('Falta el bloque `authorship` o no es un objeto.');
  } else {
    for (const key of ['human', 'aiAssisted', 'unknown', 'total']) {
      if (!Number.isFinite(record.authorship[key])) {
        errors.push(`El contador \`authorship.${key}\` debe ser numérico.`);
      }
    }

    if (!isPlainObject(record.authorship.percentage)) {
      errors.push('Falta el desglose `authorship.percentage` o no es un objeto.');
    } else {
      for (const key of ['human', 'aiAssisted', 'unknown']) {
        if (!Number.isFinite(record.authorship.percentage[key])) {
          errors.push(`El porcentaje \`authorship.percentage.${key}\` debe ser numérico.`);
        }
      }
    }

    if (!isPlainObject(record.authorship.lines)) {
      errors.push('Falta el desglose `authorship.lines` o no es un objeto.');
    } else {
      for (const key of ['human', 'aiAssisted', 'unknown', 'total']) {
        if (!Number.isFinite(record.authorship.lines[key])) {
          errors.push(`El recuento \`authorship.lines.${key}\` debe ser numérico.`);
        }
      }
    }
  }

  if (!isPlainObject(record.verdict) || typeof record.verdict.status !== 'string') {
    errors.push('Falta el bloque `verdict` o no incluye un `status` textual.');
  } else if (!Array.isArray(record.verdict.reasons)) {
    errors.push('El campo `verdict.reasons` debe ser un array.');
  }

  if (!Number.isFinite(record.thresholdAi) || record.thresholdAi < 0 || record.thresholdAi > 100) {
    errors.push('El umbral `thresholdAi` debe ser numérico y estar entre 0 y 100.');
  }

  if (!Array.isArray(record.identities)) {
    errors.push('El campo `identities` debe ser un array.');
  }

  if (!Array.isArray(record.contributions)) {
    errors.push('El campo `contributions` debe ser un array.');
  }

  if (record.unknownReview !== null && !isPlainObject(record.unknownReview)) {
    errors.push('El campo `unknownReview` debe ser un objeto o `null`.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Comprueba que el informe contiene datos reales antes de persistirlo.
 *
 * Evita que un objeto vacío (o un informe sin `authorship`/`verdict`) genere un
 * registro aparentemente válido con todos los contadores a `0` y
 * `status: 'unknown'`, que contaminaría análisis posteriores.
 *
 * @param {object} report
 * @throws {TypeError|Error} Si el informe no tiene datos que guardar.
 */
function assertPersistableReport(report) {
  if (!isPlainObject(report)) {
    throw new TypeError(
      'El informe de autoría debe ser un objeto con datos de `authorship` y `verdict`.',
    );
  }

  if (Object.keys(report).length === 0) {
    throw new Error(
      'No se puede guardar un informe de autoría vacío: no contiene datos de `authorship` ni `verdict`.',
    );
  }

  const hasAuthorshipData =
    isPlainObject(report.authorship) &&
    ['human', 'aiAssisted', 'unknown', 'total', 'percentage', 'lines'].some(
      (field) => report.authorship[field] !== undefined,
    );

  if (!hasAuthorshipData) {
    throw new Error(
      'No se puede guardar el informe de autoría: falta el bloque `authorship` con datos reales.',
    );
  }

  const hasVerdictData =
    isPlainObject(report.verdict) &&
    ['status', 'exceedsThreshold', 'reasons'].some((field) => report.verdict[field] !== undefined);

  if (!hasVerdictData) {
    throw new Error(
      'No se puede guardar el informe de autoría: falta el bloque `verdict` con datos reales.',
    );
  }
}

/**
 * Guarda el informe de autoría en `metrics.json`.
 *
 * @param {object} report - Informe devuelto por `detectAuthorship`.
 * @param {object} [options]
 * @param {string} [options.filePath='metrics.json']
 * @param {string} [options.cwd=process.cwd()]
 * @param {Function} [options.writeFileImpl=fs.writeFile]
 * @param {string|Date} [options.generatedAt]
 * @returns {Promise<{ record: object, reportPath: string }>}
 */
async function saveClassification(
  report,
  {
    filePath = DEFAULT_FILE_NAME,
    cwd = process.cwd(),
    writeFileImpl = fs.writeFile,
    generatedAt,
  } = {},
) {
  assertPersistableReport(report);

  const record = buildClassificationRecord(report, { generatedAt });
  const reportPath = path.resolve(cwd, filePath);

  await writeFileImpl(reportPath, serializeClassificationRecord(record), 'utf8');

  return { record, reportPath };
}

/**
 * Recupera la clasificación guardada previamente.
 *
 * @param {object} [options]
 * @param {string} [options.filePath='metrics.json']
 * @param {string} [options.cwd=process.cwd()]
 * @param {Function} [options.readFileImpl=fs.readFile]
 * @returns {Promise<object|null>} Registro validado, o `null` si no existe.
 */
async function loadClassification({
  filePath = DEFAULT_FILE_NAME,
  cwd = process.cwd(),
  readFileImpl = fs.readFile,
} = {}) {
  const reportPath = path.resolve(cwd, filePath);

  let raw;
  try {
    raw = await readFileImpl(reportPath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  let record;
  try {
    record = JSON.parse(raw);
  } catch (error) {
    throw new Error(`El fichero ${reportPath} no contiene un JSON válido: ${error.message}`);
  }

  const { valid, errors } = validateClassificationRecord(record);
  if (!valid) {
    throw new Error(`El registro de clasificación no es válido: ${errors.join('; ')}`);
  }

  return record;
}

module.exports = {
  CLASSIFICATION_SCHEMA_VERSION,
  DEFAULT_FILE_NAME,
  buildClassificationRecord,
  serializeClassificationRecord,
  validateClassificationRecord,
  saveClassification,
  loadClassification,
};
