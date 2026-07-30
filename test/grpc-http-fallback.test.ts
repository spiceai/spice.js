/**
 * Unit tests for the gRPC → HTTP fallback in sql()
 *
 * When the Arrow Flight channel initializes but the query itself fails
 * (e.g. gRPC is degraded mid-query in serverless environments), sql()
 * should fall back to HTTP — unless flightOnly is set or partial results
 * were already streamed to the caller.
 */
import { Table } from 'apache-arrow';
import { SpiceClient } from '../src/index.node';

const HTTP_URL = 'http://localhost:8090';

const mockHttpResponse = {
  schema: [{ name: 'answer', data_type: 'Int32' }],
  rows: [[42]],
};

const grpcQueryError = new Error('undefined undefined: undefined');

describe('gRPC to HTTP fallback', () => {
  let fetchMock: jest.Mock;

  function makeClient(config: Record<string, unknown> = {}): SpiceClient {
    const client = new SpiceClient({
      apiKey: 'test-key',
      httpUrl: HTTP_URL,
      logging: false,
      ...config,
    });
    client.setMaxRetries(0);

    // gRPC channel initializes, but the query itself fails
    (client as any)._grpcClient = {
      ensureInitialized: jest.fn().mockResolvedValue(true),
      executeQuery: jest.fn().mockRejectedValue(grpcQueryError),
    };

    // Replace the platform adapter on this instance only, so the shared
    // module singleton is not mutated
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify(mockHttpResponse),
      json: async () => mockHttpResponse,
    });
    (client as any)._platform = {
      ...(client as any)._platform,
      fetch: fetchMock,
    };

    return client;
  }

  test('falls back to HTTP when the Flight query fails before any data is sent', async () => {
    const client = makeClient();

    const table = await client.sql('SELECT 42 as answer');

    expect(table.toArray().map((row: any) => Number(row.answer))).toEqual([42]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${HTTP_URL}/v1/sql`);
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      sql: 'SELECT 42 as answer',
      parameters: [],
    });
  });

  test('rejects without falling back when flightOnly is enabled', async () => {
    const client = makeClient({ flightOnly: true });

    await expect(client.sql('SELECT 1')).rejects.toThrow(
      'undefined undefined: undefined',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('rejects without falling back when partial data was already streamed', async () => {
    const client = makeClient();

    const partialChunk = { fake: 'table' } as unknown as Table;
    jest
      .spyOn(client as any, 'doGrpcQueryRequest')
      .mockImplementation(async (...args: any[]) => {
        const onData = args[2] as (table: Table) => void;
        onData(partialChunk);
        throw grpcQueryError;
      });

    const received: Table[] = [];
    await expect(
      client.sql('SELECT 1', (table) => received.push(table)),
    ).rejects.toThrow('undefined undefined: undefined');

    expect(received).toEqual([partialChunk]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('propagates the HTTP error when the fallback also fails', async () => {
    const client = makeClient();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      headers: { get: () => 'text/plain' },
      text: async () => 'service unavailable',
    });

    await expect(client.sql('SELECT 1')).rejects.toThrow(
      'HTTP query failed with status 503: service unavailable',
    );
  });
});
