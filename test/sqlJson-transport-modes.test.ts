/**
 * Tests for transport mode awareness in sqlJson()
 * Ensures proper behavior in both gRPC/Arrow and HTTP modes
 */

import { SpiceClient as BrowserClient } from '../src/index.browser';
import { SpiceClient as NodeClient } from '../src/index.node';

describe('sqlJson() Transport Mode Awareness', () => {
  describe('HTTP Mode Type Preservation', () => {
    let httpClient: BrowserClient;

    beforeEach(() => {
      // Mock fetch for HTTP requests
      global.fetch = jest.fn();

      // Create client that will use HTTP only (browser client has no gRPC)
      httpClient = new BrowserClient({
        httpUrl: 'http://localhost:8090',
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('should preserve number types from JSON response', async () => {
      const mockResponse = {
        schema: {
          fields: [
            { name: 'id', data_type: 'Int32', nullable: false },
            { name: 'amount', data_type: 'Float64', nullable: false },
          ],
        },
        data: [
          { id: 1, amount: 100.5 },
          { id: 2, amount: 200.75 },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await httpClient.sqlJson('SELECT * FROM test');

      // Verify numbers are preserved
      expect(result.data[0].id).toBe(1);
      expect(result.data[0].amount).toBe(100.5);
      expect(typeof result.data[0].id).toBe('number');
      expect(typeof result.data[0].amount).toBe('number');

      // Ensure they're NOT strings
      expect(result.data[0].id).not.toBe('1');
      expect(result.data[0].amount).not.toBe('100.5');
    });

    test('should preserve boolean types from JSON response', async () => {
      const mockResponse = {
        schema: {
          fields: [{ name: 'active', data_type: 'Boolean', nullable: false }],
        },
        data: [{ active: true }, { active: false }],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await httpClient.sqlJson('SELECT active FROM test');

      expect(result.data[0].active).toBe(true);
      expect(result.data[1].active).toBe(false);
      expect(typeof result.data[0].active).toBe('boolean');
    });

    test('should handle null values correctly', async () => {
      const mockResponse = {
        schema: {
          fields: [
            { name: 'value', data_type: 'Int32', nullable: true },
            { name: 'name', data_type: 'Utf8', nullable: true },
          ],
        },
        data: [
          { value: null, name: 'test' },
          { value: 42, name: null },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await httpClient.sqlJson('SELECT * FROM test');

      expect(result.data[0].value).toBeNull();
      expect(result.data[0].name).toBe('test');
      expect(result.data[1].value).toBe(42);
      expect(result.data[1].name).toBeNull();
    });

    test('should handle complex nested structures', async () => {
      const mockResponse = {
        schema: {
          fields: [
            { name: 'id', data_type: 'Int32', nullable: false },
            { name: 'metadata', data_type: 'Utf8', nullable: true },
          ],
        },
        data: [
          { id: 1, metadata: '{"nested": true, "count": 5}' },
          { id: 2, metadata: '{"nested": false, "count": 10}' },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await httpClient.sqlJson('SELECT * FROM test');

      expect(result.data[0].id).toBe(1);
      expect(typeof result.data[0].id).toBe('number');
      expect(typeof result.data[0].metadata).toBe('string');

      // Verify nested JSON can be parsed
      const parsed = JSON.parse(result.data[0].metadata);
      expect(parsed.count).toBe(5);
      expect(typeof parsed.count).toBe('number');
    });

    test('should handle array-based rows format', async () => {
      // Some endpoints return rows as arrays instead of objects
      const mockResponse = {
        schema: [
          { name: 'id', data_type: 'Int32' },
          { name: 'name', data_type: 'Utf8' },
          { name: 'score', data_type: 'Float64' },
        ],
        rows: [
          [1, 'Alice', 95.5],
          [2, 'Bob', 87.3],
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await httpClient.sqlJson('SELECT * FROM test');

      // Verify data structure
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual([1, 'Alice', 95.5]);

      // Verify types are preserved
      expect(typeof result.data[0][0]).toBe('number');
      expect(typeof result.data[0][1]).toBe('string');
      expect(typeof result.data[0][2]).toBe('number');
    });

    test('should not invoke Arrow conversion in HTTP-only mode', async () => {
      const mockResponse = {
        schema: {
          fields: [{ name: 'test', data_type: 'Int32', nullable: false }],
        },
        data: [{ test: 123 }],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify(mockResponse)),
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await httpClient.sqlJson('SELECT 123 as test');

      // Verify result
      expect(result.data[0].test).toBe(123);

      // Verify only one fetch call was made (no Arrow Flight attempt)
      expect(global.fetch).toHaveBeenCalledTimes(1);
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
  });

  describe('gRPC Mode with Cloud', () => {
    // These tests would run against actual Spice Cloud if API key is available
    // They verify that gRPC/Arrow mode also preserves types correctly

    describe('Cloud (flight.spiceai.io:443)', () => {
    const apiKey = process.env.SPICEAI_API_KEY;

    if (!apiKey) {
      test.skip('Skipping gRPC mode tests - no API key available', () => {});
      return;
    }

    let cloudClient: NodeClient;

    beforeAll(() => {
      cloudClient = new NodeClient(apiKey);
    });

    test('should preserve number types in gRPC/Arrow mode', async () => {
      const result = await cloudClient.sqlJson(
        'SELECT 42 as int_val, 3.14 as float_val',
      );

      expect(result.row_count).toBe(1);
      const row = result.data[0];

      // Verify types are preserved through Arrow conversion
      expect(typeof row.int_val).toBe('number');
      expect(typeof row.float_val).toBe('number');
      expect(row.int_val).toBe(42);
      expect(row.float_val).toBeCloseTo(3.14, 2);
    }, 30000);

    test('should handle mixed types in gRPC/Arrow mode', async () => {
      const result = await cloudClient.sqlJson(
        "SELECT 1 as num, 'text' as str, true as bool",
      );

      expect(result.row_count).toBe(1);
      const row = result.data[0];

      expect(typeof row.num).toBe('number');
      expect(typeof row.str).toBe('string');
      expect(typeof row.bool).toBe('boolean');
    }, 30000);
  });
});
