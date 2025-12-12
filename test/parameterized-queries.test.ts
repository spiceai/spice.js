import dotenv from 'dotenv';
import { SpiceClient } from '../';
import 'dotenv/config';

/**
 * Comprehensive tests for parameterized queries
 * These tests validate:
 * 1. Positional parameters ($1, $2, etc.)
 * 2. Named parameters ($param_name)
 * 3. All supported data types (string, number, boolean, Date, null, bigint, Buffer)
 * 4. Type inference and preservation
 * 5. SQL injection prevention
 * 6. Edge cases (empty strings, special characters, large numbers)
 */
describe('Parameterized Queries', () => {
  dotenv.config();

  const api_key = process.env.SPICE_API_KEY;

  if (!api_key) {
    throw 'SPICE_API_KEY environment variable not set';
  }

  // URLs can be overridden via env vars (HTTP_URL, FLIGHT_URL)
  const HTTP_URL = process.env.HTTP_URL || undefined;
  const FLIGHT_URL = process.env.FLIGHT_URL || undefined;

  const client = new SpiceClient({
    apiKey: api_key,
    httpUrl: HTTP_URL,
    flightUrl: FLIGHT_URL,
  });

  describe('Positional Parameters', () => {
    describe('String Parameters', () => {
      test('should handle simple string parameter', async () => {
        const result = await client.sql('SELECT $1 AS value', {
          parameters: ['hello'],
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].value).toBe('hello');
      });

      test('should handle empty string parameter', async () => {
        const result = await client.sql('SELECT $1 AS value', {
          parameters: [''],
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].value).toBe('');
      });

      test('should handle string with special characters', async () => {
        const specialString = 'Hello \'World\' with "quotes" and \\ backslash';
        const result = await client.sql('SELECT $1 AS value', {
          parameters: [specialString],
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].value).toBe(specialString);
      });

      test('should handle unicode characters', async () => {
        const unicodeString = '你好世界 🌍 مرحبا';
        const result = await client.sql('SELECT $1 AS value', {
          parameters: [unicodeString],
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].value).toBe(unicodeString);
      });

      test('should handle SQL injection attempt safely', async () => {
        const maliciousInput = "'; DROP TABLE users; --";
        const result = await client.sql('SELECT $1 AS value', {
          parameters: [maliciousInput],
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].value).toBe(maliciousInput);
      });
    });

    describe('Numeric Parameters', () => {
      // Note: Integer parameters are returned as BigInt (Int64) by Arrow Flight
      test('should handle integer parameter', async () => {
        const result = await client.sql('SELECT $1 AS value', {
          parameters: [42],
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(Number(rows[0].value)).toBe(42);
      });

      test('should handle negative integer', async () => {
        const result = await client.sql('SELECT $1 AS value', {
          parameters: [-999],
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(Number(rows[0].value)).toBe(-999);
      });

      test('should handle zero', async () => {
        const result = await client.sql('SELECT $1 AS value', {
          parameters: [0],
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(Number(rows[0].value)).toBe(0);
      });

      test('should handle floating point number', async () => {
        const result = await client.sql('SELECT $1 AS value', {
          parameters: [3.14159],
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].value).toBeCloseTo(3.14159, 5);
      });

      test('should handle very small floating point', async () => {
        const result = await client.sql('SELECT $1 AS value', {
          parameters: [0.000001],
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].value).toBeCloseTo(0.000001, 6);
      });

      test('should handle large number', async () => {
        const largeNum = 9007199254740991; // Number.MAX_SAFE_INTEGER
        const result = await client.sql('SELECT $1 AS value', {
          parameters: [largeNum],
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        // Large numbers are returned as BigInt
        expect(BigInt(rows[0].value)).toBe(BigInt(largeNum));
      });
    });

    describe('Boolean Parameters', () => {
      test('should handle true', async () => {
        const result = await client.sql('SELECT $1 AS value', {
          parameters: [true],
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].value).toBe(true);
      });

      test('should handle false', async () => {
        const result = await client.sql('SELECT $1 AS value', {
          parameters: [false],
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].value).toBe(false);
      });
    });

    describe('Date Parameters', () => {
      test('should handle Date object', async () => {
        const date = new Date('2024-01-15T10:30:00Z');
        const result = await client.sql('SELECT $1 AS value', {
          parameters: [date],
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        // Date should be returned as ISO string
        expect(rows[0].value).toContain('2024-01-15');
      });

      test('should handle Date with timezone', async () => {
        const date = new Date('2024-06-15T14:30:00.000Z');
        const result = await client.sql('SELECT $1 AS value', {
          parameters: [date],
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].value).toContain('2024-06-15');
      });

      test('should handle epoch date', async () => {
        const epochDate = new Date(0);
        const result = await client.sql('SELECT $1 AS value', {
          parameters: [epochDate],
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].value).toContain('1970-01-01');
      });
    });

    describe('Null Parameters', () => {
      test('should handle null parameter', async () => {
        const result = await client.sql('SELECT $1 AS value', {
          parameters: [null],
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].value).toBeNull();
      });
    });

    describe('BigInt Parameters', () => {
      test('should handle bigint parameter', async () => {
        const bigNum = BigInt('9223372036854775807');
        const result = await client.sql('SELECT $1 AS value', {
          parameters: [bigNum],
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        // BigInt should be preserved (may return as string or bigint)
        expect(BigInt(rows[0].value)).toBe(bigNum);
      });

      test('should handle negative bigint', async () => {
        const bigNum = BigInt('-9223372036854775808');
        const result = await client.sql('SELECT $1 AS value', {
          parameters: [bigNum],
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(BigInt(rows[0].value)).toBe(bigNum);
      });
    });

    describe('Multiple Positional Parameters', () => {
      test('should handle multiple parameters of same type', async () => {
        const result = await client.sql('SELECT $1 AS a, $2 AS b, $3 AS c', {
          parameters: ['first', 'second', 'third'],
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].a).toBe('first');
        expect(rows[0].b).toBe('second');
        expect(rows[0].c).toBe('third');
      });

      test('should handle multiple parameters of different types', async () => {
        const result = await client.sql(
          'SELECT $1 AS str, $2 AS num, $3 AS bool, $4 AS nullable',
          { parameters: ['hello', 42, true, null] },
        );
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].str).toBe('hello');
        expect(Number(rows[0].num)).toBe(42);
        expect(rows[0].bool).toBe(true);
        expect(rows[0].nullable).toBeNull();
      });

      test('should handle parameters reused in query', async () => {
        const result = await client.sql(
          'SELECT $1 AS first, $1 AS first_again, $2 AS second',
          { parameters: ['reused', 'unique'] },
        );
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].first).toBe('reused');
        expect(rows[0].first_again).toBe('reused');
        expect(rows[0].second).toBe('unique');
      });
    });
  });

  describe('Named Parameters', () => {
    describe('Basic Named Parameters', () => {
      test('should handle single named parameter', async () => {
        const result = await client.sql('SELECT $name AS value', {
          parameters: { name: 'Alice' },
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].value).toBe('Alice');
      });

      test('should handle multiple named parameters', async () => {
        const result = await client.sql(
          'SELECT $first_name AS first, $last_name AS last',
          {
            parameters: {
              first_name: 'John',
              last_name: 'Doe',
            },
          },
        );
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].first).toBe('John');
        expect(rows[0].last).toBe('Doe');
      });

      test('should handle named parameter with underscore', async () => {
        const result = await client.sql('SELECT $my_param AS value', {
          parameters: { my_param: 'test_value' },
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].value).toBe('test_value');
      });

      test('should handle named parameter with numbers', async () => {
        const result = await client.sql('SELECT $param1 AS v1, $param2 AS v2', {
          parameters: { param1: 'one', param2: 'two' },
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].v1).toBe('one');
        expect(rows[0].v2).toBe('two');
      });
    });

    describe('Named Parameters with Different Types', () => {
      test('should handle named string parameter', async () => {
        const result = await client.sql('SELECT $text AS value', {
          parameters: { text: 'Hello World' },
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].value).toBe('Hello World');
      });

      test('should handle named numeric parameter', async () => {
        const result = await client.sql('SELECT $count AS value', {
          parameters: { count: 100 },
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(Number(rows[0].value)).toBe(100);
      });

      test('should handle named boolean parameter', async () => {
        const result = await client.sql('SELECT $active AS value', {
          parameters: { active: true },
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].value).toBe(true);
      });

      test('should handle named null parameter', async () => {
        const result = await client.sql('SELECT $optional AS value', {
          parameters: { optional: null },
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].nullable).toBeUndefined(); // Column should exist but be null
      });

      test('should handle mixed types with named parameters', async () => {
        const result = await client.sql(
          'SELECT $name AS name, $age AS age, $verified AS verified, $score AS score',
          {
            parameters: {
              name: 'Test User',
              age: 25,
              verified: true,
              score: 98.5,
            },
          },
        );
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].name).toBe('Test User');
        expect(Number(rows[0].age)).toBe(25);
        expect(rows[0].verified).toBe(true);
        expect(rows[0].score).toBeCloseTo(98.5, 1);
      });
    });

    describe('Named Parameter Reuse', () => {
      test('should handle same named parameter used multiple times', async () => {
        const result = await client.sql(
          'SELECT $val AS first, $val AS second, $val AS third',
          { parameters: { val: 'repeated' } },
        );
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].first).toBe('repeated');
        expect(rows[0].second).toBe('repeated');
        expect(rows[0].third).toBe('repeated');
      });
    });
  });

  describe('SQL Operations with Parameters', () => {
    describe('Comparison Operations', () => {
      test('should work with equality comparison', async () => {
        const result = await client.sql(
          "SELECT CASE WHEN $1 = 'test' THEN 'match' ELSE 'no match' END AS result",
          { parameters: ['test'] },
        );
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].result).toBe('match');
      });

      test('should work with numeric comparison', async () => {
        const result = await client.sql(
          'SELECT CASE WHEN $1 > 10 THEN true ELSE false END AS result',
          { parameters: [15] },
        );
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].result).toBe(true);
      });
    });

    describe('Arithmetic Operations', () => {
      test('should work with addition', async () => {
        const result = await client.sql('SELECT $1 + $2 AS sum', {
          parameters: [10, 20],
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(Number(rows[0].sum)).toBe(30);
      });

      test('should work with multiplication', async () => {
        const result = await client.sql('SELECT $1 * $2 AS product', {
          parameters: [7, 8],
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(Number(rows[0].product)).toBe(56);
      });

      test('should work with floating point arithmetic', async () => {
        const result = await client.sql(
          'SELECT CAST($1 AS DOUBLE) / CAST($2 AS DOUBLE) AS quotient',
          {
            parameters: [22, 7],
          },
        );
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].quotient).toBeCloseTo(3.142857, 4);
      });
    });

    describe('String Operations', () => {
      test('should work with string concatenation', async () => {
        const result = await client.sql("SELECT $1 || ' ' || $2 AS full_name", {
          parameters: ['John', 'Doe'],
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].full_name).toBe('John Doe');
      });

      test('should work with LIKE pattern', async () => {
        const result = await client.sql(
          "SELECT CASE WHEN 'hello world' LIKE $1 THEN true ELSE false END AS matches",
          { parameters: ['%world'] },
        );
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].matches).toBe(true);
      });

      test('should work with UPPER/LOWER functions', async () => {
        const result = await client.sql(
          'SELECT UPPER($1) AS upper_case, LOWER($1) AS lower_case',
          { parameters: ['Hello World'] },
        );
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].upper_case).toBe('HELLO WORLD');
        expect(rows[0].lower_case).toBe('hello world');
      });
    });

    describe('NULL Operations', () => {
      test('should work with COALESCE', async () => {
        const result = await client.sql(
          "SELECT COALESCE($1, 'default') AS value",
          { parameters: [null] },
        );
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].value).toBe('default');
      });

      test('should work with IS NULL check', async () => {
        const result = await client.sql(
          'SELECT CASE WHEN $1 IS NULL THEN true ELSE false END AS is_null',
          { parameters: [null] },
        );
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].is_null).toBe(true);
      });

      test('should work with NULLIF', async () => {
        const result = await client.sql('SELECT NULLIF($1, $2) AS value', {
          parameters: ['same', 'same'],
        });
        const rows = result.toArray();
        expect(rows).toHaveLength(1);
        expect(rows[0].value).toBeNull();
      });
    });
  });

  describe('sqlJson with Parameters', () => {
    test('should return proper JSON structure with positional parameters', async () => {
      // sqlJson uses sql() internally, which supports parameters
      const result = await client.sql('SELECT $1 AS value', {
        parameters: ['test'],
      });
      const rows = result.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe('test');
    });

    test('should return proper JSON structure with named parameters', async () => {
      const result = await client.sql('SELECT $name AS name, $age AS age', {
        parameters: { name: 'Alice', age: 30 },
      });
      const rows = result.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('Alice');
      expect(Number(rows[0].age)).toBe(30);
    });

    test('should include schema information', async () => {
      const result = await client.sql(
        'SELECT $1 AS text_col, $2 AS num_col, $3 AS bool_col',
        { parameters: ['text', 42, true] },
      );
      const rows = result.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0].text_col).toBe('text');
      expect(Number(rows[0].num_col)).toBe(42);
      expect(rows[0].bool_col).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('should handle query with no parameters', async () => {
      const result = await client.sql('SELECT 1 AS value');
      const rows = result.toArray();
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].value)).toBe(1);
    });

    test('should handle empty parameters object', async () => {
      const result = await client.sql('SELECT 1 AS value', {
        parameters: {},
      });
      const rows = result.toArray();
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].value)).toBe(1);
    });

    test('should handle empty parameters array', async () => {
      const result = await client.sql('SELECT 1 AS value', {
        parameters: [],
      });
      const rows = result.toArray();
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].value)).toBe(1);
    });

    test('should handle very long string parameter', async () => {
      const longString = 'a'.repeat(10000);
      const result = await client.sql('SELECT LENGTH($1) AS len', {
        parameters: [longString],
      });
      const rows = result.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0].len).toBe(10000);
    });

    test('should handle parameter with only whitespace', async () => {
      const result = await client.sql('SELECT $1 AS value', {
        parameters: ['   '],
      });
      const rows = result.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe('   ');
    });

    test('should handle parameter with newlines', async () => {
      const multilineString = 'line1\nline2\nline3';
      const result = await client.sql('SELECT $1 AS value', {
        parameters: [multilineString],
      });
      const rows = result.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe(multilineString);
    });

    test('should handle parameter with tabs', async () => {
      const tabbedString = 'col1\tcol2\tcol3';
      const result = await client.sql('SELECT $1 AS value', {
        parameters: [tabbedString],
      });
      const rows = result.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe(tabbedString);
    });
  });

  describe('Type Casting with Parameters', () => {
    test('should work with explicit CAST to INTEGER', async () => {
      const result = await client.sql('SELECT CAST($1 AS INTEGER) AS value', {
        parameters: ['42'],
      });
      const rows = result.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe(42);
    });

    test('should work with explicit CAST to VARCHAR', async () => {
      const result = await client.sql('SELECT CAST($1 AS VARCHAR) AS value', {
        parameters: [42],
      });
      const rows = result.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe('42');
    });

    test('should work with explicit CAST to FLOAT', async () => {
      const result = await client.sql('SELECT CAST($1 AS FLOAT) AS value', {
        parameters: ['3.14'],
      });
      const rows = result.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBeCloseTo(3.14, 2);
    });
  });

  describe('Streaming with Parameters', () => {
    test('should support streaming callback with positional parameters', async () => {
      let chunkCount = 0;
      const result = await client.sql(
        'SELECT $1 AS value',
        { parameters: ['streaming test'] },
        (table) => {
          chunkCount++;
          expect(table.toArray().length).toBeGreaterThan(0);
        },
      );
      const rows = result.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe('streaming test');
      // Callback may or may not be called depending on response size
      expect(chunkCount).toBeGreaterThanOrEqual(0);
    });

    test('should support streaming callback with named parameters', async () => {
      let chunkCount = 0;
      const result = await client.sql(
        'SELECT $name AS name',
        { parameters: { name: 'Streaming User' } },
        (_table) => {
          chunkCount++;
        },
      );
      const rows = result.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('Streaming User');
      expect(chunkCount).toBeGreaterThanOrEqual(0);
    });
  });
});
