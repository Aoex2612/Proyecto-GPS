const core = require('@actions/core');
const github = require('@actions/github');
const { createGitHubClient, resolveToken, validateToken } = require('../../src/auth/github-client');

jest.mock('@actions/core');
jest.mock('@actions/github');

describe('Módulo de Autenticación y Cliente de GitHub (HU08 - T01 / T02)', () => {
  const validToken = 'ghp_testToken1234567890abcdefghijklmnopqrstuvwxyz';

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
    jest.clearAllMocks();
    core.getInput.mockReturnValue('');
    github.getOctokit.mockReturnValue(mockOctokit);
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

  describe('resolveToken()', () => {
    test('devuelve el token proporcionado sin consultar los inputs', () => {
      expect(resolveToken(validToken)).toBe(validToken);
      expect(core.getInput).not.toHaveBeenCalled();
    });

    test('lee el input cuando el token es undefined', () => {
      core.getInput.mockReturnValue(validToken);

      expect(resolveToken(undefined)).toBe(validToken);
      expect(core.getInput).toHaveBeenCalledWith('github-token', { required: true });
    });

    test('conserva null para que la validación lo rechace sin consultar los inputs', () => {
      expect(resolveToken(null)).toBeNull();
      expect(core.getInput).not.toHaveBeenCalled();
    });

    test('conserva una cadena vacía para que la validación la rechace', () => {
      expect(resolveToken('')).toBe('');
      expect(core.getInput).not.toHaveBeenCalled();
    });
  });

  describe('createGitHubClient()', () => {
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

    test('rechaza null sin consultar los inputs ni inicializar Octokit', () => {
      expect(() => createGitHubClient(null)).toThrow(/token.*requerido/i);
      expect(core.getInput).not.toHaveBeenCalled();
      expect(core.setSecret).not.toHaveBeenCalled();
      expect(github.getOctokit).not.toHaveBeenCalled();
    });

    test('falla si no se proporciona token y core.getInput devuelve vacío', () => {
      core.getInput.mockReturnValue('');

      expect(() => createGitHubClient()).toThrow(/token.*requerido/i);
      expect(github.getOctokit).not.toHaveBeenCalled();
    });

    test('rechaza un token vacío explícito sin enmascarar ni inicializar Octokit', () => {
      expect(() => createGitHubClient('')).toThrow(/token.*requerido/i);
      expect(core.setSecret).not.toHaveBeenCalled();
      expect(github.getOctokit).not.toHaveBeenCalled();
    });

    test('rechaza un token con solo espacios sin enmascarar ni inicializar Octokit', () => {
      expect(() => createGitHubClient('   ')).toThrow(/token.*requerido/i);
      expect(core.setSecret).not.toHaveBeenCalled();
      expect(github.getOctokit).not.toHaveBeenCalled();
    });

    test('acepta null en las opciones y usa un objeto vacío', () => {
      const client = createGitHubClient(validToken, null);

      expect(github.getOctokit).toHaveBeenCalledWith(validToken, {});
      expect(client).toBe(mockOctokit);
    });

    test('rechaza opciones que no son un objeto', () => {
      expect(() => createGitHubClient(validToken, [])).toThrow(/opciones/i);
      expect(() => createGitHubClient(validToken, 'opciones')).toThrow(/opciones/i);
      expect(core.setSecret).not.toHaveBeenCalled();
      expect(github.getOctokit).not.toHaveBeenCalled();
    });
  });
});
