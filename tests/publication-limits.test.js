const {
  isRateLimitError,
  resolveRetryDelayMs,
  publishContinuously,
} = require('../src/reporter/publication-limits');

function rateLimitError({ status = 429, headers = {}, message = 'API rate limit exceeded' } = {}) {
  return Object.assign(new Error(message), {
    status,
    response: { status, headers, data: { message } },
  });
}

function createClientMock() {
  return {
    rest: {
      issues: {
        createComment: jest.fn().mockResolvedValue({ data: { id: 123 } }),
        updateComment: jest.fn().mockResolvedValue({ data: { id: 456 } }),
        listComments: jest.fn().mockResolvedValue({ data: [] }),
      },
    },
  };
}

function buildReports(count) {
  return Array.from({ length: count }, (_value, index) => ({
    owner: 'Aoex2612',
    repo: 'Proyecto-GPS',
    pullNumber: index + 1,
    body: `Informe ${index + 1}`,
  }));
}

describe('HU08-T05 - Publicación continua sin límites de uso propios', () => {
  describe('isRateLimitError', () => {
    test('reconoce un error 429 como límite de uso', () => {
      expect(isRateLimitError(rateLimitError({ status: 429 }))).toBe(true);
    });

    test('reconoce el límite primario devuelto como 403', () => {
      const error = rateLimitError({ status: 403, message: 'API rate limit exceeded for user.' });

      expect(isRateLimitError(error)).toBe(true);
    });

    test('reconoce el límite secundario por su mensaje', () => {
      const error = rateLimitError({
        status: 403,
        message: 'You have exceeded a secondary rate limit. Please wait a few minutes.',
      });

      expect(isRateLimitError(error)).toBe(true);
    });

    test('reconoce un 403 sin cuota restante', () => {
      const error = rateLimitError({
        status: 403,
        message: 'Forbidden',
        headers: { 'x-ratelimit-remaining': '0' },
      });

      expect(isRateLimitError(error)).toBe(true);
    });

    test('reconoce un 403 con cabecera retry-after', () => {
      const error = rateLimitError({
        status: 403,
        message: 'Forbidden',
        headers: { 'Retry-After': '30' },
      });

      expect(isRateLimitError(error)).toBe(true);
    });

    test('no confunde un 403 de permisos con un límite de uso', () => {
      const error = rateLimitError({
        status: 403,
        message: 'Resource not accessible by integration',
        headers: { 'x-ratelimit-remaining': '4999' },
      });

      expect(isRateLimitError(error)).toBe(false);
    });

    test('no trata errores de servidor o de validación como límite de uso', () => {
      expect(isRateLimitError(rateLimitError({ status: 500 }))).toBe(false);
      expect(isRateLimitError(new Error('rate limit'))).toBe(false);
      expect(isRateLimitError(null)).toBe(false);
      expect(isRateLimitError(undefined)).toBe(false);
    });
  });

  describe('resolveRetryDelayMs', () => {
    test('usa la cabecera retry-after en segundos', () => {
      const error = rateLimitError({ headers: { 'retry-after': '2' } });

      expect(resolveRetryDelayMs(error)).toBe(2000);
    });

    test('interpreta retry-after como fecha HTTP', () => {
      const error = rateLimitError({
        headers: { 'retry-after': new Date(10000).toUTCString() },
      });

      expect(resolveRetryDelayMs(error, { now: () => 4000 })).toBe(6000);
    });

    test('calcula la espera con x-ratelimit-reset', () => {
      const error = rateLimitError({ headers: { 'x-ratelimit-reset': '1700000010' } });

      expect(resolveRetryDelayMs(error, { now: () => 1700000000000 })).toBe(10000);
    });

    test('no devuelve esperas negativas cuando el límite ya se ha reiniciado', () => {
      const error = rateLimitError({ headers: { 'x-ratelimit-reset': '1700000000' } });

      expect(resolveRetryDelayMs(error, { now: () => 1700000000000 })).toBe(0);
    });

    test('usa un valor por defecto si el error no trae cabeceras útiles', () => {
      expect(resolveRetryDelayMs(rateLimitError(), { retryDelayMs: 1500 })).toBe(1500);
      expect(
        resolveRetryDelayMs(rateLimitError({ headers: { 'retry-after': 'en un rato' } }), {
          retryDelayMs: 1500,
        }),
      ).toBe(1500);
    });

    test('acota la espera al máximo configurado', () => {
      const error = rateLimitError({ headers: { 'retry-after': '600' } });

      expect(resolveRetryDelayMs(error, { maxRetryDelayMs: 5000 })).toBe(5000);
    });

    test('espera al menos un minuto en un límite secundario sin retry-after', () => {
      const error = rateLimitError({
        status: 403,
        message: 'You have exceeded a secondary rate limit. Please wait a few minutes.',
      });

      expect(resolveRetryDelayMs(error, { retryDelayMs: 1000 })).toBe(60000);
    });

    test('respeta retry-after aunque sea menor que el mínimo secundario', () => {
      const error = rateLimitError({
        status: 403,
        message: 'You have exceeded a secondary rate limit.',
        headers: { 'retry-after': '5' },
      });

      expect(resolveRetryDelayMs(error)).toBe(5000);
    });
  });

  describe('publishContinuously', () => {
    test('publica todos los informes sin imponer un tope propio ni esperas artificiales', async () => {
      const client = createClientMock();
      const reports = buildReports(150);
      const publish = jest.fn().mockResolvedValue({ published: true });
      const wait = jest.fn().mockResolvedValue(undefined);

      const summary = await publishContinuously(client, reports, { publish, wait });

      expect(publish).toHaveBeenCalledTimes(150);
      expect(wait).not.toHaveBeenCalled();
      expect(summary).toMatchObject({ total: 150, published: 150, failed: 0, retries: 0 });
      expect(summary.delays).toEqual([]);
      expect(publish.mock.calls.map((call) => call[1].pullNumber)).toEqual(
        reports.map((report) => report.pullNumber),
      );
    });

    test('reintenta respetando retry-after y termina publicando', async () => {
      const client = createClientMock();
      const publish = jest
        .fn()
        .mockRejectedValueOnce(rateLimitError({ headers: { 'retry-after': '2' } }))
        .mockResolvedValueOnce({ published: true });
      const wait = jest.fn().mockResolvedValue(undefined);

      const summary = await publishContinuously(client, buildReports(1), { publish, wait });

      expect(wait).toHaveBeenCalledTimes(1);
      expect(wait).toHaveBeenCalledWith(2000);
      expect(publish).toHaveBeenCalledTimes(2);
      expect(summary).toMatchObject({ published: 1, failed: 0, retries: 1 });
      expect(summary.delays).toEqual([2000]);
      expect(summary.results[0]).toMatchObject({ status: 'published', attempts: 2 });
    });

    test('agota los intentos y continúa con el resto de informes', async () => {
      const client = createClientMock();
      const publish = jest
        .fn()
        .mockRejectedValueOnce(rateLimitError({ headers: { 'retry-after': '1' } }))
        .mockRejectedValueOnce(rateLimitError({ headers: { 'retry-after': '1' } }))
        .mockRejectedValueOnce(rateLimitError({ headers: { 'retry-after': '1' } }))
        .mockResolvedValueOnce({ published: true });
      const wait = jest.fn().mockResolvedValue(undefined);

      const summary = await publishContinuously(client, buildReports(2), {
        publish,
        wait,
        maxAttempts: 3,
      });

      expect(publish).toHaveBeenCalledTimes(4);
      expect(wait).toHaveBeenCalledTimes(2);
      expect(summary).toMatchObject({ total: 2, published: 1, failed: 1, retries: 2 });
      expect(summary.results[0]).toMatchObject({ status: 'failed', attempts: 3 });
      expect(summary.results[1]).toMatchObject({ status: 'published', attempts: 1 });
    });

    test('aplica un backoff exponencial entre reintentos', async () => {
      const client = createClientMock();
      const publish = jest.fn().mockRejectedValue(rateLimitError());
      const wait = jest.fn().mockResolvedValue(undefined);

      const summary = await publishContinuously(client, buildReports(1), {
        publish,
        wait,
        maxAttempts: 4,
      });

      expect(publish).toHaveBeenCalledTimes(4);
      expect(summary.delays).toEqual([1000, 2000, 4000]);
      expect(summary.failed).toBe(1);
    });

    test('no reintenta errores que no sean límites de uso', async () => {
      const client = createClientMock();
      const publish = jest.fn().mockRejectedValue(new Error('owner, repo y pullNumber'));
      const wait = jest.fn().mockResolvedValue(undefined);

      const summary = await publishContinuously(client, buildReports(1), { publish, wait });

      expect(publish).toHaveBeenCalledTimes(1);
      expect(wait).not.toHaveBeenCalled();
      expect(summary).toMatchObject({ published: 0, failed: 1, retries: 0 });
      expect(summary.results[0].error).toContain('owner, repo y pullNumber');
    });

    test('usa notifyPullRequest por defecto y publica el informe en el PR', async () => {
      const client = createClientMock();
      const wait = jest.fn().mockResolvedValue(undefined);

      const summary = await publishContinuously(client, buildReports(1), { wait });

      expect(client.rest.issues.createComment).toHaveBeenCalledTimes(1);
      expect(summary.published).toBe(1);
      expect(summary.results[0].result).toMatchObject({ published: true, commentId: 123 });
    });

    test('propaga los reintentos a la publicación real en el PR', async () => {
      const client = createClientMock();
      client.rest.issues.listComments
        .mockRejectedValueOnce(rateLimitError({ headers: { 'retry-after': '1' } }))
        .mockResolvedValue({ data: [] });
      const wait = jest.fn().mockResolvedValue(undefined);

      const summary = await publishContinuously(client, buildReports(1), { wait });

      expect(client.rest.issues.createComment).toHaveBeenCalledTimes(1);
      expect(summary).toMatchObject({ published: 1, failed: 0, retries: 1 });
    });

    test('rechaza una lista de informes que no sea un array', async () => {
      const publish = jest.fn();

      await expect(publishContinuously({}, null, { publish })).rejects.toThrow(/array/i);
      await expect(publishContinuously({}, 'informe', { publish })).rejects.toThrow(/array/i);
    });

    test('devuelve un resumen vacío cuando no hay informes', async () => {
      const publish = jest.fn();

      const summary = await publishContinuously({}, [], { publish });

      expect(publish).not.toHaveBeenCalled();
      expect(summary).toMatchObject({ total: 0, published: 0, failed: 0, retries: 0 });
      expect(summary.results).toEqual([]);
    });
  });
});
