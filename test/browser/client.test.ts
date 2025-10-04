/**
 * Browser-specific tests for SpiceClient
 * These tests run in a jsdom environment simulating a browser
 */

import { SpiceClient } from '../../src/index.browser';

describe('Browser SpiceClient', () => {
  let client: SpiceClient;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    // Mock fetch for browser environment
    global.fetch = jest.fn();

    // Spy on console.log to suppress output during tests
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

    client = new SpiceClient({
      httpUrl: 'http://localhost:8090',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initialization', () => {
    test('should create client with default HTTP URL', () => {
      const defaultClient = new SpiceClient();
      expect(defaultClient).toBeInstanceOf(SpiceClient);
    });

    test('should create client with custom HTTP URL', () => {
      const customClient = new SpiceClient({
        httpUrl: 'http://custom.example.com:8090',
      });
      expect(customClient).toBeInstanceOf(SpiceClient);
    });

    test('should log configuration on initialization', () => {
      consoleLogSpy.mockRestore();
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      new SpiceClient({
        httpUrl: 'http://localhost:8090',
        apiKey: 'test-key',
      });

      expect(logSpy).toHaveBeenCalled();
      const logOutput = logSpy.mock.calls[0][0];
      expect(logOutput).toContain('Spice.js initialized');
      expect(logOutput).toContain('Platform:'); // Will show browser name (Chrome, Firefox, etc.)
      expect(logOutput).toContain('HTTP only');
      expect(logOutput).toContain('Auth: API Key configured');

      logSpy.mockRestore();
    });

    test('should create client with API key', () => {
      const apiClient = new SpiceClient({
        apiKey: 'test-api-key',
        httpUrl: 'http://localhost:8090',
      });
      expect(apiClient).toBeInstanceOf(SpiceClient);
    });

    test('should create client with custom headers', () => {
      const customClient = new SpiceClient({
        httpUrl: 'http://localhost:8090',
        customHeaders: {
          'X-Custom-Header': 'test-value',
        },
      });
      expect(customClient).toBeInstanceOf(SpiceClient);
    });
  });

  describe('Health Checks', () => {
    test('isSpiceHealthy should return true when endpoint is healthy', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('ok'),
      });

      const result = await client.isSpiceHealthy();
      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8090/health',
        expect.objectContaining({
          method: 'GET',
        }),
      );
    });

    test('isSpiceHealthy should return false when endpoint fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('error'),
      });

      const result = await client.isSpiceHealthy();
      expect(result).toBe(false);
    });

    test('isSpiceHealthy should return false on network error', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error'),
      );

      const result = await client.isSpiceHealthy();
      expect(result).toBe(false);
    });

    test('isSpiceReady should return true when endpoint is ready', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: jest.fn(),
        },
        text: jest.fn().mockResolvedValue('ready'),
        json: jest.fn().mockResolvedValue({}),
      });

      const result = await client.isSpiceReady();
      expect(result).toBe(true);
    });

    test('isSpiceReady should return false when endpoint is not ready', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 503,
        headers: {
          get: jest.fn(),
        },
        text: jest.fn().mockResolvedValue('Not ready'),
        json: jest.fn().mockResolvedValue({}),
      });

      const result = await client.isSpiceReady();
      expect(result).toBe(false);
    });
  });

  describe('SQL Queries', () => {
    test('should execute SQL query via HTTP', async () => {
      const mockResponse = {
        schema: [{ name: 'id', data_type: 'Int32' }],
        rows: [[1], [2], [3]],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue('application/json'),
        },
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await client.sql('SELECT * FROM test_table');

      expect(result).toBeDefined();
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8090/v1/sql',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'text/plain',
            Accept: 'application/vnd.spiceai.sql.v1+json',
          }),
        }),
      );
    });

    test('should handle SQL query errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: {
          get: jest.fn(),
        },
        text: jest.fn().mockResolvedValue('Bad request'),
      });

      await expect(client.sql('INVALID SQL')).rejects.toThrow();
    });

    test('should execute sqlJson query', async () => {
      const mockResponse = {
        schema: [{ name: 'id', data_type: 'Int32' }],
        rows: [[1], [2]],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue('application/json'),
        },
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await client.sqlJson('SELECT * FROM test_table');

      expect(result).toHaveProperty('row_count');
      expect(result).toHaveProperty('schema');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('execution_time_ms');
    });
  });

  describe('Browser-Specific Behavior', () => {
    test('should not use gRPC in browser', async () => {
      // In browser, only HTTP should be used
      const mockResponse = {
        schema: [{ name: 'test', data_type: 'String' }],
        rows: [['value']],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: jest.fn().mockReturnValue('application/json'),
        },
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      await client.sql('SELECT 1');

      // Verify HTTP endpoint was called
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/sql'),
        expect.any(Object),
      );
    });

    test('should use native fetch API', async () => {
      // Verify that browser platform uses window.fetch
      expect(global.fetch).toBeDefined();
    });

    test('should include User-Agent header', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: jest.fn(),
        },
        text: jest.fn().mockResolvedValue('OK'),
        json: jest.fn().mockResolvedValue({}),
      });

      await client.isSpiceReady();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': expect.stringContaining('spice.js'),
          }),
        }),
      );
    });
  });

  describe('NSQL (Natural Language SQL)', () => {
    test('should execute NSQL query', async () => {
      const mockResponse = {
        sql: 'SELECT * FROM users LIMIT 10',
        schema: [{ name: 'id', data_type: 'Int32' }],
        rows: [[1]],
        row_count: 1,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: jest.fn(),
        },
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await client.nsql('show me users');

      expect(result).toHaveProperty('sql');
      expect(result.sql).toBe('SELECT * FROM users LIMIT 10');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8090/v1/nsql',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    test('should handle NSQL errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: {
          get: jest.fn(),
        },
        text: jest.fn().mockResolvedValue('Invalid query'),
      });

      await expect(client.nsql('invalid natural language')).rejects.toThrow();
    });
  });

  describe('Refresh Acceleration', () => {
    test('should trigger dataset refresh', async () => {
      const mockResponse = {
        message: 'Refresh triggered successfully',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: jest.fn(),
        },
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await client.refreshAcceleration('test_dataset');

      expect(result).toHaveProperty('message');
      expect(result.message).toBe('Refresh triggered successfully');
    });

    test('should handle refresh errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: {
          get: jest.fn(),
        },
        text: jest.fn().mockResolvedValue('Dataset not found'),
      });

      await expect(
        client.refreshAcceleration('nonexistent_dataset'),
      ).rejects.toThrow();
    });
  });

  describe('Retry Logic', () => {
    test('should have retry configuration', () => {
      expect(() => client.setMaxRetries(5)).not.toThrow();
    });

    test('should allow disabling retries', () => {
      expect(() => client.setMaxRetries(0)).not.toThrow();
    });

    test('should reject negative retry values', () => {
      expect(() => client.setMaxRetries(-1)).toThrow();
    });
  });

  describe('API Key Authentication', () => {
    test('should include API key in requests', async () => {
      const clientWithKey = new SpiceClient({
        apiKey: 'test-api-key-123',
        httpUrl: 'http://localhost:8090',
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: jest.fn(),
        },
        text: jest.fn().mockResolvedValue('OK'),
        json: jest.fn().mockResolvedValue({}),
      });

      await clientWithKey.isSpiceReady();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'test-api-key-123',
          }),
        }),
      );
    });

    test('should not include API key header when not provided', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: jest.fn(),
        },
        text: jest.fn().mockResolvedValue('OK'),
        json: jest.fn().mockResolvedValue({}),
      });

      await client.isSpiceReady();

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const headers = fetchCall[1].headers;

      expect(headers['X-API-Key']).toBeUndefined();
    });
  });

  describe('Custom Headers', () => {
    test('should include custom headers in requests', async () => {
      const clientWithHeaders = new SpiceClient({
        httpUrl: 'http://localhost:8090',
        customHeaders: {
          'X-Custom-Header': 'custom-value',
          'X-Another-Header': 'another-value',
        },
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: jest.fn(),
        },
        text: jest.fn().mockResolvedValue('OK'),
        json: jest.fn().mockResolvedValue({}),
      });

      await clientWithHeaders.isSpiceReady();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Header': 'custom-value',
            'X-Another-Header': 'another-value',
          }),
        }),
      );
    });
  });
});
