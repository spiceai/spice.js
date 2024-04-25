import { SpiceClient } from '../';

describe('local', () => {
  const client = new SpiceClient({});

  it('connection and query to local spice runtime works', async () => {
    const tableResult = await client.query(
      'select * from test_postgresql_table limit 3'
    );

    expect(tableResult.toArray()).toHaveLength(3);
  });
});
