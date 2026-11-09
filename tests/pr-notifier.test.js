const { buildReportBody, notifyPullRequest } = require('../src/reporter/pr-notifier');

function createClientMock() {
  return {
    rest: {
      issues: {
        createComment: jest.fn().mockResolvedValue({ data: { id: 123 } }),
        updateComment: jest.fn().mockResolvedValue({ data: { id: 456 } }),
      },
    },
  };
}

describe('HU08-T03 - Publicar la información de las revisiones', () => {
  describe('buildReportBody', () => {
    test('respeta el cuerpo explícito del informe', () => {
      expect(buildReportBody({ body: 'Informe personalizado' })).toBe('Informe personalizado');
    });

    test('genera un informe legible a partir del análisis de autoría', () => {
      const body = buildReportBody({
        authorship: { total: 10, human: 6, aiAssisted: 3, unknown: 1 },
        thresholdAi: 50,
      });

      expect(body).toContain('Total de aportaciones: 10');
      expect(body).toContain('Humanas: 6');
      expect(body).toContain('Asistidas por IA: 3');
      expect(body).toContain('Desconocidas: 1');
      expect(body).toContain('30%');
      expect(body).toContain('Dentro del umbral');
    });

    test('marca revisión requerida cuando se supera el umbral de IA', () => {
      const body = buildReportBody({
        authorship: { total: 4, human: 1, aiAssisted: 3, unknown: 0 },
        thresholdAi: 50,
      });

      expect(body).toContain('75%');
      expect(body).toContain('Revisión requerida');
    });
  });

  describe('notifyPullRequest', () => {
    test('publica un comentario nuevo en el pull request', async () => {
      const client = createClientMock();
      const report = { owner: 'Aoex2612', repo: 'Proyecto-GPS', pullNumber: 3, body: 'Informe' };

      const result = await notifyPullRequest(client, report);

      expect(client.rest.issues.createComment).toHaveBeenCalledWith({
        owner: 'Aoex2612',
        repo: 'Proyecto-GPS',
        issue_number: 3,
        body: 'Informe',
      });
      expect(client.rest.issues.updateComment).not.toHaveBeenCalled();
      expect(result).toEqual({ published: true, updated: false, commentId: 123 });
    });

    test('actualiza el comentario existente para no duplicar informes', async () => {
      const client = createClientMock();
      const report = {
        owner: 'Aoex2612',
        repo: 'Proyecto-GPS',
        pullNumber: 3,
        commentId: 99,
        body: 'Informe actualizado',
      };

      const result = await notifyPullRequest(client, report);

      expect(client.rest.issues.updateComment).toHaveBeenCalledWith({
        owner: 'Aoex2612',
        repo: 'Proyecto-GPS',
        issue_number: 3,
        comment_id: 99,
        body: 'Informe actualizado',
      });
      expect(client.rest.issues.createComment).not.toHaveBeenCalled();
      expect(result).toEqual({ published: true, updated: true, commentId: 456 });
    });

    test('rechaza un cliente de GitHub no válido', async () => {
      await expect(notifyPullRequest(null, {})).rejects.toThrow('Cliente de GitHub no válido');
    });

    test('rechaza informes sin datos del pull request', async () => {
      const client = createClientMock();

      await expect(notifyPullRequest(client, { body: 'Informe' })).rejects.toThrow(
        'owner, repo y pullNumber',
      );
    });
  });
});
