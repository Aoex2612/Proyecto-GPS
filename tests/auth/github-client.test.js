const core = require('@actions/core');
const github = require('@actions/github');
const { createGitHubClient, validateToken } = require('../../src/auth/github-client');

jest.mock('@actions/core');
jest.mock('@actions/github');

describe('Módulo de Autenticación y Cliente de GitHub (HU08 - T01 / T02)', () => {
  const validToken = 'ghp_testToken1234567890abcdefghijklmnopqrstuvwxyz';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateToken()', () => {
    test('acepta un token válido no vacío', () => {
      expect(() => validateToken(validToken)).not.toThrow();
    });

    test('lanza error cuando el token es nulo o indefinido', () => {
      expect(() => validateToken(null)).toThrow(/token.*requerido/i);
      expect(() => validateToken(undefined)).toThrow(/token.*requerido/i);
    });

    test('lanza error cuando el token es un string vacío o solo espacios en blanco', () => {
      expect(() => validateToken('')).toThrow(/token.*requerido/i);
      expect(() => validateToken('   ')).toThrow(/token.*requerido/i);
    });

    test('lanza error defensivo si el token no es de tipo string', () => {
      expect(() => validateToken(12345)).toThrow(/token.*requerido/i);
      expect(() => validateToken({})).toThrow(/token.*requerido/i);
      expect(() => validateToken(true)).toThrow(/token.*requerido/i);
    });
  });

  describe('createGitHubClient()', () => {
    const mockOctokit = {
      rest: {
        pulls: {
          get: jest.fn(),
          listCommits: jest.fn(),
        },
        issues: {
          createComment: jest.fn(),
        },
      },
    };

    beforeEach(() => {
      github.getOctokit.mockReturnValue(mockOctokit);
    });

    test('enmascara el token con core.setSecret por seguridad', () => {
      createGitHubClient(validToken);
      expect(core.setSecret).toHaveBeenCalledWith(validToken);
    });

    test('inicializa getOctokit con el token proporcionado y retorna la instancia', () => {
      const client = createGitHubClient(validToken);

      expect(github.getOctokit).toHaveBeenCalledTimes(1);
      expect(github.getOctokit).toHaveBeenCalledWith(validToken, {});
      expect(client).toBe(mockOctokit);
    });

    test('permite pasar opciones adicionales de configuración a Octokit', () => {
      const customOptions = {
        baseUrl: 'https://github-enterprise.acme.com/api/v3',
        request: { timeout: 10000 },
      };

      const client = createGitHubClient(validToken, customOptions);

      expect(github.getOctokit).toHaveBeenCalledWith(validToken, customOptions);
      expect(client).toBe(mockOctokit);
    });

    test('obtiene el token desde core.getInput cuando no se pasa como parámetro', () => {
      core.getInput.mockReturnValue(validToken);

      const client = createGitHubClient();

      expect(core.getInput).toHaveBeenCalledWith('github-token', { required: true });
      expect(core.setSecret).toHaveBeenCalledWith(validToken);
      expect(github.getOctokit).toHaveBeenCalledWith(validToken, {});
      expect(client).toBe(mockOctokit);
    });

    test('falla si no se proporciona token y core.getInput devuelve vacío', () => {
      core.getInput.mockReturnValue('');

      expect(() => createGitHubClient()).toThrow(/token.*requerido/i);
      expect(github.getOctokit).not.toHaveBeenCalled();
    });
  });
});
