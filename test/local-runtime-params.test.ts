import { SpiceClient } from '../';

/**
 * Parameterized query tests against a live local Spice runtime.
 *
 * These run in the Local Runtime CI job, which starts a real `spiced`, so they
 * exercise the full parameter path end-to-end over gRPC Arrow Flight — unlike
 * the unit tests, which never touch a server.
 *
 * The assertions are value-based on anchored expressions, deliberately not
 * pinned to the parameter transport: they must hold whether parameters are
 * substituted client-side or bound server-side as Flight SQL prepared
 * statements, so the suite guards a migration between the two.
 */
describe('local runtime parameterized queries', () => {
  const client = new SpiceClient();

  describe('positional parameters', () => {
    test('numeric parameters in expressions', async () => {
      const table = await client.sql('SELECT $1 + $2 AS total', {
        parameters: [40, 2],
      });
      const rows = table.toArray();
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].total)).toBe(42);
    });

    test('string parameter round-trips', async () => {
      const table = await client.sql('SELECT upper($1) AS u, $2 AS raw', {
        parameters: ['abc', 'hello world'],
      });
      const row = table.toArray()[0];
      expect(String(row.u)).toBe('ABC');
      expect(String(row.raw)).toBe('hello world');
    });

    test('boolean parameter drives a CASE expression', async () => {
      const table = await client.sql(
        "SELECT CASE WHEN $1 THEN 'yes' ELSE 'no' END AS answer",
        { parameters: [true] },
      );
      expect(String(table.toArray()[0].answer)).toBe('yes');
    });

    test('parameters in a comparison predicate', async () => {
      const table = await client.sql('SELECT ($1 > $2) AS gt, ($1 = $1) AS eq', {
        parameters: [10, 3],
      });
      const row = table.toArray()[0];
      expect(Boolean(row.gt)).toBe(true);
      expect(Boolean(row.eq)).toBe(true);
    });

    test('ten or more positional parameters keep their positions', async () => {
      // $1 vs $10 disambiguation is a classic substitution/binding bug source
      const table = await client.sql(
        'SELECT $10 AS last, $1 AS first, $2 + $3 + $4 + $5 + $6 + $7 + $8 + $9 AS mid',
        { parameters: [1, 2, 3, 4, 5, 6, 7, 8, 9, 100] },
      );
      const row = table.toArray()[0];
      expect(Number(row.first)).toBe(1);
      expect(Number(row.mid)).toBe(44);
      expect(Number(row.last)).toBe(100);
    });
  });

  describe('named parameters', () => {
    test('named parameters resolve by name, not position', async () => {
      const table = await client.sql('SELECT $b - $a AS diff', {
        parameters: { a: 2, b: 50 },
      });
      expect(Number(table.toArray()[0].diff)).toBe(48);
    });

    test('a named parameter used twice binds both sites', async () => {
      const table = await client.sql('SELECT $n * $n AS squared', {
        parameters: { n: 7 },
      });
      expect(Number(table.toArray()[0].squared)).toBe(49);
    });

    test('overlapping names resolve to the longest match', async () => {
      const table = await client.sql('SELECT $name AS a, $name_long AS b', {
        parameters: { name: 'short', name_long: 'long' },
      });
      const row = table.toArray()[0];
      expect(String(row.a)).toBe('short');
      expect(String(row.b)).toBe('long');
    });
  });

  describe('values stay data', () => {
    test('SQL syntax inside a string parameter is not executed', async () => {
      const hostile = "'; SELECT 999 AS pwned; --";
      const table = await client.sql('SELECT $1 AS v, 1 AS marker', {
        parameters: [hostile],
      });
      const rows = table.toArray();
      expect(rows).toHaveLength(1);
      expect(String(rows[0].v)).toBe(hostile);
      expect(Number(rows[0].marker)).toBe(1);
    });

    test('quotes and backslashes round-trip intact', async () => {
      const tricky = `it's a "test" with \\ and ''`;
      const table = await client.sql('SELECT $1 AS v', {
        parameters: [tricky],
      });
      expect(String(table.toArray()[0].v)).toBe(tricky);
    });
  });

  describe('HTTP transport', () => {
    const httpClient = new SpiceClient({ httpOnly: true });

    test('positional parameters over the HTTP endpoint', async () => {
      const table = await httpClient.sql('SELECT $1 + $2 AS total', {
        parameters: [20, 22],
      });
      const rows = table.toArray();
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].total)).toBe(42);
    });

    test('named parameters over the HTTP endpoint', async () => {
      const table = await httpClient.sql('SELECT upper($word) AS u', {
        parameters: { word: 'spice' },
      });
      expect(String(table.toArray()[0].u)).toBe('SPICE');
    });
  });
});
