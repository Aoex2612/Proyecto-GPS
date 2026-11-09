const {
  AuthorshipOrigin,
  classifyOrigin,
  CLASSIFICATION_CRITERIA,
  checkMetadataCriteria,
  checkVelocityCriteria,
  checkTextualPatterns,
} = require('../src/classifier/authorship-classifier');

describe('HU07-T01: Criterios para distinguir aportaciones humanas y automatizadas', () => {
  describe('Constantes de Criterios (Exportables y Configurables)', () => {
    test('expone las reglas y umbrales de clasificación definidos', () => {
      expect(CLASSIFICATION_CRITERIA).toBeDefined();
      expect(CLASSIFICATION_CRITERIA.MAX_HUMAN_LINES_PER_MINUTE).toBeGreaterThan(0);
      expect(Array.isArray(CLASSIFICATION_CRITERIA.KNOWN_BOT_PATTERNS)).toBe(true);
      expect(Array.isArray(CLASSIFICATION_CRITERIA.AI_TEXT_PATTERNS)).toBe(true);
    });
  });

  describe('Criterios Deterministas de Metadatos', () => {
    test('clasifica como AI_ASSISTED si hay co-autoría declarada de asistentes (ej. Copilot)', () => {
      const contribution = {
        author: { name: 'Dev Humano', email: 'dev@uma.es' },
        coAuthors: [{ name: 'GitHub Copilot', email: 'copilot@github.com' }],
      };

      expect(checkMetadataCriteria(contribution)).toBe(AuthorshipOrigin.AI_ASSISTED);
      expect(classifyOrigin(contribution)).toBe(AuthorshipOrigin.AI_ASSISTED);
    });

    test('clasifica como AI_ASSISTED si el autor o committer es un bot automatizado', () => {
      const contributionBotUser = {
        author: {
          name: 'github-actions[bot]',
          email: '41898282+github-actions[bot]@users.noreply.github.com',
          userType: 'Bot',
        },
      };

      const contributionBotEmail = {
        author: { name: 'Bot Committer', email: 'dependabot[bot]@users.noreply.github.com' },
      };

      expect(checkMetadataCriteria(contributionBotUser)).toBe(AuthorshipOrigin.AI_ASSISTED);
      expect(checkMetadataCriteria(contributionBotEmail)).toBe(AuthorshipOrigin.AI_ASSISTED);
      expect(classifyOrigin(contributionBotUser)).toBe(AuthorshipOrigin.AI_ASSISTED);
    });

    test('clasifica como AI_ASSISTED si contiene trailers explícitos de asistencia IA en el commit', () => {
      const contribution = {
        author: { name: 'Dev Humano', email: 'dev@uma.es' },
        trailers: { 'AI-Assisted': 'true' },
        message: 'feat: add sorting\n\nAI-Assisted: true',
      };

      expect(checkMetadataCriteria(contribution)).toBe(AuthorshipOrigin.AI_ASSISTED);
      expect(classifyOrigin(contribution)).toBe(AuthorshipOrigin.AI_ASSISTED);
    });
  });

  describe('Criterios Heurísticos de Velocidad (Generación Sobrehumana)', () => {
    test('clasifica como AI_ASSISTED si la tasa de líneas de código excede la velocidad humana', () => {
      // Ejemplo: 300 líneas en 30 segundos (equivalente a 600 líneas/minuto)
      const contribution = {
        author: { name: 'Dev Humano', email: 'dev@uma.es' },
        stats: {
          additions: 300,
          elapsedMinutes: 0.5,
        },
      };

      expect(checkVelocityCriteria(contribution)).toBe(AuthorshipOrigin.AI_ASSISTED);
      expect(classifyOrigin(contribution)).toBe(AuthorshipOrigin.AI_ASSISTED);
    });

    test('no clasifica como IA si el ritmo de generación de código es propio de un humano', () => {
      // Ejemplo: 40 líneas en 10 minutos (4 líneas/minuto)
      const contribution = {
        author: { name: 'Dev Humano', email: 'dev@uma.es' },
        stats: {
          additions: 40,
          elapsedMinutes: 10,
        },
      };

      expect(checkVelocityCriteria(contribution)).toBeNull();
    });
  });

  describe('Criterios Heurísticos de Patrones de Texto de LLMs', () => {
    test('detecta restos de bloques markdown de chat de LLM dentro de comentarios de código', () => {
      const contribution = {
        author: { name: 'Dev Humano', email: 'dev@uma.es' },
        content: `
          // Función de cálculo
          // \`\`\`javascript
          function calculateTotal() { return 100; }
          // \`\`\`
        `,
      };

      expect(checkTextualPatterns(contribution)).toBe(AuthorshipOrigin.AI_ASSISTED);
      expect(classifyOrigin(contribution)).toBe(AuthorshipOrigin.AI_ASSISTED);
    });

    test('detecta frases introductorias típicas generadas por LLMs', () => {
      const contributionIntro = {
        author: { name: 'Dev Humano', email: 'dev@uma.es' },
        content: '// Here is the implementation of the requested algorithm\nfunction solve() {}',
      };

      const contributionSpanish = {
        author: { name: 'Dev Humano', email: 'dev@uma.es' },
        content: '// Aquí tienes la función implementada con la solución optimizada:\nconst x = 1;',
      };

      expect(checkTextualPatterns(contributionIntro)).toBe(AuthorshipOrigin.AI_ASSISTED);
      expect(checkTextualPatterns(contributionSpanish)).toBe(AuthorshipOrigin.AI_ASSISTED);
      expect(classifyOrigin(contributionIntro)).toBe(AuthorshipOrigin.AI_ASSISTED);
    });
  });

  describe('Identificación de Aportaciones Humanas', () => {
    test('clasifica como HUMAN cuando es un usuario válido, ritmo normal y sin indicios de IA', () => {
      const contribution = {
        author: { name: 'Alejandro Ortiz', email: 'alejandro@uma.es' },
        message: 'feat: add user login validator',
        stats: {
          additions: 25,
          elapsedMinutes: 15,
        },
        content: `
          // Valida credenciales de usuario
          function validateUser(email, password) {
            return email && password && password.length >= 8;
          }
        `,
      };

      expect(classifyOrigin(contribution)).toBe(AuthorshipOrigin.HUMAN);
    });
  });
});
