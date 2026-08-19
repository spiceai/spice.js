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

    test('should log configuration on initialization when SPICE_DEBUG is set', () => {
      consoleLogSpy.mockRestore();
      const debugSpy = jest.spyOn(console, 'debug').mockImplementation();
      const originalEnv = process.env.SPICE_DEBUG;
      process.env.SPICE_DEBUG = 'true';

      try {
        new SpiceClient({
          httpUrl: 'http://localhost:8090',
          apiKey: 'test-key',
        });

        expect(debugSpy).toHaveBeenCalled();
      } finally {
        debugSpy.mockRestore();
        // Assigning undefined to process.env stores the string "undefined" —
        // delete instead when the variable was originally unset
        if (originalEnv === undefined) delete process.env.SPICE_DEBUG;
        else process.env.SPICE_DEBUG = originalEnv;
      }
    });

    test('should not log when logging is disabled', () => {
      consoleLogSpy.mockRestore();
      const debugSpy = jest.spyOn(console, 'debug').mockImplementation();
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      new SpiceClient({
        httpUrl: 'http://localhost:8090',
        apiKey: 'test-key',
        logging: false,
      });

      expect(debugSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();

      debugSpy.mockRestore();
      logSpy.mockRestore();
      warnSpy.mockRestore();
    });

    test('should log when logging is explicitly enabled', () => {
      consoleLogSpy.mockRestore();
      const debugSpy = jest.spyOn(console, 'debug').mockImplementation();

      new SpiceClient({
        httpUrl: 'http://localhost:8090',
        logging: true,
      });

      expect(debugSpy).toHaveBeenCalled();
      debugSpy.mockRestore();
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
    test('should execute SQL query via HTTP with text/plain body when no parameters', async () => {
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
            // Plain queries use raw SQL text — the format every endpoint
            // accepts, including Spice Cloud
            'Content-Type': 'text/plain',
            // Local OSS runtime uses application/json
            Accept: 'application/json',
          }),
          body: 'SELECT * FROM test_table',
        }),
      );
    });

    test('should execute parameterized SQL query via HTTP with JSON body', async () => {
      const mockResponse = {
        schema: [{ name: 'id', data_type: 'Int32' }],
        rows: [[1]],
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

      const result = await client.sql(
        'SELECT * FROM test_table WHERE id = $1',
        {
          parameters: [1],
        },
      );

      expect(result).toBeDefined();
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8090/v1/sql',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            // Parameterized queries use the JSON envelope understood by the
            // OSS runtime
            'Content-Type': 'application/json',
            Accept: 'application/json',
          }),
          body: JSON.stringify({
            sql: 'SELECT * FROM test_table WHERE id = $1',
            parameters: [1],
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

    test('should execute sqlJson query with text/plain body', async () => {
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

      // sqlJson uses text/plain Content-Type (no parameterized query support)
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8090/v1/sql',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'text/plain',
            Accept: 'application/vnd.spiceai.sql.v1+json',
          }),
          body: 'SELECT * FROM test_table',
        }),
      );
    });

    test('should preserve numeric types in HTTP mode (sqlJson)', async () => {
      // Test that numbers stay as numbers, not converted to strings
      const mockResponse = {
        schema: {
          fields: [
            { name: 'num', data_type: 'Int32', nullable: true },
            { name: 'value', data_type: 'Float64', nullable: true },
          ],
        },
        data: [
          { num: 1, value: 2.5 },
          { num: 3, value: 4.7 },
        ],
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

      const result = await client.sqlJson('SELECT 1 as num, 2.5 as value');

      // Verify types are preserved
      expect(result.data).toHaveLength(2);
      expect(typeof result.data[0].num).toBe('number');
      expect(typeof result.data[0].value).toBe('number');
      expect(result.data[0].num).toBe(1);
      expect(result.data[0].value).toBe(2.5);
      // Ensure they're NOT strings
      expect(result.data[0].num).not.toBe('1');
      expect(result.data[0].value).not.toBe('2.5');
    });

    test('should handle array-based rows in HTTP mode (sqlJson)', async () => {
      // Test with array-based rows (not object-based)
      const mockResponse = {
        schema: [
          { name: 'id', data_type: 'Int32' },
          { name: 'name', data_type: 'Utf8' },
        ],
        rows: [
          [1, 'Alice'],
          [2, 'Bob'],
        ],
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

      const result = await client.sqlJson('SELECT * FROM users');

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual([1, 'Alice']);
      expect(result.data[1]).toEqual([2, 'Bob']);
      // Verify number is not converted to string
      expect(typeof result.data[0][0]).toBe('number');
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
      // Shape the runtime returns for application/vnd.spiceai.nsql.v1+json.
      const mockResponse = {
        row_count: 1,
        schema: { fields: [{ name: 'id', data_type: 'Int32' }] },
        data: [{ id: 1 }],
        sql: 'SELECT * FROM users LIMIT 10',
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

      expect(result.sql).toBe('SELECT * FROM users LIMIT 10');
      expect(result.row_count).toBe(1);
      expect(result.data).toEqual([{ id: 1 }]);
      expect(result.schema.fields).toEqual([{ name: 'id', data_type: 'Int32' }]);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8090/v1/nsql',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Accept: 'application/vnd.spiceai.nsql.v1+json',
          }),
        }),
      );
    });

    test('should normalize a bare row array into the documented shape', async () => {
      // What the runtime sends when the Accept header is absent or stripped.
      const rows = [{ id: 1 }, { id: 2 }];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: jest.fn(),
        },
        text: jest.fn().mockResolvedValue(JSON.stringify(rows)),
        json: jest.fn().mockResolvedValue(rows),
      });

      const result = await client.nsql('show me users');

      expect(result.data).toEqual(rows);
      expect(result.row_count).toBe(2);
      expect(result.schema.fields).toEqual([]);
      expect(result.sql).toBe('');
    });

    test('should tolerate an empty result set', async () => {
      // The runtime omits schema fields entirely when no rows are returned.
      const mockResponse = {
        row_count: 0,
        schema: {},
        data: [],
        sql: 'SELECT * FROM users WHERE false',
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

      expect(result.schema.fields).toEqual([]);
      expect(result.data).toEqual([]);
      expect(result.row_count).toBe(0);
      expect(result.sql).toBe('SELECT * FROM users WHERE false');
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

  describe('Cross-Platform Consistency Tests', () => {
    describe('.sql() and .sqlJson() consistency in HTTP-only mode', () => {
      test('should return consistent data for basic query', async () => {
        // Mock response with test data matching local runtime test structure
        const mockSqlResponse = {
          schema: {
            fields: [
              {
                name: 'id',
                data_type: 'Int32',
                nullable: false,
                dict_id: 0,
                dict_is_ordered: false,
              },
              {
                name: 'int4_column',
                data_type: 'Int32',
                nullable: true,
                dict_id: 0,
                dict_is_ordered: false,
              },
              {
                name: 'text_column',
                data_type: 'Utf8',
                nullable: true,
                dict_id: 0,
                dict_is_ordered: false,
              },
              {
                name: 'bool_column',
                data_type: 'Bool',
                nullable: true,
                dict_id: 0,
                dict_is_ordered: false,
              },
            ],
          },
          data: [
            { id: 1, int4_column: 2, text_column: 'test', bool_column: true },
            { id: 2, int4_column: 2, text_column: 'test', bool_column: true },
            { id: 3, int4_column: null, text_column: null, bool_column: null },
          ],
          row_count: 3,
          execution_time_ms: 5,
        };

        // Mock for sql() - returns Arrow-compatible format
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: {
            get: jest.fn().mockReturnValue('application/json'),
          },
          text: jest.fn().mockResolvedValue(JSON.stringify(mockSqlResponse)),
          json: jest.fn().mockResolvedValue(mockSqlResponse),
        });

        const sqlResult = await client.sql(
          'SELECT id, int4_column, text_column, bool_column FROM test_table ORDER BY id',
        );

        // Mock for sqlJson() - returns JSON format
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: {
            get: jest
              .fn()
              .mockReturnValue('application/vnd.spiceai.sql.v1+json'),
          },
          text: jest.fn().mockResolvedValue(JSON.stringify(mockSqlResponse)),
          json: jest.fn().mockResolvedValue(mockSqlResponse),
        });

        const sqlJsonResult = await client.sqlJson(
          'SELECT id, int4_column, text_column, bool_column FROM test_table ORDER BY id',
        );

        // Convert Arrow table to array for comparison
        const sqlRows = sqlResult.toArray();
        const jsonRows = sqlJsonResult.data;

        // Both should have same number of rows
        expect(sqlRows).toHaveLength(3);
        expect(jsonRows).toHaveLength(3);
        expect(sqlJsonResult.row_count).toBe(3);

        // First row values should match
        expect(sqlRows[0].id).toBe(jsonRows[0].id);
        expect(sqlRows[0].id).toBe(1);
        expect(sqlRows[0].int4_column).toBe(jsonRows[0].int4_column);
        expect(sqlRows[0].int4_column).toBe(2);
        expect(sqlRows[0].text_column).toBe(jsonRows[0].text_column);
        expect(sqlRows[0].text_column).toBe('test');
        expect(sqlRows[0].bool_column).toBe(jsonRows[0].bool_column);
        expect(sqlRows[0].bool_column).toBe(true);

        // NULL values should be consistent
        expect(sqlRows[2].id).toBe(jsonRows[2].id);
        expect(sqlRows[2].id).toBe(3);
        expect(sqlRows[2].int4_column).toBeNull();
        expect(jsonRows[2].int4_column).toBeNull();
        expect(sqlRows[2].text_column).toBeNull();
        expect(jsonRows[2].text_column).toBeNull();
      });

      test('should preserve numeric types consistently', async () => {
        const mockResponse = {
          schema: {
            fields: [
              {
                name: 'id',
                data_type: 'Int32',
                nullable: false,
                dict_id: 0,
                dict_is_ordered: false,
              },
              {
                name: 'int2_column',
                data_type: 'Int16',
                nullable: true,
                dict_id: 0,
                dict_is_ordered: false,
              },
              {
                name: 'int8_column',
                data_type: 'Int64',
                nullable: true,
                dict_id: 0,
                dict_is_ordered: false,
              },
              {
                name: 'float4_column',
                data_type: 'Float32',
                nullable: true,
                dict_id: 0,
                dict_is_ordered: false,
              },
              {
                name: 'float8_column',
                data_type: 'Float64',
                nullable: true,
                dict_id: 0,
                dict_is_ordered: false,
              },
            ],
          },
          data: [
            {
              id: 1,
              int2_column: 1,
              int8_column: 3,
              float4_column: 4.0,
              float8_column: 5.0,
            },
          ],
          row_count: 1,
          execution_time_ms: 5,
        };

        // Mock sql()
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: jest.fn().mockReturnValue('application/json') },
          text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
          json: jest.fn().mockResolvedValue(mockResponse),
        });

        const sqlResult = await client.sql('SELECT * FROM test_table');

        // Mock sqlJson()
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: {
            get: jest
              .fn()
              .mockReturnValue('application/vnd.spiceai.sql.v1+json'),
          },
          text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
          json: jest.fn().mockResolvedValue(mockResponse),
        });

        const sqlJsonResult = await client.sqlJson('SELECT * FROM test_table');

        const sqlRows = sqlResult.toArray();
        const jsonRows = sqlJsonResult.data;

        // Verify all numeric types are preserved as numbers in both
        expect(sqlRows[0].id).toBe(jsonRows[0].id);
        expect(typeof jsonRows[0].id).toBe('number');

        expect(sqlRows[0].int2_column).toBe(jsonRows[0].int2_column);
        expect(typeof jsonRows[0].int2_column).toBe('number');

        expect(sqlRows[0].int8_column).toBe(jsonRows[0].int8_column);
        expect(typeof jsonRows[0].int8_column).toBe('number');

        expect(sqlRows[0].float4_column).toBeCloseTo(jsonRows[0].float4_column);
        expect(typeof jsonRows[0].float4_column).toBe('number');

        expect(sqlRows[0].float8_column).toBeCloseTo(jsonRows[0].float8_column);
        expect(typeof jsonRows[0].float8_column).toBe('number');
      });

      test('should handle timestamps consistently', async () => {
        const mockResponse = {
          schema: {
            fields: [
              {
                name: 'id',
                data_type: 'Int32',
                nullable: false,
                dict_id: 0,
                dict_is_ordered: false,
              },
              {
                name: 'created_at',
                data_type: { Timestamp: ['Millisecond', null] },
                nullable: true,
                dict_id: 0,
                dict_is_ordered: false,
              },
              {
                name: 'date_column',
                data_type: 'Date32',
                nullable: true,
                dict_id: 0,
                dict_is_ordered: false,
              },
            ],
          },
          data: [
            {
              id: 1,
              created_at: '2021-08-09T10:42:19',
              date_column: '2021-08-09',
            },
          ],
          row_count: 1,
          execution_time_ms: 5,
        };

        // Mock sql()
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: jest.fn().mockReturnValue('application/json') },
          text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
          json: jest.fn().mockResolvedValue(mockResponse),
        });

        const sqlResult = await client.sql('SELECT * FROM test_table');

        // Mock sqlJson()
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: {
            get: jest
              .fn()
              .mockReturnValue('application/vnd.spiceai.sql.v1+json'),
          },
          text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
          json: jest.fn().mockResolvedValue(mockResponse),
        });

        const sqlJsonResult = await client.sqlJson('SELECT * FROM test_table');

        const sqlRows = sqlResult.toArray();
        const jsonRows = sqlJsonResult.data;

        // Both should return ISO 8601 strings for timestamps
        expect(sqlRows[0].id).toBe(jsonRows[0].id);
        expect(typeof jsonRows[0].created_at).toBe('string');
        expect(jsonRows[0].created_at).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
        );

        // In HTTP mode, both should get the same timestamp string
        expect(sqlRows[0].created_at).toBe(jsonRows[0].created_at);
        expect(sqlRows[0].date_column).toBe(jsonRows[0].date_column);
      });

      test('should handle complex queries with computed columns consistently', async () => {
        const mockResponse = {
          schema: {
            fields: [
              {
                name: 'id',
                data_type: 'Int32',
                nullable: false,
                dict_id: 0,
                dict_is_ordered: false,
              },
              {
                name: 'value',
                data_type: 'Int32',
                nullable: true,
                dict_id: 0,
                dict_is_ordered: false,
              },
              {
                name: 'doubled',
                data_type: 'Float64',
                nullable: true,
                dict_id: 0,
                dict_is_ordered: false,
              },
              {
                name: 'category',
                data_type: 'Utf8',
                nullable: true,
                dict_id: 0,
                dict_is_ordered: false,
              },
            ],
          },
          data: [
            { id: 1, value: 10, doubled: 20.0, category: 'high' },
            { id: 2, value: 5, doubled: 10.0, category: 'low' },
          ],
          row_count: 2,
          execution_time_ms: 5,
        };

        // Mock sql()
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: jest.fn().mockReturnValue('application/json') },
          text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
          json: jest.fn().mockResolvedValue(mockResponse),
        });

        const sqlResult = await client.sql(
          "SELECT id, value, value * 2 as doubled, CASE WHEN value > 5 THEN 'high' ELSE 'low' END as category FROM test_table",
        );

        // Mock sqlJson()
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: {
            get: jest
              .fn()
              .mockReturnValue('application/vnd.spiceai.sql.v1+json'),
          },
          text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
          json: jest.fn().mockResolvedValue(mockResponse),
        });

        const sqlJsonResult = await client.sqlJson(
          "SELECT id, value, value * 2 as doubled, CASE WHEN value > 5 THEN 'high' ELSE 'low' END as category FROM test_table",
        );

        const sqlRows = sqlResult.toArray();
        const jsonRows = sqlJsonResult.data;

        // Computed columns should match
        expect(sqlRows[0].doubled).toBeCloseTo(jsonRows[0].doubled);
        expect(sqlRows[0].doubled).toBeCloseTo(20.0);

        expect(sqlRows[0].category).toBe(jsonRows[0].category);
        expect(sqlRows[0].category).toBe('high');

        expect(sqlRows[1].category).toBe(jsonRows[1].category);
        expect(sqlRows[1].category).toBe('low');
      });
    });

    describe('Schema consistency across methods', () => {
      test('sqlJson() should return schema matching Arrow table schema', async () => {
        const mockResponse = {
          schema: {
            fields: [
              {
                name: 'id',
                data_type: 'Int32',
                nullable: false,
                dict_id: 0,
                dict_is_ordered: false,
              },
              {
                name: 'name',
                data_type: 'Utf8',
                nullable: true,
                dict_id: 0,
                dict_is_ordered: false,
              },
              {
                name: 'timestamp_col',
                data_type: { Timestamp: ['Millisecond', null] },
                nullable: true,
                dict_id: 0,
                dict_is_ordered: false,
              },
            ],
          },
          data: [
            { id: 1, name: 'test', timestamp_col: '2021-08-09T10:42:19.000Z' },
          ],
          row_count: 1,
          execution_time_ms: 5,
        };

        // Mock sql()
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: jest.fn().mockReturnValue('application/json') },
          text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
          json: jest.fn().mockResolvedValue(mockResponse),
        });

        const sqlResult = await client.sql('SELECT * FROM test_table');

        // Mock sqlJson()
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: {
            get: jest
              .fn()
              .mockReturnValue('application/vnd.spiceai.sql.v1+json'),
          },
          text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
          json: jest.fn().mockResolvedValue(mockResponse),
        });

        const sqlJsonResult = await client.sqlJson('SELECT * FROM test_table');

        // Verify schema structure matches
        expect(sqlResult.schema.fields.length).toBe(
          sqlJsonResult.schema.fields.length,
        );
        expect(sqlResult.schema.fields.length).toBe(3);

        // Verify field names match
        const sqlFieldNames = sqlResult.schema.fields.map((f: any) => f.name);
        const jsonFieldNames = sqlJsonResult.schema.fields.map(
          (f: any) => f.name,
        );
        expect(sqlFieldNames).toEqual(jsonFieldNames);
        expect(sqlFieldNames).toEqual(['id', 'name', 'timestamp_col']);

        // Verify both schemas have nullable property defined
        expect(sqlResult.schema.fields[0]).toHaveProperty('nullable');
        expect(sqlJsonResult.schema.fields[0]).toHaveProperty('nullable');
        expect(sqlResult.schema.fields[1]).toHaveProperty('nullable');
        expect(sqlJsonResult.schema.fields[1]).toHaveProperty('nullable');
      });
    });

    describe('Error handling consistency', () => {
      test('both methods should handle errors consistently', async () => {
        const errorMessage = 'Table not found';

        // Mock sql() error
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 404,
          headers: { get: jest.fn() },
          text: jest.fn().mockResolvedValue(errorMessage),
        });

        await expect(
          client.sql('SELECT * FROM nonexistent_table'),
        ).rejects.toThrow();

        // Mock sqlJson() error
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status: 404,
          headers: { get: jest.fn() },
          text: jest.fn().mockResolvedValue(errorMessage),
        });

        await expect(
          client.sqlJson('SELECT * FROM nonexistent_table'),
        ).rejects.toThrow();
      });
    });
  });
});
