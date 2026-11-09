const {
  AuthorshipOrigin,
  CLASSIFICATION_CRITERIA,
  classifyOrigin,
  checkMetadataCriteria,
  checkTextualPatterns,
  hasVelocityAnomaly,
} = require('../src/classifier/authorship-classifier');

const { HUMAN, AI_ASSISTED, UNKNOWN } = AuthorshipOrigin;

function createHumanContribution(overrides = {}) {
  return {
    author: { name: 'Jorge Torres', email: 'jorge@example.com' },
    committer: { name: 'Jorge Torres', email: 'jorge@example.com' },
    ...overrides,
  };
}

describe('HU07-T03 - Clasificación de cada aportación según su origen', () => {
  describe('Criterios deterministas de metadatos (Nivel 1)', () => {
    test('clasifica como IA una coautoría declarada de una herramienta de IA', () => {
      const contribution = createHumanContribution({
        coAuthors: [{ name: 'GitHub Copilot', email: 'copilot@github.com' }],
      });

      expect(checkMetadataCriteria(contribution)).toBe(AI_ASSISTED);
      expect(classifyOrigin(contribution)).toBe(AI_ASSISTED);
    });

    test('no penaliza una coautoría humana', () => {
      const contribution = createHumanContribution({
        coAuthors: [{ name: 'Candela Marco', email: 'candela@example.com' }],
      });

      expect(checkMetadataCriteria(contribution)).toBeNull();
      expect(classifyOrigin(contribution)).toBe(HUMAN);
    });

    test('clasifica como IA cuando el autor es un bot por tipo de usuario', () => {
      const contribution = createHumanContribution({
        author: { name: 'CI Runner', email: 'ci@example.com', userType: 'Bot' },
      });

      expect(classifyOrigin(contribution)).toBe(AI_ASSISTED);
    });

    test('clasifica como IA cuando el autor se marca explícitamente como bot', () => {
      const contribution = createHumanContribution({
        author: { name: 'CI Runner', email: 'ci@example.com', isBot: true },
      });

      expect(classifyOrigin(contribution)).toBe(AI_ASSISTED);
    });

    test('clasifica como IA cuando el committer es un bot', () => {
      const contribution = createHumanContribution({
        committer: { name: 'github-actions[bot]', email: 'actions@github.com' },
      });

      expect(classifyOrigin(contribution)).toBe(AI_ASSISTED);
    });

    test('clasifica como IA por la identidad de una herramienta de IA en el correo', () => {
      const contribution = createHumanContribution({
        author: { name: 'Copilot', email: 'copilot@github.com' },
      });

      expect(classifyOrigin(contribution)).toBe(AI_ASSISTED);
    });

    test('clasifica como IA ante el trailer AI-Assisted', () => {
      const contribution = createHumanContribution({ trailers: { 'AI-Assisted': 'true' } });

      expect(classifyOrigin(contribution)).toBe(AI_ASSISTED);
    });

    test('clasifica como IA ante el trailer Generated-by', () => {
      const contribution = createHumanContribution({ trailers: { 'Generated-by': 'ChatGPT' } });

      expect(classifyOrigin(contribution)).toBe(AI_ASSISTED);
    });

    test('clasifica como IA ante un marcador explícito en el mensaje', () => {
      const contribution = createHumanContribution({
        message: 'feat: nueva pantalla [ai-generated]',
      });

      expect(classifyOrigin(contribution)).toBe(AI_ASSISTED);
    });
  });

  describe('Heurísticas de firmas textuales (Nivel 2)', () => {
    test('detecta bloques markdown residuales dentro de comentarios', () => {
      const contribution = createHumanContribution({
        content: '// ```javascript\nconst total = 1;',
      });

      expect(checkTextualPatterns(contribution)).toBe(AI_ASSISTED);
      expect(classifyOrigin(contribution)).toBe(AI_ASSISTED);
    });

    test('detecta frases conversacionales de LLM en inglés', () => {
      const contribution = createHumanContribution({
        content: '// Here is the implementation of the service',
      });

      expect(classifyOrigin(contribution)).toBe(AI_ASSISTED);
    });

    test('detecta frases conversacionales de LLM en español', () => {
      const contribution = createHumanContribution({
        content: '// Aquí tienes la implementación solicitada',
      });

      expect(classifyOrigin(contribution)).toBe(AI_ASSISTED);
    });
  });

  describe('Heurística de velocidad sobrehumana (Nivel 2)', () => {
    test('marca anomalía cuando se supera el umbral de líneas por minuto', () => {
      expect(hasVelocityAnomaly({ stats: { additions: 1000, elapsedMinutes: 2 } })).toBe(true);
    });

    test('no marca anomalía dentro de un ritmo humano', () => {
      expect(hasVelocityAnomaly({ stats: { additions: 100, elapsedMinutes: 10 } })).toBe(false);
    });

    test('una anomalía de velocidad sin confirmación textual se deriva a UNKNOWN', () => {
      const contribution = createHumanContribution({
        stats: { additions: 1000, elapsedMinutes: 2 },
      });

      expect(classifyOrigin(contribution)).toBe(UNKNOWN);
    });

    test('excluye ficheros generados y dependencias del cálculo de velocidad', () => {
      const contribution = createHumanContribution({
        stats: {
          elapsedMinutes: 1,
          files: [
            { filename: 'package-lock.json', additions: 5000 },
            { filename: 'dist/bundle.js', additions: 5000 },
            { filename: 'src/app.js', additions: 10 },
          ],
        },
      });

      expect(hasVelocityAnomaly(contribution)).toBe(false);
      expect(classifyOrigin(contribution)).toBe(HUMAN);
    });

    test('una anomalía de velocidad con firma textual se clasifica como IA', () => {
      const contribution = createHumanContribution({
        content: '// ```javascript',
        stats: { additions: 1000, elapsedMinutes: 2 },
      });

      expect(classifyOrigin(contribution)).toBe(AI_ASSISTED);
    });

    test('una anomalía de velocidad con metadatos de IA se clasifica como IA', () => {
      const contribution = createHumanContribution({
        trailers: { 'AI-Assisted': 'yes' },
        stats: { additions: 1000, elapsedMinutes: 2 },
      });

      expect(classifyOrigin(contribution)).toBe(AI_ASSISTED);
    });
  });

  describe('Aportaciones sin datos suficientes (UNKNOWN)', () => {
    test('sin autor se clasifica como desconocida', () => {
      expect(classifyOrigin({})).toBe(UNKNOWN);
    });

    test('un autor sin correo se clasifica como desconocida', () => {
      expect(classifyOrigin({ author: { name: 'Jorge Torres' } })).toBe(UNKNOWN);
    });

    test('un correo mal formado se clasifica como desconocida', () => {
      expect(classifyOrigin({ author: { name: 'Jorge', email: 'jorge-arroba' } })).toBe(UNKNOWN);
    });
  });

  describe('Aportaciones humanas (HUMAN)', () => {
    test('un autor y committer válidos sin indicios de IA se clasifican como humanos', () => {
      expect(classifyOrigin(createHumanContribution())).toBe(HUMAN);
    });

    test('un ritmo normal de adición se clasifica como humano', () => {
      const contribution = createHumanContribution({
        stats: { additions: 120, elapsedMinutes: 30 },
      });

      expect(classifyOrigin(contribution)).toBe(HUMAN);
    });
  });

  describe('Parámetros de clasificación', () => {
    test('expone el umbral de velocidad humana configurado', () => {
      expect(CLASSIFICATION_CRITERIA.MAX_HUMAN_LINES_PER_MINUTE).toBe(150);
    });
  });
});
