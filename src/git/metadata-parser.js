/**
 * Módulo de Extracción y Parseo de Metadatos de Git (HU01 - T3 / HU07 - T2)
 *
 * Responsable asignado en Sprint 1: Ángel López Sánchez (AS) / Candela Marco Jiménez (CJ)
 * Revisor asignado: Jesús Cañete García (JG) / Alejandro Jesús Ortiz Zamora (AZ)
 */

/**
 * Extrae metadatos de autoría y commits implicados en la entrega.
 * @param {object} options
 */
function parseCommitMetadata(options = {}) {
  // TODO: Candela / Ángel (HU07-T02 / HU01-T03): Implementar lectura de trailers (Co-authored-by), autores y diffs
  return {
    commits: [],
    options,
  };
}

module.exports = { parseCommitMetadata };
