/**
 * Unit tests for SpiceClient.query()/queryWithParams() (async queries) and AsyncQuery.
 */

import { SpiceClient } from '../src';
import type { AsyncQuery } from '../src';

const mockFetch = jest.fn();

describe('SpiceClient.query() (async submit)', () => {
  let client: SpiceClient;

  beforeEach(() => {
    client = new SpiceClient({
      apiKey: 'test-api-key',
      httpUrl: 'http://localhost:8090',
    });
    (client as any)._platform = { fetch: mockFetch };
    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should POST to /v1/queries and return an AsyncQuery handle', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({
        query_id: 'q-1',
        status: 'PENDING',
        status_url: '/v1/queries/q-1/status',
        results_url: '/v1/queries/q-1/results',
      }),
    });

    const job = await client.query('SELECT * FROM large_table');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8090/v1/queries',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ sql: 'SELECT * FROM large_table' }),
      }),
    );
    expect(job.queryId).toBe('q-1');
    expect(job.lastKnownStatus).toBe('PENDING');
  });

  it('should include parameters when provided via queryWithParams', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({
        query_id: 'q-2',
        status: 'PENDING',
        status_url: '/x',
        results_url: '/y',
      }),
    });

    await client.queryWithParams('SELECT * FROM t WHERE id = $1', [123]);

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body).toEqual({ sql: 'SELECT * FROM t WHERE id = $1', parameters: [123] });
  });

  it('should throw if query text is empty, without making a request', async () => {
    await expect(client.query('')).rejects.toThrow(
      'query text is required for query operation',
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should throw if HTTP URL is not configured', async () => {
    const clientNoHttp = new SpiceClient({ flightUrl: 'grpc://localhost:50051' });
    (clientNoHttp as any)._httpUrl = undefined;

    await expect(clientNoHttp.query('SELECT 1')).rejects.toThrow(
      'HTTP URL is required for async query operations',
    );
  });

  it('should surface a 503 (cluster mode required) clearly', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: async () => 'Async queries API requires distributed mode',
    });

    await expect(client.query('SELECT 1')).rejects.toThrow(
      'Async queries are not available: 503',
    );
  });
});

describe('AsyncQuery', () => {
  let client: SpiceClient;

  beforeEach(() => {
    client = new SpiceClient({
      apiKey: 'test-api-key',
      httpUrl: 'http://localhost:8090',
    });
    (client as any)._platform = { fetch: mockFetch };
    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function submit(): Promise<AsyncQuery> {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: async () => ({
        query_id: 'q-1',
        status: 'PENDING',
        status_url: '/v1/queries/q-1/status',
        results_url: '/v1/queries/q-1/results',
      }),
    });
    return client.query('SELECT * FROM t');
  }

  it('status() should poll /v1/queries/{id}/status', async () => {
    const job = await submit();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'RUNNING' }),
    });

    const status = await job.status();

    expect(status).toBe('RUNNING');
    expect(mockFetch).toHaveBeenLastCalledWith(
      'http://localhost:8090/v1/queries/q-1/status',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('waitForCompletion() should poll through Pending -> Running -> Succeeded', async () => {
    const job = await submit();
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'PENDING' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'RUNNING' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'SUCCEEDED' }) });

    const status = await job.waitForCompletion({ pollIntervalMs: 1 });

    expect(status).toBe('SUCCEEDED');
  });

  it('waitForCompletion() should time out against a query that never terminates', async () => {
    const job = await submit();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'RUNNING' }),
    });

    await expect(
      job.waitForCompletion({ pollIntervalMs: 1, timeoutMs: 5 }),
    ).rejects.toThrow(/Timed out waiting for query q-1/);
  });

  it('results() should follow next_chunk_index across multiple chunks and concatenate rows', async () => {
    const job = await submit();
    mockFetch
      // waitForCompletion -> status()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'SUCCEEDED' }) })
      // getQuery() -> manifest + first chunk
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'SUCCEEDED',
          manifest: {
            format: 'ARROW_IPC',
            schema: {
              column_count: 1,
              columns: [{ name: 'id', type_name: 'Int64', nullable: false, position: 0 }],
            },
            total_row_count: 3,
            total_chunk_count: 2,
          },
          result: {
            chunk_index: 0,
            row_offset: 0,
            row_count: 2,
            next_chunk_index: 1,
            next_chunk_url: '/v1/queries/q-1/results/chunks/1',
            data_array: [{ id: 1 }, { id: 2 }],
          },
        }),
      })
      // getChunk(1)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chunk_index: 1,
          row_offset: 2,
          row_count: 1,
          data_array: [{ id: 3 }],
        }),
      });

    const table = await job.results();

    expect(table.numRows).toBe(3);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8090/v1/queries/q-1/results/chunks/1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('results() should return an empty table for a genuinely empty result', async () => {
    const job = await submit();
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'SUCCEEDED' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'SUCCEEDED',
          manifest: {
            format: 'ARROW_IPC',
            schema: { column_count: 1, columns: [{ name: 'id', type_name: 'Int64', nullable: false, position: 0 }] },
            total_row_count: 0,
            total_chunk_count: 0,
          },
          // No `result` field at all: the runtime never wrote a chunk 0.
        }),
      });

    const table = await job.results();

    expect(table.numRows).toBe(0);
  });

  it('results() should throw with the error detail when the job failed', async () => {
    const job = await submit();
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'FAILED' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'FAILED',
          error: { error_code: 'EXECUTION_FAILED', message: 'table not found' },
        }),
      });

    await expect(job.results()).rejects.toThrow(
      'Async query q-1 failed: EXECUTION_FAILED: table not found',
    );
  });

  it('cancel() should update the job status from the response', async () => {
    const job = await submit();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ query_id: 'q-1', status: 'CANCELLED' }),
    });

    await job.cancel();

    expect(job.lastKnownStatus).toBe('CANCELLED');
    expect(mockFetch).toHaveBeenLastCalledWith(
      'http://localhost:8090/v1/queries/q-1/cancel',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
