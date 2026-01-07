/**
 * Unit tests for parameter substitution logic
 * These tests validate the client-side parameter substitution without network calls
 */

describe('Parameter Substitution', () => {
  /**
   * Helper class to test the private parameter substitution methods
   * This mirrors the logic in GrpcFlightClient
   */
  class ParameterSubstitutionHelper {
    /**
     * Substitutes parameters into a SQL query using positional placeholders ($1, $2, etc.)
     * Parameters are processed in reverse order to avoid $1 matching the '1' in $10.
     */
    substitutePositionalParameters(
      queryText: string,
      parameters: any[],
    ): string {
      let result = queryText;
      // Process parameters in reverse order (highest to lowest) to avoid
      // $1 replacing the '1' in $10, $11, etc.
      for (let i = parameters.length - 1; i >= 0; i--) {
        const value = this.formatParameterValue(parameters[i]);
        // Use regex to match $N not followed by another digit
        const regex = new RegExp(`\\$${i + 1}(?![0-9])`, 'g');
        result = result.replace(regex, value);
      }
      return result;
    }

    /**
     * Substitutes named parameters into a SQL query ($name style)
     */
    substituteNamedParameters(
      queryText: string,
      parameters: Record<string, any>,
    ): string {
      let result = queryText;
      // Sort parameter names by length (descending) to avoid partial matches
      const sortedNames = Object.keys(parameters).sort(
        (a, b) => b.length - a.length,
      );
      for (const name of sortedNames) {
        const value = parameters[name];
        // Match $name followed by non-alphanumeric or end of string
        const regex = new RegExp(`\\$${name}(?![a-zA-Z0-9_])`, 'g');
        result = result.replace(regex, this.formatParameterValue(value));
      }
      return result;
    }

    /**
     * Formats a parameter value for SQL substitution
     */
    formatParameterValue(value: any): string {
      if (value === null || value === undefined) {
        return 'NULL';
      }
      if (typeof value === 'string') {
        // Escape single quotes and wrap in quotes
        return `'${value.replace(/'/g, "''")}'`;
      }
      if (typeof value === 'boolean') {
        return value ? 'TRUE' : 'FALSE';
      }
      if (typeof value === 'number' || typeof value === 'bigint') {
        return String(value);
      }
      if (value instanceof Date) {
        return `'${value.toISOString()}'`;
      }
      if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
        return `X'${Buffer.from(value).toString('hex')}'`;
      }
      // Handle Param objects
      if (value && typeof value === 'object' && 'value' in value) {
        return this.formatParameterValue(value.value);
      }
      // Default: convert to string
      return `'${String(value).replace(/'/g, "''")}'`;
    }
  }

  const helper = new ParameterSubstitutionHelper();

  describe('formatParameterValue', () => {
    describe('null and undefined', () => {
      test('should format null as NULL', () => {
        expect(helper.formatParameterValue(null)).toBe('NULL');
      });

      test('should format undefined as NULL', () => {
        expect(helper.formatParameterValue(undefined)).toBe('NULL');
      });
    });

    describe('strings', () => {
      test('should wrap string in single quotes', () => {
        expect(helper.formatParameterValue('hello')).toBe("'hello'");
      });

      test('should escape single quotes by doubling them', () => {
        expect(helper.formatParameterValue("O'Brien")).toBe("'O''Brien'");
      });

      test('should handle multiple single quotes', () => {
        expect(helper.formatParameterValue("It's John's")).toBe(
          "'It''s John''s'",
        );
      });

      test('should handle empty string', () => {
        expect(helper.formatParameterValue('')).toBe("''");
      });

      test('should handle string with double quotes', () => {
        expect(helper.formatParameterValue('say "hello"')).toBe(
          '\'say "hello"\'',
        );
      });

      test('should handle string with backslashes', () => {
        expect(helper.formatParameterValue('path\\to\\file')).toBe(
          "'path\\to\\file'",
        );
      });

      test('should handle unicode characters', () => {
        expect(helper.formatParameterValue('你好世界')).toBe("'你好世界'");
      });

      test('should handle emoji', () => {
        expect(helper.formatParameterValue('🎉 Party!')).toBe("'🎉 Party!'");
      });

      test('should handle newlines and tabs', () => {
        expect(helper.formatParameterValue('line1\nline2\ttab')).toBe(
          "'line1\nline2\ttab'",
        );
      });

      test('should handle control characters', () => {
        expect(helper.formatParameterValue('a\0b\x1fc')).toBe("'a\0b\x1fc'");
      });
    });

    describe('booleans', () => {
      test('should format true as TRUE', () => {
        expect(helper.formatParameterValue(true)).toBe('TRUE');
      });

      test('should format false as FALSE', () => {
        expect(helper.formatParameterValue(false)).toBe('FALSE');
      });
    });

    describe('numbers', () => {
      test('should format positive integer', () => {
        expect(helper.formatParameterValue(42)).toBe('42');
      });

      test('should format negative integer', () => {
        expect(helper.formatParameterValue(-123)).toBe('-123');
      });

      test('should format zero', () => {
        expect(helper.formatParameterValue(0)).toBe('0');
      });

      test('should format floating point', () => {
        expect(helper.formatParameterValue(3.14159)).toBe('3.14159');
      });

      test('should format negative floating point', () => {
        expect(helper.formatParameterValue(-99.99)).toBe('-99.99');
      });

      test('should format very small number', () => {
        expect(helper.formatParameterValue(0.0000001)).toBe('1e-7');
      });

      test('should format very large number', () => {
        expect(helper.formatParameterValue(1e20)).toBe('100000000000000000000');
      });

      test('should format Infinity', () => {
        expect(helper.formatParameterValue(Infinity)).toBe('Infinity');
      });

      test('should format NaN', () => {
        expect(helper.formatParameterValue(NaN)).toBe('NaN');
      });

      test('should format MAX_SAFE_INTEGER', () => {
        expect(helper.formatParameterValue(Number.MAX_SAFE_INTEGER)).toBe(
          '9007199254740991',
        );
      });
    });

    describe('bigint', () => {
      test('should format bigint', () => {
        expect(
          helper.formatParameterValue(BigInt('123456789012345678901234567890')),
        ).toBe('123456789012345678901234567890');
      });

      test('should format negative bigint', () => {
        expect(
          helper.formatParameterValue(BigInt('-9223372036854775808')),
        ).toBe('-9223372036854775808');
      });

      test('should format zero bigint', () => {
        expect(helper.formatParameterValue(BigInt(0))).toBe('0');
      });
    });

    describe('Date', () => {
      test('should format Date as ISO string', () => {
        const date = new Date('2024-01-15T10:30:00.000Z');
        expect(helper.formatParameterValue(date)).toBe(
          "'2024-01-15T10:30:00.000Z'",
        );
      });

      test('should format epoch date', () => {
        const date = new Date(0);
        expect(helper.formatParameterValue(date)).toBe(
          "'1970-01-01T00:00:00.000Z'",
        );
      });

      test('should include milliseconds', () => {
        const date = new Date('2024-06-15T14:30:15.123Z');
        expect(helper.formatParameterValue(date)).toBe(
          "'2024-06-15T14:30:15.123Z'",
        );
      });
    });

    describe('Buffer and Uint8Array', () => {
      test('should format Buffer as hex', () => {
        const buffer = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
        expect(helper.formatParameterValue(buffer)).toBe("X'deadbeef'");
      });

      test('should format empty Buffer', () => {
        const buffer = Buffer.from([]);
        expect(helper.formatParameterValue(buffer)).toBe("X''");
      });

      test('should format Uint8Array as hex', () => {
        const arr = new Uint8Array([0x01, 0x02, 0x03]);
        expect(helper.formatParameterValue(arr)).toBe("X'010203'");
      });
    });

    describe('objects with value property (Param objects)', () => {
      test('should extract value from Param object', () => {
        const param = { value: 'hello' };
        expect(helper.formatParameterValue(param)).toBe("'hello'");
      });

      test('should handle nested Param with number', () => {
        const param = { value: 42 };
        expect(helper.formatParameterValue(param)).toBe('42');
      });

      test('should handle Param with null value', () => {
        const param = { value: null };
        expect(helper.formatParameterValue(param)).toBe('NULL');
      });
    });

    describe('other objects', () => {
      test('should format object as quoted string', () => {
        const obj = { foo: 'bar' };
        expect(helper.formatParameterValue(obj)).toBe("'[object Object]'");
      });

      test('should format array as quoted string', () => {
        const arr = [1, 2, 3];
        expect(helper.formatParameterValue(arr)).toBe("'1,2,3'");
      });
    });
  });

  describe('substitutePositionalParameters', () => {
    test('should substitute single parameter', () => {
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM users WHERE id = $1',
        [42],
      );
      expect(result).toBe('SELECT * FROM users WHERE id = 42');
    });

    test('should substitute multiple parameters', () => {
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM users WHERE name = $1 AND age > $2',
        ['John', 25],
      );
      expect(result).toBe(
        "SELECT * FROM users WHERE name = 'John' AND age > 25",
      );
    });

    test('should substitute same parameter multiple times', () => {
      const result = helper.substitutePositionalParameters(
        'SELECT $1 AS a, $1 AS b, $2 AS c',
        ['value', 100],
      );
      expect(result).toBe("SELECT 'value' AS a, 'value' AS b, 100 AS c");
    });

    test('should handle parameters in different order', () => {
      const result = helper.substitutePositionalParameters(
        'INSERT INTO t (c, b, a) VALUES ($3, $2, $1)',
        ['first', 'second', 'third'],
      );
      expect(result).toBe(
        "INSERT INTO t (c, b, a) VALUES ('third', 'second', 'first')",
      );
    });

    test('should handle null parameter', () => {
      const result = helper.substitutePositionalParameters(
        'UPDATE users SET email = $1 WHERE id = $2',
        [null, 1],
      );
      expect(result).toBe('UPDATE users SET email = NULL WHERE id = 1');
    });

    test('should handle boolean parameters', () => {
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM features WHERE enabled = $1',
        [true],
      );
      expect(result).toBe('SELECT * FROM features WHERE enabled = TRUE');
    });

    test('should not substitute $10 when looking for $1', () => {
      const result = helper.substitutePositionalParameters('SELECT $1, $10', [
        'a',
        'b',
        'c',
        'd',
        'e',
        'f',
        'g',
        'h',
        'i',
        'j',
      ]);
      expect(result).toBe("SELECT 'a', 'j'");
    });

    test('should handle empty parameters array', () => {
      const result = helper.substitutePositionalParameters('SELECT 1', []);
      expect(result).toBe('SELECT 1');
    });

    test('should escape SQL injection in string parameter', () => {
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM users WHERE name = $1',
        ["'; DROP TABLE users; --"],
      );
      expect(result).toBe(
        "SELECT * FROM users WHERE name = '''; DROP TABLE users; --'",
      );
    });

    test('should preserve $$ dollar quoting (PostgreSQL)', () => {
      // Note: Our implementation will not touch $$ because it's not $1, $2, etc.
      const result = helper.substitutePositionalParameters(
        'SELECT $$literal$$ AS x, $1 AS y',
        ['value'],
      );
      expect(result).toBe("SELECT $$literal$$ AS x, 'value' AS y");
    });
  });

  describe('substituteNamedParameters', () => {
    test('should substitute single named parameter', () => {
      const result = helper.substituteNamedParameters(
        'SELECT * FROM users WHERE name = $name',
        { name: 'Alice' },
      );
      expect(result).toBe("SELECT * FROM users WHERE name = 'Alice'");
    });

    test('should substitute multiple named parameters', () => {
      const result = helper.substituteNamedParameters(
        'SELECT * FROM users WHERE name = $name AND age > $min_age',
        { name: 'Bob', min_age: 21 },
      );
      expect(result).toBe(
        "SELECT * FROM users WHERE name = 'Bob' AND age > 21",
      );
    });

    test('should substitute same parameter multiple times', () => {
      const result = helper.substituteNamedParameters(
        'SELECT $val AS a, $val AS b, $other AS c',
        { val: 'repeated', other: 'different' },
      );
      expect(result).toBe(
        "SELECT 'repeated' AS a, 'repeated' AS b, 'different' AS c",
      );
    });

    test('should not substitute partial matches', () => {
      const result = helper.substituteNamedParameters(
        'SELECT * FROM users WHERE name = $n AND nickname = $name',
        { n: 'x', name: 'Alice' },
      );
      expect(result).toBe(
        "SELECT * FROM users WHERE name = 'x' AND nickname = 'Alice'",
      );
    });

    test('should handle parameter at end of query', () => {
      const result = helper.substituteNamedParameters(
        'SELECT * FROM users WHERE name = $name',
        { name: 'Test' },
      );
      expect(result).toBe("SELECT * FROM users WHERE name = 'Test'");
    });

    test('should handle parameter followed by comma', () => {
      const result = helper.substituteNamedParameters('SELECT $a, $b FROM t', {
        a: 1,
        b: 2,
      });
      expect(result).toBe('SELECT 1, 2 FROM t');
    });

    test('should handle parameter followed by parenthesis', () => {
      const result = helper.substituteNamedParameters(
        'SELECT UPPER($name) FROM t',
        { name: 'hello' },
      );
      expect(result).toBe("SELECT UPPER('hello') FROM t");
    });

    test('should handle underscore in parameter name', () => {
      const result = helper.substituteNamedParameters(
        'SELECT * FROM t WHERE col = $my_param',
        { my_param: 'value' },
      );
      expect(result).toBe("SELECT * FROM t WHERE col = 'value'");
    });

    test('should handle numbers in parameter name', () => {
      const result = helper.substituteNamedParameters(
        'SELECT $param1, $param2',
        { param1: 'a', param2: 'b' },
      );
      expect(result).toBe("SELECT 'a', 'b'");
    });

    test('should not substitute $1 style positional parameters', () => {
      const result = helper.substituteNamedParameters('SELECT $1, $name', {
        name: 'Alice',
      });
      expect(result).toBe("SELECT $1, 'Alice'");
    });

    test('should handle longer parameter names before shorter ones', () => {
      // This tests that $name_full is replaced before $name
      const result = helper.substituteNamedParameters(
        'SELECT $name, $name_full',
        { name: 'short', name_full: 'long value' },
      );
      expect(result).toBe("SELECT 'short', 'long value'");
    });

    test('should handle empty parameters object', () => {
      const result = helper.substituteNamedParameters('SELECT 1', {});
      expect(result).toBe('SELECT 1');
    });

    test('should escape SQL injection in named parameter', () => {
      const result = helper.substituteNamedParameters(
        'SELECT * FROM users WHERE name = $name',
        { name: "'; DROP TABLE users; --" },
      );
      expect(result).toBe(
        "SELECT * FROM users WHERE name = '''; DROP TABLE users; --'",
      );
    });
  });

  describe('SQL injection prevention', () => {
    test('should safely handle comment injection', () => {
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM users WHERE name = $1',
        ['admin --'],
      );
      expect(result).toBe("SELECT * FROM users WHERE name = 'admin --'");
    });

    test('should safely handle UNION injection', () => {
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM users WHERE id = $1',
        ['1 UNION SELECT * FROM secrets'],
      );
      expect(result).toBe(
        "SELECT * FROM users WHERE id = '1 UNION SELECT * FROM secrets'",
      );
    });

    test('should safely handle semicolon injection', () => {
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM users WHERE name = $1',
        ['test; DELETE FROM users;'],
      );
      expect(result).toBe(
        "SELECT * FROM users WHERE name = 'test; DELETE FROM users;'",
      );
    });

    test('should safely handle escaped quote injection', () => {
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM users WHERE name = $1',
        ["test\\'; DROP TABLE--"],
      );
      // The single quote after backslash is still escaped by doubling
      expect(result).toBe(
        "SELECT * FROM users WHERE name = 'test\\''; DROP TABLE--'",
      );
    });

    test('should safely handle null byte injection', () => {
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM users WHERE name = $1',
        ['admin\x00'],
      );
      expect(result).toBe("SELECT * FROM users WHERE name = 'admin\x00'");
    });

    test('should safely handle backslash escape attempt', () => {
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM users WHERE name = $1',
        ['test\\'],
      );
      expect(result).toBe("SELECT * FROM users WHERE name = 'test\\'");
    });
  });

  describe('edge cases', () => {
    test('should handle very long parameter value', () => {
      const longString = 'a'.repeat(100000);
      const result = helper.substitutePositionalParameters('SELECT $1', [
        longString,
      ]);
      // "SELECT '" (8 chars) + longString (100000 chars) + "'" (1 char) = 100009
      expect(result.length).toBe(8 + 100000 + 1);
    });

    test('should handle many parameters', () => {
      const params = Array.from({ length: 100 }, (_, i) => i);
      const placeholders = params.map((_, i) => `$${i + 1}`).join(', ');
      const result = helper.substitutePositionalParameters(
        `SELECT ${placeholders}`,
        params,
      );
      const expected = `SELECT ${params.join(', ')}`;
      expect(result).toBe(expected);
    });

    test('should handle special regex characters in parameter name', () => {
      // Note: Our regex uses the parameter name directly, so special chars
      // in names could cause issues. This test documents expected behavior.
      // Since parameter names come from user code (not user input), this is
      // generally safe, but we should be aware of the limitation.
      const result = helper.substituteNamedParameters('SELECT $simple', {
        simple: 'works',
      });
      expect(result).toBe("SELECT 'works'");
    });

    test('should handle query with no placeholders', () => {
      const result = helper.substitutePositionalParameters('SELECT 1 + 1', []);
      expect(result).toBe('SELECT 1 + 1');
    });

    test('should handle multiline query', () => {
      const query = `
        SELECT *
        FROM users
        WHERE name = $1
          AND age > $2
        ORDER BY created_at
      `;
      const result = helper.substitutePositionalParameters(query, [
        'Test User',
        25,
      ]);
      expect(result).toContain("name = 'Test User'");
      expect(result).toContain('age > 25');
    });

    test('should handle parameter adjacent to operators', () => {
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM t WHERE a=$1 AND b>$2 AND c<$3',
        [1, 2, 3],
      );
      expect(result).toBe('SELECT * FROM t WHERE a=1 AND b>2 AND c<3');
    });

    test('should handle parameter in parentheses', () => {
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM t WHERE id IN ($1)',
        [42],
      );
      expect(result).toBe('SELECT * FROM t WHERE id IN (42)');
    });

    test('should handle Date parameter', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM events WHERE created_at = $1',
        [date],
      );
      expect(result).toBe(
        "SELECT * FROM events WHERE created_at = '2024-01-15T10:30:00.000Z'",
      );
    });

    test('should handle Buffer parameter', () => {
      const buffer = Buffer.from([0xca, 0xfe]);
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM blobs WHERE data = $1',
        [buffer],
      );
      expect(result).toBe("SELECT * FROM blobs WHERE data = X'cafe'");
    });

    test('should handle bigint parameter', () => {
      const bigNum = BigInt('9223372036854775807');
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM accounts WHERE id = $1',
        [bigNum],
      );
      expect(result).toBe(
        'SELECT * FROM accounts WHERE id = 9223372036854775807',
      );
    });
  });

  describe('HTTP Parameter Conversion', () => {
    /**
     * Helper class to test HTTP parameter conversion
     */
    class HttpParameterHelper {
      convertParametersForHttp(
        parameters?: any[] | Record<string, any>,
      ): any[] {
        if (!parameters) {
          return [];
        }

        if (Array.isArray(parameters)) {
          return parameters.map((val) => {
            if (val === null) return null;
            if (val instanceof Date) return val.toISOString();
            if (typeof val === 'bigint') return val.toString();
            if (
              val &&
              typeof (val as any).toString === 'function' &&
              (val as any).type === 'Buffer'
            ) {
              return (val as any).toString('base64');
            }
            return val;
          });
        } else {
          return Object.entries(parameters).map(([name, value]) => {
            let serializedValue: any = value;
            if (value instanceof Date) serializedValue = value.toISOString();
            else if (typeof value === 'bigint')
              serializedValue = value.toString();
            else if (
              value &&
              typeof (value as any).toString === 'function' &&
              (value as any).type === 'Buffer'
            ) {
              serializedValue = (value as any).toString('base64');
            }

            return { name, value: serializedValue };
          });
        }
      }
    }

    const httpHelper = new HttpParameterHelper();

    describe('positional parameters', () => {
      test('should return empty array for undefined', () => {
        expect(httpHelper.convertParametersForHttp(undefined)).toEqual([]);
      });

      test('should return empty array for empty array', () => {
        expect(httpHelper.convertParametersForHttp([])).toEqual([]);
      });

      test('should pass through primitive values', () => {
        const result = httpHelper.convertParametersForHttp([
          'string',
          42,
          true,
          false,
        ]);
        expect(result).toEqual(['string', 42, true, false]);
      });

      test('should convert null to null', () => {
        const result = httpHelper.convertParametersForHttp([null, 'test']);
        expect(result).toEqual([null, 'test']);
      });

      test('should convert Date to ISO string', () => {
        const date = new Date('2024-01-15T10:30:00.000Z');
        const result = httpHelper.convertParametersForHttp([date]);
        expect(result).toEqual(['2024-01-15T10:30:00.000Z']);
      });

      test('should convert bigint to string', () => {
        const bigNum = BigInt('9223372036854775807');
        const result = httpHelper.convertParametersForHttp([bigNum]);
        expect(result).toEqual(['9223372036854775807']);
      });

      test('should handle mixed types', () => {
        const date = new Date('2024-06-15T14:00:00.000Z');
        const bigNum = BigInt('12345678901234567890');
        const result = httpHelper.convertParametersForHttp([
          'hello',
          42,
          true,
          null,
          date,
          bigNum,
        ]);
        expect(result).toEqual([
          'hello',
          42,
          true,
          null,
          '2024-06-15T14:00:00.000Z',
          '12345678901234567890',
        ]);
      });
    });

    describe('named parameters', () => {
      test('should return empty array for empty object', () => {
        expect(httpHelper.convertParametersForHttp({})).toEqual([]);
      });

      test('should convert named parameters to name/value pairs', () => {
        const result = httpHelper.convertParametersForHttp({
          name: 'Alice',
          age: 30,
        });
        expect(result).toContainEqual({ name: 'name', value: 'Alice' });
        expect(result).toContainEqual({ name: 'age', value: 30 });
      });

      test('should convert Date in named parameters', () => {
        const date = new Date('2024-01-15T10:30:00.000Z');
        const result = httpHelper.convertParametersForHttp({
          created_at: date,
        });
        expect(result).toContainEqual({
          name: 'created_at',
          value: '2024-01-15T10:30:00.000Z',
        });
      });

      test('should convert bigint in named parameters', () => {
        const bigNum = BigInt('9223372036854775807');
        const result = httpHelper.convertParametersForHttp({
          big_id: bigNum,
        });
        expect(result).toContainEqual({
          name: 'big_id',
          value: '9223372036854775807',
        });
      });

      test('should handle null in named parameters', () => {
        const result = httpHelper.convertParametersForHttp({
          optional: null,
        });
        expect(result).toContainEqual({ name: 'optional', value: null });
      });

      test('should handle mixed types in named parameters', () => {
        const date = new Date('2024-06-15T14:00:00.000Z');
        const bigNum = BigInt('12345');
        const result = httpHelper.convertParametersForHttp({
          str: 'text',
          num: 42,
          bool: true,
          nullable: null,
          date: date,
          bigint: bigNum,
        });
        expect(result).toHaveLength(6);
        expect(result).toContainEqual({ name: 'str', value: 'text' });
        expect(result).toContainEqual({ name: 'num', value: 42 });
        expect(result).toContainEqual({ name: 'bool', value: true });
        expect(result).toContainEqual({ name: 'nullable', value: null });
        expect(result).toContainEqual({
          name: 'date',
          value: '2024-06-15T14:00:00.000Z',
        });
        expect(result).toContainEqual({ name: 'bigint', value: '12345' });
      });
    });
  });

  describe('formatParameterValue - additional edge cases', () => {
    test('should handle MIN_SAFE_INTEGER', () => {
      expect(helper.formatParameterValue(Number.MIN_SAFE_INTEGER)).toBe(
        '-9007199254740991',
      );
    });

    test('should handle negative zero', () => {
      expect(helper.formatParameterValue(-0)).toBe('0');
    });

    test('should handle negative Infinity', () => {
      expect(helper.formatParameterValue(-Infinity)).toBe('-Infinity');
    });

    test('should handle string with only single quote', () => {
      expect(helper.formatParameterValue("'")).toBe("''''");
    });

    test('should handle string with multiple consecutive quotes', () => {
      expect(helper.formatParameterValue("'''")).toBe("''''''''");
    });

    test('should handle very long bigint', () => {
      const veryLongBigInt = BigInt(
        '123456789012345678901234567890123456789012345678901234567890',
      );
      expect(helper.formatParameterValue(veryLongBigInt)).toBe(
        '123456789012345678901234567890123456789012345678901234567890',
      );
    });

    test('should handle Date with maximum year', () => {
      const futureDate = new Date('9999-12-31T23:59:59.999Z');
      expect(helper.formatParameterValue(futureDate)).toBe(
        "'9999-12-31T23:59:59.999Z'",
      );
    });

    test('should handle Uint8Array with all zeros', () => {
      const zeros = new Uint8Array([0x00, 0x00, 0x00]);
      expect(helper.formatParameterValue(zeros)).toBe("X'000000'");
    });

    test('should handle Uint8Array with all 0xFF', () => {
      const ones = new Uint8Array([0xff, 0xff, 0xff]);
      expect(helper.formatParameterValue(ones)).toBe("X'ffffff'");
    });

    test('should handle nested Param with Date', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      const param = { value: date };
      expect(helper.formatParameterValue(param)).toBe(
        "'2024-01-15T10:30:00.000Z'",
      );
    });

    test('should handle nested Param with boolean', () => {
      expect(helper.formatParameterValue({ value: true })).toBe('TRUE');
      expect(helper.formatParameterValue({ value: false })).toBe('FALSE');
    });

    test('should handle nested Param with bigint', () => {
      const param = { value: BigInt('999999999999999999') };
      expect(helper.formatParameterValue(param)).toBe('999999999999999999');
    });

    test('should handle string with SQL keywords', () => {
      expect(helper.formatParameterValue('SELECT * FROM users')).toBe(
        "'SELECT * FROM users'",
      );
    });

    test('should handle string with percent sign (LIKE wildcard)', () => {
      expect(helper.formatParameterValue('%admin%')).toBe("'%admin%'");
    });

    test('should handle string with underscore (LIKE wildcard)', () => {
      expect(helper.formatParameterValue('user_name')).toBe("'user_name'");
    });

    test('should handle Symbol gracefully', () => {
      const symbol = Symbol('test');
      expect(helper.formatParameterValue(symbol)).toBe("'Symbol(test)'");
    });

    test('should handle function gracefully', () => {
      const fn = function testFunc() {};
      const result = helper.formatParameterValue(fn);
      expect(result).toContain("'");
      expect(result).toContain('function');
    });

    test('should handle object with custom toString', () => {
      const obj = {
        toString() {
          return 'custom string';
        },
      };
      expect(helper.formatParameterValue(obj)).toBe("'custom string'");
    });

    test('should handle Map object', () => {
      const map = new Map([['key', 'value']]);
      expect(helper.formatParameterValue(map)).toBe("'[object Map]'");
    });

    test('should handle Set object', () => {
      const set = new Set([1, 2, 3]);
      expect(helper.formatParameterValue(set)).toBe("'[object Set]'");
    });

    test('should handle RegExp object', () => {
      const regex = /test/gi;
      expect(helper.formatParameterValue(regex)).toBe("'/test/gi'");
    });
  });

  describe('substituteNamedParameters - additional edge cases', () => {
    test('should handle Date in named parameter', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      const result = helper.substituteNamedParameters(
        'SELECT * FROM events WHERE created_at > $since',
        { since: date },
      );
      expect(result).toBe(
        "SELECT * FROM events WHERE created_at > '2024-01-15T10:30:00.000Z'",
      );
    });

    test('should handle boolean in named parameter', () => {
      const result = helper.substituteNamedParameters(
        'SELECT * FROM users WHERE active = $is_active',
        { is_active: true },
      );
      expect(result).toBe('SELECT * FROM users WHERE active = TRUE');
    });

    test('should handle null in named parameter', () => {
      const result = helper.substituteNamedParameters(
        'SELECT * FROM users WHERE deleted_at IS $status',
        { status: null },
      );
      expect(result).toBe('SELECT * FROM users WHERE deleted_at IS NULL');
    });

    test('should handle bigint in named parameter', () => {
      const bigNum = BigInt('9223372036854775807');
      const result = helper.substituteNamedParameters(
        'SELECT * FROM accounts WHERE balance > $min_balance',
        { min_balance: bigNum },
      );
      expect(result).toBe(
        'SELECT * FROM accounts WHERE balance > 9223372036854775807',
      );
    });

    test('should handle parameter name with leading number (invalid)', () => {
      // Parameter names starting with numbers should still work
      const result = helper.substituteNamedParameters('SELECT $1st, $2nd', {
        '1st': 'first',
        '2nd': 'second',
      });
      // Note: this is technically using positional-like names
      expect(result).toContain('first');
    });

    test('should handle very long parameter name', () => {
      const longName = 'a'.repeat(100);
      const params: Record<string, any> = {};
      params[longName] = 'value';
      const result = helper.substituteNamedParameters(
        `SELECT $${longName}`,
        params,
      );
      expect(result).toBe("SELECT 'value'");
    });

    test('should handle parameter in CASE expression', () => {
      const result = helper.substituteNamedParameters(
        'SELECT CASE WHEN status = $expected THEN 1 ELSE 0 END AS match',
        { expected: 'active' },
      );
      expect(result).toBe(
        "SELECT CASE WHEN status = 'active' THEN 1 ELSE 0 END AS match",
      );
    });

    test('should handle parameter in subquery', () => {
      const result = helper.substituteNamedParameters(
        'SELECT * FROM orders WHERE user_id IN (SELECT id FROM users WHERE role = $role)',
        { role: 'admin' },
      );
      expect(result).toBe(
        "SELECT * FROM orders WHERE user_id IN (SELECT id FROM users WHERE role = 'admin')",
      );
    });
  });

  describe('Param class integration', () => {
    // Import the Param class for testing
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Param } = require('../src/param');

    test('should handle Param.int32 in positional parameters', () => {
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM users WHERE id = $1',
        [Param.int32(42)],
      );
      expect(result).toBe('SELECT * FROM users WHERE id = 42');
    });

    test('should handle Param.string in positional parameters', () => {
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM users WHERE name = $1',
        [Param.string("O'Brien")],
      );
      expect(result).toBe("SELECT * FROM users WHERE name = 'O''Brien'");
    });

    test('should handle Param.int64 with bigint value', () => {
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM accounts WHERE id = $1',
        [Param.int64(BigInt('9223372036854775807'))],
      );
      expect(result).toBe(
        'SELECT * FROM accounts WHERE id = 9223372036854775807',
      );
    });

    test('should handle Param.bool in positional parameters', () => {
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM users WHERE active = $1',
        [Param.bool(true)],
      );
      expect(result).toBe('SELECT * FROM users WHERE active = TRUE');
    });

    test('should handle Param.null', () => {
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM users WHERE deleted_at IS $1',
        [Param.null()],
      );
      expect(result).toBe('SELECT * FROM users WHERE deleted_at IS NULL');
    });

    test('should handle Param.timestamp', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM events WHERE created_at = $1',
        [Param.timestamp(date)],
      );
      expect(result).toBe(
        "SELECT * FROM events WHERE created_at = '2024-01-15T10:30:00.000Z'",
      );
    });

    test('should handle Param.binary', () => {
      const buffer = Buffer.from([0xca, 0xfe]);
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM blobs WHERE data = $1',
        [Param.binary(buffer)],
      );
      expect(result).toBe("SELECT * FROM blobs WHERE data = X'cafe'");
    });

    test('should handle multiple Param types in one query', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM orders WHERE customer_id = $1 AND status = $2 AND created_at > $3 AND total > $4',
        [
          Param.int64(12345),
          Param.string('shipped'),
          Param.timestamp(date),
          Param.float64(99.99),
        ],
      );
      expect(result).toBe(
        "SELECT * FROM orders WHERE customer_id = 12345 AND status = 'shipped' AND created_at > '2024-01-15T10:30:00.000Z' AND total > 99.99",
      );
    });

    test('should handle Param in named parameters', () => {
      const result = helper.substituteNamedParameters(
        'SELECT * FROM users WHERE id = $id AND name = $name',
        { id: Param.int32(42), name: Param.string('Alice') },
      );
      expect(result).toBe(
        "SELECT * FROM users WHERE id = 42 AND name = 'Alice'",
      );
    });

    test('should handle mixed Param and plain values', () => {
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM users WHERE id = $1 AND age > $2',
        [Param.int64(42), 18], // Mixed: Param and plain number
      );
      expect(result).toBe('SELECT * FROM users WHERE id = 42 AND age > 18');
    });

    test('should handle Param.decimal128', () => {
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM products WHERE price >= $1',
        [Param.decimal128(99.99, { precision: 10, scale: 2 })],
      );
      expect(result).toBe('SELECT * FROM products WHERE price >= 99.99');
    });

    test('should handle Param.date32', () => {
      const date = new Date('2024-01-15T00:00:00.000Z');
      const result = helper.substitutePositionalParameters(
        'SELECT * FROM events WHERE event_date = $1',
        [Param.date32(date)],
      );
      expect(result).toBe(
        "SELECT * FROM events WHERE event_date = '2024-01-15T00:00:00.000Z'",
      );
    });
  });
});
