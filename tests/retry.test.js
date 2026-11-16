const { withRetry } = require('../src/utils/retry');

describe('withRetry', () => {
  test('returns the result without waiting when the operation succeeds', async () => {
    const operation = jest.fn().mockResolvedValue('done');
    const sleep = jest.fn();

    await expect(withRetry(operation, { sleep })).resolves.toBe('done');
    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  test('retries transient server failures with exponential delays', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockRejectedValueOnce({ status: 500 })
      .mockResolvedValue('done');
    const sleep = jest.fn().mockResolvedValue();
    const logger = { warning: jest.fn() };

    await expect(
      withRetry(operation, {
        baseDelayMs: 100,
        maxDelayMs: 500,
        sleep,
        logger,
      }),
    ).resolves.toBe('done');

    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[100], [200]]);
    expect(logger.warning).toHaveBeenCalledTimes(2);
  });

  test('respects the Retry-After response header', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce({
        status: 429,
        response: { headers: { 'retry-after': '3' } },
      })
      .mockResolvedValue('done');
    const sleep = jest.fn().mockResolvedValue();

    await expect(withRetry(operation, { sleep })).resolves.toBe('done');

    expect(sleep).toHaveBeenCalledWith(3000);
  });

  test('retries network failures and rate-limited GitHub requests', async () => {
    const networkError = Object.assign(new Error('Connection reset'), { code: 'ECONNRESET' });
    const rateLimitError = {
      status: 403,
      response: { headers: { 'x-ratelimit-remaining': 0, 'x-ratelimit-reset': '10' } },
    };
    const operation = jest
      .fn()
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValue('done');
    const sleep = jest.fn().mockResolvedValue();
    jest.spyOn(Date, 'now').mockReturnValue(0);

    try {
      await expect(withRetry(operation, { sleep })).resolves.toBe('done');
    } finally {
      jest.restoreAllMocks();
    }

    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 1000);
    expect(sleep).toHaveBeenNthCalledWith(2, 10000);
  });

  test('does not retry non-transient errors', async () => {
    const error = { status: 401, message: 'Bad credentials' };
    const operation = jest.fn().mockRejectedValue(error);
    const sleep = jest.fn();

    await expect(withRetry(operation, { sleep })).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  test('rethrows the last error after the configured number of attempts', async () => {
    const error = { status: 503, message: 'Unavailable' };
    const operation = jest.fn().mockRejectedValue(error);
    const sleep = jest.fn().mockResolvedValue();

    await expect(withRetry(operation, { maxAttempts: 2, sleep })).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  test('rejects invalid retry configuration', async () => {
    await expect(withRetry(jest.fn(), { maxAttempts: 0 })).rejects.toThrow(
      'maxAttempts debe ser un entero positivo',
    );
    await expect(withRetry(null)).rejects.toThrow('operation debe ser una función');
  });
});
