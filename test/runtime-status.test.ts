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

  it('should return an empty array when the runtime reports no connections', async () => {
    mockFetch.mockResolvedValue(httpResponse(200, null));

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
