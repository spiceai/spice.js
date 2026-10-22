/**
 * Unit tests for refreshDataset() and its deprecated alias refreshAcceleration()
 */

import { SpiceClient } from '../src';

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

describe('SpiceClient.refreshDataset()', () => {
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

  it('should POST to the dataset acceleration refresh endpoint', async () => {
    mockFetch.mockResolvedValue(
      httpResponse(201, {
        message: 'Dataset refresh triggered for taxi_trips.',
      }),
    );

    const result = await client.refreshDataset('taxi_trips');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8090/v1/datasets/taxi_trips/acceleration/refresh',
      expect.objectContaining({ method: 'POST', body: '{}' }),
    );
    expect(result.message).toBe('Dataset refresh triggered for taxi_trips.');
  });

  it('should send the refresh options and encode the dataset name', async () => {
    mockFetch.mockResolvedValue(httpResponse(201, { message: 'ok' }));

    await client.refreshDataset('eth.recent blocks', {
      refresh_mode: 'full',
      refresh_jitter_max: '5s',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8090/v1/datasets/eth.recent%20blocks/acceleration/refresh',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          refresh_mode: 'full',
          refresh_jitter_max: '5s',
        }),
      }),
    );
  });

  it('should name the dataset and carry the runtime message on failure', async () => {
    mockFetch.mockResolvedValue(
      httpResponse(404, 'Dataset missing_dataset not found', 'Not Found'),
    );

    await expect(client.refreshDataset('missing_dataset')).rejects.toThrow(
      "Failed to refresh dataset 'missing_dataset': 404 Not Found - Dataset missing_dataset not found",
    );
  });

  it('should keep refreshAcceleration() as an alias that sends the same request', async () => {
    mockFetch.mockResolvedValue(httpResponse(201, { message: 'ok' }));
    const options = { refresh_sql: 'SELECT * FROM taxi_trips LIMIT 10' };

    await client.refreshDataset('taxi_trips', options);
    await client.refreshAcceleration('taxi_trips', options);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1]).toEqual(mockFetch.mock.calls[0]);
  });
});
