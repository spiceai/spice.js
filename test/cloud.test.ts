import dotenv from 'dotenv';
import { SpiceClient } from '../';
import 'dotenv/config';

describe('cloud', () => {
  dotenv.config();

  const api_key = process.env.SPICEAI_API_KEY;

  if (!api_key) {
    throw 'API_KEY environment variable not set';
  }

  const HTTP_DATA_PATH = process.env.HTTP_URL
    ? process.env.HTTP_URL
    : 'https://data.spiceai.io';
  const FLIGHT_PATH = process.env.FLIGHT_URL
    ? process.env.FLIGHT_URL
    : 'flight.spiceai.io:443';

  const client = new SpiceClient({
    apiKey: api_key,
    httpUrl: HTTP_DATA_PATH,
    flightUrl: FLIGHT_PATH,
  });

  const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

  describe('Flight (gRPC)', () => {
    test('legacy client uses spice.ai cloud ', async () => {
      const client = new SpiceClient(api_key);

      const tableResult = await client.query(
        'SELECT * FROM spice.samples.taxi_trips LIMIT 10;',
      );

      expect(tableResult.toArray()).toHaveLength(10);
    });

    test('streaming works', async () => {
      let numChunks = 0;
      await client.query(
        'SELECT * FROM spice.samples.taxi_trips LIMIT 10;',
        (table) => {
          expect(table.toArray().length).toBeLessThanOrEqual(10);

          let trip_distance = table.getChild('trip_distance');
          expect(trip_distance).toBeTruthy();
          numChunks++;
        },
      );
      expect(numChunks).toBeGreaterThanOrEqual(1);
      expect(numChunks).toBeLessThanOrEqual(3);
    }, 10000);

    test('full result works', async () => {
      const tableResult = await client.query(
        'SELECT * FROM spice.samples.taxi_trips LIMIT 10;',
      );
      expect(tableResult.toArray()).toHaveLength(10);
    }, 30000);

    test('query with simple constants', async () => {
      const tableResult = await client.query(
        "SELECT 42 as answer, 'test' as message",
      );
      expect(tableResult.toArray()).toHaveLength(1);
      const row = tableResult.toArray()[0];
      expect(Number(row.answer)).toBe(42);
      expect(String(row.message)).toBe('test');
    });
  });

  describe('HTTP Fallback', () => {
    // Note: These tests use the SpiceClient which will automatically use HTTP fallback
    // if gRPC is not available. The SDK handles the fallback transparently.

    test('simple query works via SDK (uses gRPC or HTTP fallback)', async () => {
      const tableResult = await client.query(
        "SELECT 123 as num, 'hello' as text",
      );

      expect(tableResult.toArray()).toHaveLength(1);
      const row = tableResult.toArray()[0];
      expect(Number(row.num)).toBe(123);
      expect(String(row.text)).toBe('hello');
    });

    test('query with different data types', async () => {
      const tableResult = await client.query(
        'SELECT true as bool_val, 3.14 as float_val, 999 as int_val',
      );

      expect(tableResult.toArray()).toHaveLength(1);
      const row = tableResult.toArray()[0];

      // Validate data types are preserved
      expect(row.bool_val).toBe(true);
      expect(Number(row.float_val)).toBeCloseTo(3.14, 2);
      expect(Number(row.int_val)).toBe(999);
    });

    test('query with string operations', async () => {
      const tableResult = await client.query(
        "SELECT UPPER('fallback') as upper_text, LOWER('HTTP') as lower_text, CONCAT('a', 'b') as concat_text",
      );

      expect(tableResult.toArray()).toHaveLength(1);
      const row = tableResult.toArray()[0];
      expect(String(row.upper_text)).toBe('FALLBACK');
      expect(String(row.lower_text)).toBe('http');
      expect(String(row.concat_text)).toBe('ab');
    });

    test('query with math operations', async () => {
      const tableResult = await client.query(
        'SELECT 10 * 5 as product, 100 / 4 as division, 50 - 20 as subtraction, 30 + 15 as addition',
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
      const tableResult = await client.query(
        'SELECT 1 as col1, 2 as col2, 3 as col3',
        (table) => {
          expect(table.toArray().length).toBeGreaterThanOrEqual(1);
          numChunks++;
        },
      );

      expect(tableResult.toArray()).toHaveLength(1);
      // At least one chunk should be received
      expect(numChunks).toBeGreaterThanOrEqual(1);
    });
  });
});
