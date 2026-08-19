/**
 * Unit tests for listActiveQueries() and cancelActiveQuery()
 */

import { SpiceClient } from '../src';
import type { ActiveQueriesResponse } from '../src';

const mockFetch = jest.fn();

const QUERY_ID = '0198f0a1-9c3d-7c4e-8a11-2b3c4d5e6f70';

/** Build a response double matching what fetchInternal consumes. */
const httpResponse = (
  status: number,
  body?: unknown,
  statusText = '',
): unknown => ({
  ok: status >= 200 && status < 300,
  status,
  statusText,
  json: async () => body,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

describe('SpiceClient.listActiveQueries()', () => {
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

  it('should make a GET request to /v1/sql/active', async () => {
    const body: ActiveQueriesResponse = {
      queries: [
        {
          query_id: QUERY_ID,
          protocol: 'flight',
          sql_preview: 'SELECT * FROM taxi_trips',
          started_at_ms: 1750000000000,
        },
      ],
      total_count: 1,
    };
    mockFetch.mockResolvedValue(httpResponse(200, body));

    const queries = await client.listActiveQueries();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8090/v1/sql/active',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'X-API-Key': 'test-api-key' }),
      }),
    );
    expect(queries).toHaveLength(1);
    expect(queries[0].query_id).toBe(QUERY_ID);
    expect(queries[0].protocol).toBe('flight');
    expect(queries[0].sql_preview).toBe('SELECT * FROM taxi_trips');
    expect(queries[0].started_at_ms).toBe(1750000000000);
  });

  it('should return an empty array when no queries are running', async () => {
    mockFetch.mockResolvedValue(
      httpResponse(200, { queries: [], total_count: 0 }),
    );

    await expect(client.listActiveQueries()).resolves.toEqual([]);
  });

  it('should return an empty array when the payload omits queries', async () => {
    mockFetch.mockResolvedValue(httpResponse(200, { total_count: 0 }));

    await expect(client.listActiveQueries()).resolves.toEqual([]);
  });

  it('should name the credential problem on 403', async () => {
    mockFetch.mockResolvedValue(httpResponse(403, 'forbidden', 'Forbidden'));

    await expect(client.listActiveQueries()).rejects.toThrow(/write access/);
  });

  it('should surface the status on an unexpected failure', async () => {
    mockFetch.mockResolvedValue(
      httpResponse(500, 'boom', 'Internal Server Error'),
    );

    await expect(client.listActiveQueries()).rejects.toThrow(/500/);
  });

  it('should require an HTTP URL', async () => {
    const noHttp = new SpiceClient({ apiKey: 'test-api-key' });
    (noHttp as any)._httpUrl = '';

    await expect(noHttp.listActiveQueries()).rejects.toThrow(/HTTP URL/);
  });
});

describe('SpiceClient.cancelActiveQuery()', () => {
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

  it('should make a POST request to /v1/sql/{query_id}/cancel', async () => {
    mockFetch.mockResolvedValue(
      httpResponse(200, { query_id: QUERY_ID, status: 'cancelled' }),
    );

    const result = await client.cancelActiveQuery(QUERY_ID);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      `http://localhost:8090/v1/sql/${QUERY_ID}/cancel`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.status).toBe('cancelled');
    expect(result.query_id).toBe(QUERY_ID);
  });

  it('should reject an empty query id without sending a request', async () => {
    await expect(client.cancelActiveQuery('')).rejects.toThrow(
      /listActiveQueries/,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should point at listActiveQueries on 400', async () => {
    mockFetch.mockResolvedValue(httpResponse(400, 'bad', 'Bad Request'));

    await expect(client.cancelActiveQuery('not-a-uuid')).rejects.toThrow(
      /not a valid UUID/,
    );
  });

  it('should name the credential problem on 403', async () => {
    mockFetch.mockResolvedValue(httpResponse(403, 'forbidden', 'Forbidden'));

    await expect(client.cancelActiveQuery(QUERY_ID)).rejects.toThrow(
      /write access/,
    );
  });

  it('should explain both causes on 404', async () => {
    mockFetch.mockResolvedValue(httpResponse(404, 'missing', 'Not Found'));

    await expect(client.cancelActiveQuery(QUERY_ID)).rejects.toThrow(
      /already finished/,
    );
  });

  it('should surface the status on an unexpected failure', async () => {
    mockFetch.mockResolvedValue(
      httpResponse(500, 'boom', 'Internal Server Error'),
    );

    await expect(client.cancelActiveQuery(QUERY_ID)).rejects.toThrow(/500/);
  });

  it('should encode a query id containing URL-significant characters', async () => {
    mockFetch.mockResolvedValue(
      httpResponse(200, { query_id: 'a/b', status: 'cancelled' }),
    );

    await client.cancelActiveQuery('a/b');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8090/v1/sql/a%2Fb/cancel',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('should require an HTTP URL', async () => {
    const noHttp = new SpiceClient({ apiKey: 'test-api-key' });
    (noHttp as any)._httpUrl = '';

    await expect(noHttp.cancelActiveQuery(QUERY_ID)).rejects.toThrow(
      /HTTP URL/,
    );
  });
});
