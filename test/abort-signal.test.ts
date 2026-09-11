/**
 * Cancellation: a signal passed to a query must end the request, not merely
 * stop the caller awaiting it. Racing the returned promise against a timer
 * leaves the query running on the server, and the next call stacks another on
 * top of it.
 */

import { createServer, type Server } from 'http';
import { SpiceClient } from '../src';
import { retryWithExponentialBackoff } from '../src/retry.node';

const mockFetch = jest.fn();

const httpResponse = (body: unknown): unknown => ({
  ok: true,
  status: 200,
  statusText: '',
  headers: { get: () => null },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe('query cancellation', () => {
  let client: SpiceClient;

  beforeEach(() => {
    client = new SpiceClient({
      apiKey: 'test-api-key',
      httpUrl: 'http://localhost:8090',
      httpOnly: true,
    });
    (client as any)._platform = { fetch: mockFetch };
    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('passes sql() options.signal to the transport', async () => {
    mockFetch.mockResolvedValue(httpResponse({ data: [] }));
    const controller = new AbortController();

    await client.sql('SELECT 1', { signal: controller.signal });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8090/v1/sql',
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('passes sqlJson() options.signal to the transport', async () => {
    mockFetch.mockResolvedValue(
      httpResponse({ row_count: 0, schema: { fields: [] }, data: [] }),
    );
    const controller = new AbortController();

    await client.sqlJson('SELECT 1', { signal: controller.signal });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8090/v1/sql',
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('still accepts the legacy sqlJson(sql, headers, options) form', async () => {
    mockFetch.mockResolvedValue(
      httpResponse({ row_count: 0, schema: { fields: [] }, data: [] }),
    );
    const controller = new AbortController();

    await client.sqlJson(
      'SELECT 1',
      { 'x-trace': 'abc' },
      {
        signal: controller.signal,
      },
    );

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8090/v1/sql',
      expect.objectContaining({
        signal: controller.signal,
        headers: expect.objectContaining({ 'x-trace': 'abc' }),
      }),
    );
  });

  it('reads headers from the options object', async () => {
    mockFetch.mockResolvedValue(
      httpResponse({ row_count: 0, schema: { fields: [] }, data: [] }),
    );

    await client.sqlJson('SELECT 1', { headers: { 'x-trace': 'xyz' } });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8090/v1/sql',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-trace': 'xyz' }),
      }),
    );
  });

  it('treats a bare second argument as headers, as it always did', async () => {
    mockFetch.mockResolvedValue(
      httpResponse({ row_count: 0, schema: { fields: [] }, data: [] }),
    );

    await client.sqlJson('SELECT 1', { 'x-trace': 'legacy' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8090/v1/sql',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-trace': 'legacy' }),
      }),
    );
  });

  it('throws the reason without issuing a request when pre-aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.sql('SELECT 1', { signal: controller.signal }),
    ).rejects.toBe(controller.signal.reason);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends no signal when the caller supplies none', async () => {
    mockFetch.mockResolvedValue(httpResponse({ data: [] }));

    await client.sql('SELECT 1');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8090/v1/sql',
      expect.objectContaining({ signal: undefined }),
    );
  });

  it('does not retry a query the caller aborted', async () => {
    let attempts = 0;
    const operation = () => {
      attempts++;
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    };

    await expect(retryWithExponentialBackoff(operation, 3)).rejects.toThrow(
      'The operation was aborted',
    );
    expect(attempts).toBe(1);
  });

  it('does not retry a query its timeout cancelled', async () => {
    let attempts = 0;
    const operation = () => {
      attempts++;
      const error = new Error('The operation timed out');
      error.name = 'TimeoutError';
      return Promise.reject(error);
    };

    await expect(retryWithExponentialBackoff(operation, 3)).rejects.toThrow(
      'The operation timed out',
    );
    expect(attempts).toBe(1);
  });
});

describe('query cancellation over a real socket', () => {
  let server: Server;
  let port: number;
  let clientHungUp: boolean;

  beforeEach(async () => {
    clientHungUp = false;
    server = createServer((req, res) => {
      req.on('aborted', () => {
        clientHungUp = true;
      });
      res.on('close', () => {
        if (!res.writableFinished) clientHungUp = true;
      });
      // A query that outlives the caller's patience.
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ row_count: 0, schema: { fields: [] }, data: [] }),
        );
      }, 10_000).unref();
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    port = (server.address() as { port: number }).port;
  });

  afterEach(() => {
    server.close();
  });

  it("rejects with the caller's abort reason, verbatim", async () => {
    const client = new SpiceClient({
      httpUrl: `http://127.0.0.1:${port}`,
      httpOnly: true,
      logging: false,
    });
    const controller = new AbortController();
    const reason = new Error('query budget exceeded');
    const pending = client.sql('SELECT 1', { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 100));
    controller.abort(reason);

    // node-fetch raises its own AbortError; the SDK restores the reason.
    await expect(pending).rejects.toBe(reason);
  }, 20_000);

  it('preserves a non-Error abort reason', async () => {
    const client = new SpiceClient({
      httpUrl: `http://127.0.0.1:${port}`,
      httpOnly: true,
      logging: false,
    });
    const controller = new AbortController();
    const pending = client.sql('SELECT 1', { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 100));
    controller.abort('too slow');

    await expect(pending).rejects.toBe('too slow');
  }, 20_000);

  it('aborts the in-flight request, rather than abandoning it', async () => {
    const client = new SpiceClient({
      httpUrl: `http://127.0.0.1:${port}`,
      httpOnly: true,
      logging: false,
    });

    await expect(
      client.sqlJson('SELECT 1', undefined, {
        signal: AbortSignal.timeout(300),
      }),
    ).rejects.toThrow();

    // Let the socket teardown reach the server.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(clientHungUp).toBe(true);
  }, 20_000);
});
