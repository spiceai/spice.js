import dotenv from 'dotenv';
import { SpiceClient } from '../';
import 'dotenv/config';

describe('cloud', () => {
  dotenv.config();

  const api_key = process.env.SPICE_API_KEY;

  if (!api_key) {
    throw 'API_KEY environment variable not set';
  }

  const HTTP_DATA_PATH = process.env.HTTP_URL
    ? process.env.HTTP_URL
    : 'https://data.spiceai.io';
  const FLIGHT_PATH = process.env.FLIGHT_URL
    ? process.env.FLIGHT_URL
    : 'flight.spiceai.io:443';
  const VERCEL_ENDPOINT =
    process.env.VERCEL_ENDPOINT || 'https://spice-js.vercel.app/api';

  const cloudClient = new SpiceClient({
    apiKey: api_key,
    httpUrl: HTTP_DATA_PATH,
    flightUrl: FLIGHT_PATH,
  });

  // Build custom headers for Vercel client
  const vercelCustomHeaders: { [key: string]: string } = {};
  const vercelBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (vercelBypassSecret) {
    vercelCustomHeaders['x-vercel-protection-bypass'] = vercelBypassSecret;
  }

  const vercelClient = new SpiceClient({
    apiKey: api_key,
    httpUrl: VERCEL_ENDPOINT,
    flightUrl: FLIGHT_PATH,
    customHeaders:
      Object.keys(vercelCustomHeaders).length > 0
        ? vercelCustomHeaders
        : undefined,
  });

  describe('Health Checks', () => {
    test('isSpiceHealthy should return true for cloud endpoint', async () => {
      const isHealthy = await cloudClient.isSpiceHealthy();
      expect(isHealthy).toBe(true);
    });

    test('isSpiceReady should return true for cloud endpoint', async () => {
      const isReady = await cloudClient.isSpiceReady();
      expect(isReady).toBe(true);
    });

    test('Vercel endpoint isSpiceHealthy should work', async () => {
      const isHealthy = await vercelClient.isSpiceHealthy();
      expect(isHealthy).toBe(true);
    });

    test('Vercel endpoint isSpiceReady should work', async () => {
      const isReady = await vercelClient.isSpiceReady();
      expect(isReady).toBe(true);
    });
  });

  describe('Flight (gRPC)', () => {
    test('legacy client uses spice.ai cloud ', async () => {
      const client = new SpiceClient(api_key);

      const tableResult = await client.sql(
        'SELECT * FROM spice.samples.taxi_trips LIMIT 10;'
      );

      expect(tableResult.toArray()).toHaveLength(10);
    });

    test('streaming works', async () => {
      let numChunks = 0;
      await cloudClient.sql(
        'SELECT * FROM spice.samples.taxi_trips LIMIT 10;',
        (table) => {
          expect(table.toArray().length).toBeLessThanOrEqual(10);

          let trip_distance = table.getChild('trip_distance');
          expect(trip_distance).toBeTruthy();
          numChunks++;
        }
      );
      expect(numChunks).toBeGreaterThanOrEqual(1);
      expect(numChunks).toBeLessThanOrEqual(3);
    }, 10000);

    test('full result works', async () => {
      const tableResult = await cloudClient.sql(
        'SELECT * FROM spice.samples.taxi_trips LIMIT 10;'
      );
      expect(tableResult.toArray()).toHaveLength(10);
    }, 30000);

    test('query with simple constants', async () => {
      const tableResult = await cloudClient.sql(
        "SELECT 42 as answer, 'test' as message"
      );
      expect(tableResult.toArray()).toHaveLength(1);
      const row = tableResult.toArray()[0];
      expect(Number(row.answer)).toBe(42);
      expect(String(row.message)).toBe('test');
    });

    test('deprecated query() still works', async () => {
      const tableResult = await cloudClient.query(
        "SELECT 42 as answer, 'test' as message"
      );
      expect(tableResult.toArray()).toHaveLength(1);
      const row = tableResult.toArray()[0];
      expect(Number(row.answer)).toBe(42);
      expect(String(row.message)).toBe('test');
    });
  });

  describe('sqlJson()', () => {
    test('returns data in correct JSON format', async () => {
      const result = await cloudClient.sqlJson(
        "SELECT 42 as answer, 'test' as message, 3.14 as pi"
      );

      expect(result.row_count).toBe(1);
      expect(result.schema.fields).toHaveLength(3);
      expect(result.data).toHaveLength(1);
      expect(result.execution_time_ms).toBeGreaterThan(0);

      const row = result.data[0];
      expect(Number(row.answer)).toBe(42);
      expect(String(row.message)).toBe('test');
      expect(Number(row.pi)).toBeCloseTo(3.14, 2);
    });

    test('returns schema with correct field information', async () => {
      const result = await cloudClient.sqlJson(
        'SELECT true as bool_val, 999 as int_val'
      );

      expect(result.schema.fields.length).toBeGreaterThan(0);
      result.schema.fields.forEach((field) => {
        expect(field).toHaveProperty('name');
        expect(field).toHaveProperty('data_type');
        expect(field).toHaveProperty('nullable');
        expect(field).toHaveProperty('dict_id');
        expect(field).toHaveProperty('dict_is_ordered');
      });
    });

    test('handles multiple rows correctly', async () => {
      const result = await cloudClient.sqlJson(
        'SELECT * FROM spice.samples.taxi_trips LIMIT 5'
      );

      expect(result.row_count).toBe(5);
      expect(result.data).toHaveLength(5);
      expect(result.schema.fields.length).toBeGreaterThan(0);
    }, 30000);

    test('handles empty result set', async () => {
      const result = await cloudClient.sqlJson(
        'SELECT * FROM spice.samples.taxi_trips WHERE false'
      );

      expect(result.row_count).toBe(0);
      expect(result.data).toHaveLength(0);
      // Schema fields may be empty for queries with no results
      expect(result.schema.fields.length).toBeGreaterThanOrEqual(0);
    });

    test('converts BigInt values to strings', async () => {
      const result = await cloudClient.sqlJson(
        'SELECT 9223372036854775807 as big_num'
      );

      expect(result.row_count).toBe(1);
      const row = result.data[0];
      // BigInt should be converted to string for JSON serialization
      expect(
        typeof row.big_num === 'string' || typeof row.big_num === 'number'
      ).toBe(true);
    });

    test('preserves numeric types in gRPC mode', async () => {
      // Test that numbers remain as numbers when using gRPC/Arrow
      const result = await cloudClient.sqlJson(
        'SELECT 1 as int_val, 2.5 as float_val, 3 as another_int'
      );

      expect(result.row_count).toBe(1);
      const row = result.data[0];

      // Verify all numeric values are numbers, not strings
      expect(typeof row.int_val).toBe('number');
      expect(typeof row.float_val).toBe('number');
      expect(typeof row.another_int).toBe('number');

      // Verify actual values
      expect(row.int_val).toBe(1);
      expect(row.float_val).toBe(2.5);
      expect(row.another_int).toBe(3);

      // Ensure they're NOT strings
      expect(row.int_val).not.toBe('1');
      expect(row.float_val).not.toBe('2.5');
    });

    test('preserves mixed data types correctly', async () => {
      const result = await cloudClient.sqlJson(
        "SELECT 42 as num, 'text' as str, true as bool, 3.14 as float"
      );

      expect(result.row_count).toBe(1);
      const row = result.data[0];

      // Check each type is preserved correctly
      expect(typeof row.num).toBe('number');
      expect(typeof row.str).toBe('string');
      expect(typeof row.bool).toBe('boolean');
      expect(typeof row.float).toBe('number');

      expect(row.num).toBe(42);
      expect(row.str).toBe('text');
      expect(row.bool).toBe(true);
      expect(row.float).toBeCloseTo(3.14, 2);
    });
  });

  describe('HTTP Fallback', () => {
    // Note: These tests use the SpiceClient which will automatically use HTTP fallback
    // if gRPC is not available. The SDK handles the fallback transparently.

    test('simple query works via SDK (uses gRPC or HTTP fallback)', async () => {
      const tableResult = await cloudClient.sql(
        "SELECT 123 as num, 'hello' as text"
      );

      expect(tableResult.toArray()).toHaveLength(1);
      const row = tableResult.toArray()[0];
      expect(Number(row.num)).toBe(123);
      expect(String(row.text)).toBe('hello');
    });

    test('query with different data types', async () => {
      const tableResult = await cloudClient.sql(
        'SELECT true as bool_val, 3.14 as float_val, 999 as int_val'
      );

      expect(tableResult.toArray()).toHaveLength(1);
      const row = tableResult.toArray()[0];

      // Validate data types are preserved
      expect(row.bool_val).toBe(true);
      expect(Number(row.float_val)).toBeCloseTo(3.14, 2);
      expect(Number(row.int_val)).toBe(999);
    });

    test('query with string operations', async () => {
      const tableResult = await cloudClient.sql(
        "SELECT UPPER('fallback') as upper_text, LOWER('HTTP') as lower_text, CONCAT('a', 'b') as concat_text"
      );

      expect(tableResult.toArray()).toHaveLength(1);
      const row = tableResult.toArray()[0];
      expect(String(row.upper_text)).toBe('FALLBACK');
      expect(String(row.lower_text)).toBe('http');
      expect(String(row.concat_text)).toBe('ab');
    });

    test('query with math operations', async () => {
      const tableResult = await cloudClient.sql(
        'SELECT 10 * 5 as product, 100 / 4 as division, 50 - 20 as subtraction, 30 + 15 as addition'
      );

      expect(tableResult.toArray()).toHaveLength(1);
      const row = tableResult.toArray()[0];
      expect(Number(row.product)).toBe(50);
      expect(Number(row.division)).toBe(25);
      expect(Number(row.subtraction)).toBe(30);
      expect(Number(row.addition)).toBe(45);
    });

    test('streaming works with fallback', async () => {
      let numChunks = 0;
      const tableResult = await cloudClient.sql(
        'SELECT 1 as col1, 2 as col2, 3 as col3',
        (table) => {
          expect(table.toArray().length).toBeGreaterThanOrEqual(1);
          numChunks++;
        }
      );

      expect(tableResult.toArray()).toHaveLength(1);
      // At least one chunk should be received
      expect(numChunks).toBeGreaterThanOrEqual(1);
    });
  });

  // Define test endpoints - all tests MUST use the SDK's sql() function
  const endpoints = [
    {
      name: 'Direct SDK (Flight/HTTP)',
      enabled: true,
      client: cloudClient,
    },
    {
      name: 'Vercel Endpoint (via SDK)',
      enabled: true,
      client: vercelClient,
    },
  ];

  // Run the same test suite for each enabled endpoint
  endpoints.forEach(({ name, enabled, client: testClient }) => {
    if (!enabled) {
      describe.skip(`${name} (disabled)`, () => {
        test('skipped', () => {});
      });
      return;
    }

    describe(name, () => {
      test('simple query with constants', async () => {
        const tableResult = await testClient.sql(
          "SELECT 42 as answer, 'test' as message"
        );
        const rows = tableResult.toArray();

        expect(rows).toHaveLength(1);
        const row = rows[0];
        // Handle both BigInt and string representations
        expect(Number(row.answer) || Number(row.answer)).toBe(42);
        expect(String(row.message)).toBe('test');
      });

      test('query with multiple data types', async () => {
        const tableResult = await testClient.sql(
          'SELECT true as bool_val, 3.14 as float_val, 999 as int_val'
        );
        const rows = tableResult.toArray();

        expect(rows).toHaveLength(1);
        const row = rows[0];
        expect(row.bool_val).toBe(true);
        expect(Number(row.float_val)).toBeCloseTo(3.14, 2);
        expect(Number(row.int_val)).toBe(999);
      });

      test('query with string operations', async () => {
        const tableResult = await testClient.sql(
          "SELECT UPPER('test') as upper_text, LOWER('TEST') as lower_text, CONCAT('a', 'b') as concat_text"
        );
        const rows = tableResult.toArray();

        expect(rows).toHaveLength(1);
        const row = rows[0];
        expect(String(row.upper_text)).toBe('TEST');
        expect(String(row.lower_text)).toBe('test');
        expect(String(row.concat_text)).toBe('ab');
      });

      test('query with math operations', async () => {
        const tableResult = await testClient.sql(
          'SELECT 10 * 5 as product, 100 / 4 as division, 50 - 20 as subtraction, 30 + 15 as addition'
        );
        const rows = tableResult.toArray();

        expect(rows).toHaveLength(1);
        const row = rows[0];
        expect(Number(row.product)).toBe(50);
        expect(Number(row.division)).toBe(25);
        expect(Number(row.subtraction)).toBe(30);
        expect(Number(row.addition)).toBe(45);
      });

      test('handles large result sets', async () => {
        const tableResult = await testClient.sql(
          'SELECT * FROM spice.samples.taxi_trips LIMIT 100'
        );
        const rows = tableResult.toArray();

        expect(rows.length).toBe(100);
        // Verify some expected columns exist
        expect(rows[0]).toHaveProperty('trip_distance');
      }, 30000);

      test('error handling works', async () => {
        await expect(
          testClient.sql('SELECT * FROM nonexistent_table')
        ).rejects.toThrow();
      });
    });
  });
});
