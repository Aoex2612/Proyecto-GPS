/**
 * Utilidades compartidas por las pruebas del módulo de calidad (HU01-T4).
 * No contiene pruebas: solo constructores de respuestas HTTP simuladas.
 */

/**
 * Construye una respuesta mínima compatible con la interfaz de `fetch`.
 * @param {*} body - Cuerpo JSON que devolverá `response.json()`.
 * @param {object} [options]
 * @param {boolean} [options.ok]
 * @param {number} [options.status]
 * @returns {object}
 */
function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: jest.fn(async () => body),
  };
}

/**
 * Simula los tres endpoints de la API de Sonar consumidos por el cliente.
 * @param {object} [options]
 * @param {string} [options.gate] - Estado del Quality Gate.
 * @param {Array} [options.measures] - Medidas devueltas por measures/component.
 * @param {Array} [options.issues] - Issues devueltos por issues/search.
 * @returns {Function}
 */
function sonarFetch({ gate = 'OK', measures = [], issues = [] } = {}) {
  return jest.fn(async (url) => {
    if (url.includes('/api/qualitygates/project_status')) {
      return jsonResponse({ projectStatus: { status: gate, conditions: [] } });
    }
    if (url.includes('/api/measures/component')) {
      return jsonResponse({ component: { measures } });
    }
    if (url.includes('/api/issues/search')) {
      return jsonResponse({ issues });
    }
    return jsonResponse({}, { ok: false, status: 404 });
  });
}

module.exports = { jsonResponse, sonarFetch };
