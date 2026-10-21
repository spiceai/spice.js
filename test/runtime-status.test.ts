/**
 * Unit tests for runtimeStatus()
 */

import { SpiceClient } from '../src';
import type { ConnectionDetails } from '../src';

const mockFetch = jest.fn();

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

describe('SpiceClient.runtimeStatus()', () => {
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

  it('should make a GET request to /v1/status', async () => {
    const body: ConnectionDetails[] = [
      { name: 'http', endpoint: 'http://127.0.0.1:8090', status: 'Ready' },
      { name: 'flight', endpoint: '127.0.0.1:50051', status: 'Ready' },
    ];
    mockFetch.mockResolvedValue(httpResponse(200, body));

    const details = await client.runtimeStatus();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8090/v1/status',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(details).toEqual(body);
  });

  it('should distinguish per-component state', async () => {
    mockFetch.mockResolvedValue(
      httpResponse(200, [
        { name: 'http', endpoint: 'http://127.0.0.1:8090', status: 'Ready' },
        { name: 'flight', endpoint: '127.0.0.1:50051', status: 'Error' },
        { name: 'metrics', endpoint: 'N/A', status: 'Disabled' },
      ]),
    );

    const details = await client.runtimeStatus();

    expect(details.map((d) => d.status)).toEqual([
      'Ready',
      'Error',
      'Disabled',
    ]);
    expect(details.find((d) => d.name === 'metrics')?.endpoint).toBe('N/A');
  });

  it('should preserve a status this SDK does not know about', async () => {
    mockFetch.mockResolvedValue(
      httpResponse(200, [
        { name: 'http', endpoint: 'http://127.0.0.1:8090', status: 'Draining' },
      ]),
    );

    const details = await client.runtimeStatus();

    expect(details[0].status).toBe('Draining');
  });

  it('should reject a null body rather than report no connections', async () => {
    mockFetch.mockResolvedValue(httpResponse(200, null));

    // /v1/status serializes a list, so null is a malformed response. Returning []
    // here would be reported as a healthy runtime that has no connections.
    await expect(client.runtimeStatus()).rejects.toThrow(
      'Failed to get runtime status: expected a JSON array of connections from /v1/status, received null',
    );
  });

  it('should reject a non-array body', async () => {
    mockFetch.mockResolvedValue(
      httpResponse(200, { connections: [{ name: 'http' }] }),
    );

    await expect(client.runtimeStatus()).rejects.toThrow(
      'Failed to get runtime status: expected a JSON array of connections from /v1/status, received object',
    );
  });

  it.each([
    ['a null entry', [null], 'entry 0 is null'],
    ['a non-object entry', [42], 'entry 0 is number'],
    ['an array entry', [['http']], 'entry 0 is array'],
    [
      'an entry missing name',
      [{ endpoint: '127.0.0.1:50051', status: 'Ready' }],
      "entry 0 has no string 'name'",
    ],
    [
      'an entry whose endpoint is not a string',
      [{ name: 'flight', endpoint: 50051, status: 'Ready' }],
      "entry 0 has no string 'endpoint'",
    ],
    [
      'an entry missing status',
      [{ name: 'flight', endpoint: '127.0.0.1:50051' }],
      "entry 0 has no string 'status'",
    ],
    [
      'a malformed entry after a valid one',
      [
        { name: 'http', endpoint: 'http://127.0.0.1:8090', status: 'Ready' },
        null,
      ],
      'entry 1 is null',
    ],
  ])('should reject %s', async (_label, body, detail) => {
    mockFetch.mockResolvedValue(httpResponse(200, body));

    // A consumer doing details.find((d) => d.name === 'flight') would otherwise
    // throw a TypeError on a null entry, far from the response that caused it.
    await expect(client.runtimeStatus()).rejects.toThrow(
      `Failed to get runtime status: malformed connection in /v1/status response: ${detail}`,
    );
  });

  it('should keep fields a newer runtime adds to an entry', async () => {
    const body = [
      {
        name: 'http',
        endpoint: 'http://127.0.0.1:8090',
        status: 'Ready',
        since: '2026-01-01T00:00:00Z',
      },
    ];
    mockFetch.mockResolvedValue(httpResponse(200, body));

    await expect(client.runtimeStatus()).resolves.toEqual(body);
  });

  it('should return an empty array when the runtime reports an empty list', async () => {
    mockFetch.mockResolvedValue(httpResponse(200, []));

    await expect(client.runtimeStatus()).resolves.toEqual([]);
  });

  it('should throw a helpful error when the API key lacks access', async () => {
    mockFetch.mockResolvedValue(httpResponse(403, 'Forbidden', 'Forbidden'));

    await expect(client.runtimeStatus()).rejects.toThrow(
      'The configured API key does not allow reading runtime status. Use a key with read access.',
    );
  });

  it('should surface the runtime error on a non-OK response', async () => {
    mockFetch.mockResolvedValue(
      httpResponse(500, 'internal error', 'Internal Server Error'),
    );

    await expect(client.runtimeStatus()).rejects.toThrow(
      'Failed to get runtime status: 500 Internal Server Error - internal error',
    );
  });

  it('should throw when no HTTP URL is configured', async () => {
    const noHttp = new SpiceClient({ apiKey: 'test-api-key' });
    (noHttp as any)._httpUrl = '';

    await expect(noHttp.runtimeStatus()).rejects.toThrow(
      'HTTP URL is required for runtime status',
    );
  });
});
