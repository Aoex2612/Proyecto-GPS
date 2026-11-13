const { REPORT_MARKER, buildReportBody, notifyPullRequest } = require('../src/reporter/pr-notifier');

function createClientMock(existingComments = []) {
  return {
    rest: {
      issues: {
        createComment: jest.fn().mockResolvedValue({ data: { id: 123 } }),
        updateComment: jest.fn().mockResolvedValue({ data: { id: 456 } }),
        listComments: jest.fn().mockResolvedValue({ data: existingComments }),
      },
    },
  };
}

describe('HU08-T03 - Publicar la información de las revisiones', () => {
  describe('buildReportBody', () => {
    test('respeta el cuerpo explícito del informe y le añade la marca', () => {
      expect(buildReportBody({ body: 'Informe personalizado' })).toBe(
        `Informe personalizado\n\n${REPORT_MARKER}`,
      );
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
      expect(body).toContain(REPORT_MARKER);
    });

    test('marca revisión requerida cuando se supera el umbral de IA', () => {
      const body = buildReportBody({
        authorship: { total: 4, human: 1, aiAssisted: 3, unknown: 0 },
        thresholdAi: 50,
      });

      expect(body).toContain('75%');
      expect(body).toContain('Revisión requerida');
    });

    test('deduce el total cuando el informe no lo trae', () => {
      const body = buildReportBody({
        authorship: { human: 8, aiAssisted: 2, unknown: 1 },
        thresholdAi: 50,
      });

      expect(body).toContain('Total de aportaciones: 11');
      expect(body).toContain('18.2%');
      expect(body).toContain('Dentro del umbral');
    });

    test('no redondea a la baja un porcentaje que supera el umbral', () => {
      const body = buildReportBody({
        authorship: { total: 250, human: 124, aiAssisted: 126, unknown: 0 },
        thresholdAi: 50,
      });

      expect(body).toContain('50.4%');
      expect(body).toContain('Revisión requerida');
    });

    test('usa el umbral por defecto cuando el informe no lo trae', () => {
      const body = buildReportBody({ authorship: { total: 2, human: 1, aiAssisted: 1 } });

      expect(body).toContain('umbral 50%');
    });

    test('trata un umbral vacío, nulo o no numérico como el valor por defecto', () => {
      const authorship = { total: 2, human: 1, aiAssisted: 1 };

      expect(buildReportBody({ authorship, thresholdAi: '' })).toContain('umbral 50%');
      expect(buildReportBody({ authorship, thresholdAi: null })).toContain('umbral 50%');
      expect(buildReportBody({ authorship, thresholdAi: 'alto' })).toContain('umbral 50%');
    });

    test('no declara «dentro del umbral» cuando no hay datos que clasificar', () => {
      const body = buildReportBody({});

      expect(body).toContain('Sin datos para clasificar');
      expect(body).not.toContain('Dentro del umbral');
    });

    test('no duplica la marca si el cuerpo ya la incluye', () => {
      expect(buildReportBody({ body: `Informe\n\n${REPORT_MARKER}` })).toBe(
        `Informe\n\n${REPORT_MARKER}`,
      );
    });

    test('acota el umbral al rango 0-100', () => {
      const body = buildReportBody({
        authorship: { total: 1, human: 0, aiAssisted: 1, unknown: 0 },
        thresholdAi: 150,
      });

      expect(body).toContain('umbral 100%');
      expect(body).toContain('Dentro del umbral');
    });
  });

  describe('notifyPullRequest', () => {
    test('publica un comentario nuevo en el pull request', async () => {
      const client = createClientMock();
      const report = { owner: 'Aoex2612', repo: 'Proyecto-GPS', pullNumber: 3, body: 'Informe' };

      const result = await notifyPullRequest(client, report);

      expect(client.rest.issues.listComments).toHaveBeenCalledWith({
        owner: 'Aoex2612',
        repo: 'Proyecto-GPS',
        issue_number: 3,
        per_page: 100,
      });
      expect(client.rest.issues.createComment).toHaveBeenCalledWith({
        owner: 'Aoex2612',
        repo: 'Proyecto-GPS',
        issue_number: 3,
        body: `Informe\n\n${REPORT_MARKER}`,
      });
      expect(client.rest.issues.updateComment).not.toHaveBeenCalled();
      expect(result).toEqual({ published: true, updated: false, commentId: 123 });
    });

    test('actualiza el informe de una ejecución anterior para no duplicarlo', async () => {
      const client = createClientMock([
        { id: 10, body: 'Comentario de un revisor' },
        { id: 99, body: `## Informe de autoría\n\n${REPORT_MARKER}` },
      ]);
      const report = { owner: 'Aoex2612', repo: 'Proyecto-GPS', pullNumber: 3, body: 'Informe nuevo' };

      const result = await notifyPullRequest(client, report);

      expect(client.rest.issues.updateComment).toHaveBeenCalledWith({
        owner: 'Aoex2612',
        repo: 'Proyecto-GPS',
        comment_id: 99,
        body: `Informe nuevo\n\n${REPORT_MARKER}`,
      });
      expect(client.rest.issues.createComment).not.toHaveBeenCalled();
      expect(result).toEqual({ published: true, updated: true, commentId: 456 });
    });

    test('usa el commentId explícito sin buscar en el historial', async () => {
      const client = createClientMock();
      const report = {
        owner: 'Aoex2612',
        repo: 'Proyecto-GPS',
        pullNumber: 3,
        commentId: 99,
        body: 'Informe actualizado',
      };

      const result = await notifyPullRequest(client, report);

      expect(client.rest.issues.listComments).not.toHaveBeenCalled();
      expect(client.rest.issues.updateComment).toHaveBeenCalledWith({
        owner: 'Aoex2612',
        repo: 'Proyecto-GPS',
        comment_id: 99,
        body: `Informe actualizado\n\n${REPORT_MARKER}`,
      });
      expect(result).toEqual({ published: true, updated: true, commentId: 456 });
    });

    test('rechaza un cliente de GitHub no válido', async () => {
      await expect(notifyPullRequest(null, {})).rejects.toThrow('Cliente de GitHub no válido');
    });

    test('rechaza un cliente sin las llamadas necesarias', async () => {
      const client = { rest: { issues: { createComment: jest.fn() } } };

      await expect(notifyPullRequest(client, {})).rejects.toThrow('Cliente de GitHub no válido');
    });

    test('rechaza informes sin datos del pull request', async () => {
      const client = createClientMock();

      await expect(notifyPullRequest(client, { body: 'Informe' })).rejects.toThrow(
        'owner, repo y pullNumber',
      );
    });
  });
});
