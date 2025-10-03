import { SpiceClient } from '../';

describe('local', () => {
  const client = new SpiceClient();

  describe('Health Checks', () => {
    test('isSpiceHealthy should return true for running runtime', async () => {
      const isHealthy = await client.isSpiceHealthy();
      expect(isHealthy).toBe(true);
    });

    test('isSpiceReady should return true for ready runtime', async () => {
      const isReady = await client.isSpiceReady();
      expect(isReady).toBe(true);
    });
  });

  it('connection and query to local spice runtime works', async () => {
    const tableResult = await client.query(
      'SELECT * FROM test_postgresql_table_not_accelerated LIMIT 3'
    );

    expect(tableResult.toArray()).toHaveLength(3);
  });

  describe('Refresh dataset', () => {
    test('refresh dataset', async () => {
      const result = await client.refreshAcceleration(
        'test_postgresql_table_accelerated'
      );

      expect(result).toHaveProperty('message');
      expect(typeof result.message).toBe('string');
    });

    test('refresh dataset with options', async () => {
      const result = await client.refreshAcceleration(
        'test_postgresql_table_accelerated',
        {
          refresh_mode: 'full',
          refresh_jitter_max: '5s',
        }
      );

      expect(result).toHaveProperty('message');
      expect(typeof result.message).toBe('string');
    });

    test('refresh dataset with custom SQL', async () => {
      const result = await client.refreshAcceleration(
        'test_postgresql_table_accelerated',
        {
          refresh_sql:
            'SELECT * FROM test_postgresql_table_accelerated WHERE id > 0',
          refresh_mode: 'full',
        }
      );

      expect(result).toHaveProperty('message');
      expect(typeof result.message).toBe('string');
    });

    test('refresh nonexistent dataset throws error', async () => {
      await expect(
        client.refreshAcceleration('nonexistent_dataset')
      ).rejects.toThrow();
    });
  });
});
