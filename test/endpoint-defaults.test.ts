/**
 * The runtime serves Flight and `/v1/*` as one deployment, so a client that is
 * told where to send queries has to send its HTTP calls to the same runtime.
 * These tests pin the pairing between the two endpoint defaults.
 */

import { SpiceClient } from '../src';

const CLOUD_HTTP = 'https://data.spiceai.io';
const CLOUD_FLIGHT = 'flight.spiceai.io:443';
const LOCAL_HTTP = 'http://127.0.0.1:8090';
const LOCAL_FLIGHT = '127.0.0.1:50051';

/**
 * Returns the URL the client's next HTTP call is sent to. `isSpiceHealthy()` is
 * the cheapest probe: unauthenticated, no request body, and it addresses
 * `_httpUrl` directly, so the URL it asks for is the resolved HTTP endpoint.
 */
const httpEndpointOf = async (client: SpiceClient): Promise<string> => {
  const fetch = jest.fn().mockResolvedValue({
    ok: true,
    text: async () => 'ok',
  });
  (client as any)._platform = { ...(client as any)._platform, fetch };

  await client.isSpiceHealthy();

  expect(fetch).toHaveBeenCalledTimes(1);
  const url = fetch.mock.calls[0][0] as string;
  return url.replace(/\/health$/, '');
};

const flightEndpointOf = (client: SpiceClient): string =>
  (client as any)._flightUrl;

describe('endpoint defaults', () => {
  describe('when both endpoints are given', () => {
    it('uses each as given', async () => {
      const client = new SpiceClient({
        apiKey: 'test-api-key',
        httpUrl: 'http://runtime.test:8090',
        flightUrl: 'runtime.test:50051',
      });

      await expect(httpEndpointOf(client)).resolves.toBe(
        'http://runtime.test:8090',
      );
      expect(flightEndpointOf(client)).toBe('runtime.test:50051');
    });
  });

  describe('when neither endpoint is given', () => {
    it('defaults both to the local runtime without an API key', async () => {
      const client = new SpiceClient({});

      await expect(httpEndpointOf(client)).resolves.toBe(LOCAL_HTTP);
      expect(flightEndpointOf(client)).toBe(LOCAL_FLIGHT);
    });

    it('defaults both to Spice Cloud with an API key', async () => {
      const client = new SpiceClient({ apiKey: 'test-api-key' });

      await expect(httpEndpointOf(client)).resolves.toBe(CLOUD_HTTP);
      expect(flightEndpointOf(client)).toBe(CLOUD_FLIGHT);
    });
  });

  describe('when only the Flight endpoint is given', () => {
    it('pairs the Spice Cloud Flight endpoint with the Spice Cloud HTTP endpoint', async () => {
      const client = new SpiceClient({
        apiKey: 'test-api-key',
        flightUrl: CLOUD_FLIGHT,
      });

      await expect(httpEndpointOf(client)).resolves.toBe(CLOUD_HTTP);
    });

    it('pairs the local Flight endpoint with the local HTTP endpoint', async () => {
      const client = new SpiceClient({ flightUrl: LOCAL_FLIGHT });

      await expect(httpEndpointOf(client)).resolves.toBe(LOCAL_HTTP);
    });

    it('keeps the local HTTP default for a Flight endpoint with no known pairing', async () => {
      const client = new SpiceClient({
        apiKey: 'test-api-key',
        flightUrl: 'runtime.test:50051',
      });

      await expect(httpEndpointOf(client)).resolves.toBe(LOCAL_HTTP);
    });

    it('keeps the local HTTP default for a spiceai.io host that is not the Cloud Flight endpoint', async () => {
      const client = new SpiceClient({
        apiKey: 'test-api-key',
        flightUrl: 'staging.spiceai.io:443',
      });

      await expect(httpEndpointOf(client)).resolves.toBe(LOCAL_HTTP);
    });

    it('pairs a local IPv6 Flight endpoint with HTTP on the same address', async () => {
      const client = new SpiceClient({ flightUrl: '[::1]:50051' });

      await expect(httpEndpointOf(client)).resolves.toBe('http://[::1]:8090');
    });

    it('pairs a localhost Flight endpoint with HTTP on the same name', async () => {
      const client = new SpiceClient({ flightUrl: 'localhost:50051' });

      await expect(httpEndpointOf(client)).resolves.toBe(
        'http://localhost:8090',
      );
    });
  });

  describe('when only the HTTP endpoint is given', () => {
    it('pairs the Spice Cloud HTTP endpoint with the Spice Cloud Flight endpoint', async () => {
      const client = new SpiceClient({
        apiKey: 'test-api-key',
        httpUrl: CLOUD_HTTP,
      });

      expect(flightEndpointOf(client)).toBe(CLOUD_FLIGHT);
    });

    it('enables Flight TLS for the Spice Cloud Flight endpoint it paired', () => {
      const client = new SpiceClient({
        apiKey: 'test-api-key',
        httpUrl: CLOUD_HTTP,
      });

      expect((client as any)._flightTlsEnabled).toBe(true);
    });

    it('pairs the local HTTP endpoint with the local Flight endpoint', () => {
      const client = new SpiceClient({ httpUrl: LOCAL_HTTP });

      expect(flightEndpointOf(client)).toBe(LOCAL_FLIGHT);
    });

    it('keeps the local Flight default for an HTTP endpoint with no known pairing', () => {
      const client = new SpiceClient({
        apiKey: 'test-api-key',
        httpUrl: 'http://runtime.test:8090',
      });

      expect(flightEndpointOf(client)).toBe(LOCAL_FLIGHT);
    });

    it('keeps the local Flight default for a spiceai.io host that is not the Cloud HTTP endpoint', () => {
      const client = new SpiceClient({
        apiKey: 'test-api-key',
        httpUrl: 'https://spiceai.io',
      });

      expect(flightEndpointOf(client)).toBe(LOCAL_FLIGHT);
    });

    it('pairs a local IPv6 HTTP endpoint with Flight on the same address', () => {
      const client = new SpiceClient({ httpUrl: 'http://[::1]:8090' });

      expect(flightEndpointOf(client)).toBe('[::1]:50051');
    });

    it('pairs a localhost HTTP endpoint with Flight on the same name', () => {
      const client = new SpiceClient({ httpUrl: 'http://localhost:8090' });

      expect(flightEndpointOf(client)).toBe('localhost:50051');
    });

    it('leaves Flight TLS off for the local IPv6 Flight endpoint it paired', () => {
      const client = new SpiceClient({ httpUrl: 'http://[::1]:8090' });

      expect((client as any)._flightTlsEnabled).toBe(false);
    });
  });
});
