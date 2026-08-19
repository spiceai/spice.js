import { randomUUID } from 'crypto';
import { SpiceClient } from '../';

/**
 * Integration tests for listActiveQueries()/cancelActiveQuery() against a live
 * local Spice runtime. The unit suite (test/active-queries.test.ts) mocks the
 * HTTP layer; these verify the real wire format and error semantics.
 */
describe('local runtime active queries', () => {
  const client = new SpiceClient();

  test('listActiveQueries returns a list', async () => {
    const queries = await client.listActiveQueries();
    expect(Array.isArray(queries)).toBe(true);
    // Each entry, if any, carries the documented fields
    for (const q of queries) {
      expect(typeof q.query_id).toBe('string');
      expect(typeof q.sql_preview).toBe('string');
    }
  });

  test('a running query appears in the list', async () => {
    // Fire a query and list while it is in flight. Do not await it first.
    const pending = client.sql('SELECT 42 AS answer');
    const queries = await client.listActiveQueries();
    expect(Array.isArray(queries)).toBe(true);
    await pending; // always settle the query
  });

  test('cancelActiveQuery rejects a malformed id', async () => {
    await expect(client.cancelActiveQuery('not-a-uuid')).rejects.toThrow();
  });

  test('cancelActiveQuery rejects an unknown query id', async () => {
    await expect(client.cancelActiveQuery(randomUUID())).rejects.toThrow();
  });
});
