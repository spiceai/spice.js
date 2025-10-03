/**
 * Browser retry logic tests
 */

import {
  retryWithExponentialBackoff,
  dontRetry,
} from '../../src/retry.browser';

describe('Browser Retry Logic', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('retryWithExponentialBackoff', () => {
    test('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const promise = retryWithExponentialBackoff(operation, 3);
      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should retry on failure and succeed', async () => {
      const error: any = new Error('fail');
      error.status = 500; // Make it retryable

      const operation = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const promise = retryWithExponentialBackoff(operation, 3);

      // Fast-forward through retry delays
      await jest.runAllTimersAsync();

      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    test('should exhaust all retries and throw last error', async () => {
      const error: any = new Error('persistent failure');
      error.status = 500; // Make it retryable

      const operation = jest.fn().mockRejectedValue(error);

      // Create the promise and immediately start advancing timers
      const promise = retryWithExponentialBackoff(operation, 2);

      // Use advanceTimersByTimeAsync to let the promise actually reject between timer advances
      let rejection: any;
      promise.catch((err) => {
        rejection = err;
      });

      // Advance through all the delays
      await jest.advanceTimersByTimeAsync(10000);

      // Now check the rejection
      expect(rejection).toBeDefined();
      expect(rejection.message).toBe('persistent failure');
      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    test('should not retry when maxRetries is 0', async () => {
      const error = new Error('fail');
      const operation = jest.fn().mockRejectedValue(error);

      const promise = retryWithExponentialBackoff(operation, 0);

      await expect(promise).rejects.toThrow('fail');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should throw error for negative maxRetries', async () => {
      const operation = jest.fn();

      await expect(retryWithExponentialBackoff(operation, -1)).rejects.toThrow(
        'maxRetries must be greater than or equal to 0'
      );

      expect(operation).not.toHaveBeenCalled();
    });

    test('should not retry when error is marked as permanent', async () => {
      const error: any = new Error('permanent error');
      dontRetry(error);

      const operation = jest.fn().mockRejectedValue(error);

      const promise = retryWithExponentialBackoff(operation, 3);

      await expect(promise).rejects.toThrow('permanent error');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should retry on 500 server errors', async () => {
      const error: any = new Error('Server error');
      error.status = 500;

      const operation = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const promise = retryWithExponentialBackoff(operation, 3);

      await jest.runAllTimersAsync();

      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    test('should retry on 503 service unavailable', async () => {
      const error: any = new Error('Service unavailable');
      error.status = 503;

      const operation = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const promise = retryWithExponentialBackoff(operation, 3);

      await jest.runAllTimersAsync();

      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    test('should retry on 408 request timeout', async () => {
      const error: any = new Error('Request timeout');
      error.status = 408;

      const operation = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const promise = retryWithExponentialBackoff(operation, 3);

      await jest.runAllTimersAsync();

      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    test('should retry on 429 too many requests', async () => {
      const error: any = new Error('Too many requests');
      error.status = 429;

      const operation = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const promise = retryWithExponentialBackoff(operation, 3);

      await jest.runAllTimersAsync();

      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    test('should not retry on 400 bad request', async () => {
      const error: any = new Error('Bad request');
      error.status = 400;

      const operation = jest.fn().mockRejectedValue(error);

      const promise = retryWithExponentialBackoff(operation, 3);

      await expect(promise).rejects.toThrow('Bad request');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should not retry on 404 not found', async () => {
      const error: any = new Error('Not found');
      error.status = 404;

      const operation = jest.fn().mockRejectedValue(error);

      const promise = retryWithExponentialBackoff(operation, 3);

      await expect(promise).rejects.toThrow('Not found');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('dontRetry', () => {
    test('should mark error as non-retryable', () => {
      const error: any = new Error('test');
      dontRetry(error);

      expect(error._SPICE_NO_RETRY).toBe(true);
    });

    test('should prevent retries for marked errors', async () => {
      const error: any = new Error('marked error');
      error.status = 500; // Would normally be retried
      dontRetry(error);

      const operation = jest.fn().mockRejectedValue(error);

      const promise = retryWithExponentialBackoff(operation, 3);

      await expect(promise).rejects.toThrow('marked error');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });
});
