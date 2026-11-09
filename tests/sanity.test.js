const { AuthorshipOrigin, classifyOrigin } = require('../src/classifier/authorship-classifier');
const { createGitHubClient } = require('../src/auth/github-client');
const { parseCommitMetadata } = require('../src/git/metadata-parser');

describe('Esqueleto del Repositorio - Pruebas Base de Estructura', () => {
  describe('Módulo de Clasificación (HU07)', () => {
    test('expone los tipos de origen válidos', () => {
      expect(AuthorshipOrigin.HUMAN).toBe('human');
      expect(AuthorshipOrigin.AI_ASSISTED).toBe('ai_assisted');
      expect(AuthorshipOrigin.UNKNOWN).toBe('unknown');
    });

    test('retorna UNKNOWN por defecto antes de implementar reglas', () => {
      expect(classifyOrigin({})).toBe(AuthorshipOrigin.UNKNOWN);
    });
  });

  describe('Módulo de Autenticación (HU08)', () => {
    test('exige un token de GitHub válido para inicializar', () => {
      expect(() => createGitHubClient(null)).toThrow('GitHub token es requerido');
      expect(() => createGitHubClient('')).toThrow('GitHub token es requerido');
    });
  });

  describe('Módulo de Metadatos Git (HU01)', () => {
    test('retorna estructura base vacía por defecto', () => {
      const result = parseCommitMetadata();
      expect(result).toHaveProperty('commits');
      expect(Array.isArray(result.commits)).toBe(true);
    });
  });
});
