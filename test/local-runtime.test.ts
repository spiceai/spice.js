import { SpiceClient } from '../';

describe('local', () => {
  const client = new SpiceClient();

  it('connection and query to local spice runtime works', async () => {
    const tableResult = await client.query(
      'SELECT * FROM test_postgresql_table LIMIT 3'
    );

    expect(tableResult.toArray()).toHaveLength(3);
  });

  it('connection and refresh to local spice runtime works', async () => {
    await client.refreshDataset('test_postgresql_table_accelerated');

    await new Promise((resolve) => setTimeout(resolve, 5000));

    let tableResult = await client.query(
      'SELECT * FROM test_postgresql_table LIMIT 3'
    );

    expect(tableResult.toArray()).toHaveLength(3);

    await client.refreshDataset('test_postgresql_table_accelerated', { refresh_sql: 'SELECT * FROM test_postgresql_table LIMIT 2' });

    await new Promise((resolve) => setTimeout(resolve, 5000));

    tableResult = await client.query(
      'SELECT * FROM test_postgresql_table LIMIT 3'
    );

    expect(tableResult.toArray()).toHaveLength(2);
  }, 15000);
});
