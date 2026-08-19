/**
 * Unit tests for the nsql() and nsqlGenerateSql() functions
 */

import { SpiceClient } from '../src';
import type { NsqlResponse } from '../src';

// Mock fetch for testing
const mockFetch = jest.fn();

describe('SpiceClient.nsql()', () => {
  let client: SpiceClient;

  beforeEach(() => {
    client = new SpiceClient({
      apiKey: 'test-api-key',
      httpUrl: 'http://localhost:8090',
    });

    (client as any)._platform = {
      fetch: mockFetch,
    };

    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should make a POST request to /v1/nsql with the JSON envelope Accept header', async () => {
    const mockResponse: NsqlResponse = {
      row_count: 1,
      schema: {
        fields: [
          {
            name: 'id',
            data_type: 'Int64',
            nullable: false,
            dict_id: 0,
            dict_is_ordered: false,
          },
        ],
      },
      data: [{ id: 1 }],
      sql: 'SELECT id FROM taxi_trips LIMIT 1',
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
      text: async () => JSON.stringify(mockResponse),
    });

    const result = await client.nsql('one taxi trip', { model: 'my-model' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8090/v1/nsql',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Accept: 'application/vnd.spiceai.nsql.v1+json',
          'X-API-Key': 'test-api-key',
        }),
        body: JSON.stringify({ query: 'one taxi trip', model: 'my-model' }),
      }),
    );

    expect(result).toEqual(mockResponse);
  });

  it('should throw error if HTTP URL is not configured', async () => {
    const clientNoHttp = new SpiceClient({
      flightUrl: 'grpc://localhost:50051',
    });
    (clientNoHttp as any)._httpUrl = undefined;

    await expect(clientNoHttp.nsql('a query')).rejects.toThrow(
      'HTTP URL is required for NSQL operation',
    );
  });

  it('should handle HTTP errors properly', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => 'no LLM model configured',
    });

    await expect(client.nsql('a query')).rejects.toThrow(
      'NSQL request failed: 400 Bad Request - no LLM model configured',
    );
  });
});

describe('SpiceClient.nsqlGenerateSql()', () => {
  let client: SpiceClient;

  beforeEach(() => {
    client = new SpiceClient({
      apiKey: 'test-api-key',
      httpUrl: 'http://localhost:8090',
    });

    (client as any)._platform = {
      fetch: mockFetch,
    };

    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should make a POST request to /v1/nsql with the application/sql Accept header', async () => {
    const generatedSql = 'SELECT * FROM taxi_trips LIMIT 1';

    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => generatedSql,
    });

    const result = await client.nsqlGenerateSql('one taxi trip', {
      model: 'my-model',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8090/v1/nsql',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Accept: 'application/sql',
          'X-API-Key': 'test-api-key',
        }),
        body: JSON.stringify({ query: 'one taxi trip', model: 'my-model' }),
      }),
    );

    expect(result).toBe(generatedSql);
  });

  it('should trim surrounding whitespace from the response body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '\nSELECT 1\n',
    });

    const result = await client.nsqlGenerateSql('trivial query');

    expect(result).toBe('SELECT 1');
  });

  it('should throw error if HTTP URL is not configured', async () => {
    const clientNoHttp = new SpiceClient({
      flightUrl: 'grpc://localhost:50051',
    });
    (clientNoHttp as any)._httpUrl = undefined;

    await expect(clientNoHttp.nsqlGenerateSql('a query')).rejects.toThrow(
      'HTTP URL is required for NSQL operation',
    );
  });

  it('should handle HTTP errors properly', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => 'no LLM model configured',
    });

    await expect(client.nsqlGenerateSql('a query')).rejects.toThrow(
      'NSQL request failed: 400 Bad Request - no LLM model configured',
    );
  });
});
