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
      'SELECT * FROM test_postgresql_table_not_accelerated LIMIT 3',
    );

    const rows = tableResult.toArray();
    expect(rows).toHaveLength(3);

    // Verify actual data values from first row (not NULL row)
    expect(rows[0].id).toBe(1);
    expect(rows[0].int2_column).toBe(1);
    expect(rows[0].int4_column).toBe(2);
    expect(rows[0].int8_column).toBe(3);
    expect(rows[0].float4_column).toBeCloseTo(4.0);
    expect(rows[0].float8_column).toBeCloseTo(5.0);
    expect(rows[0].text_column).toBe('test');
    expect(rows[0].bool_column).toBe(true);
    expect(rows[0].numeric_column).toBe(6);
  });

  describe('Refresh dataset', () => {
    test('refresh dataset', async () => {
      const result = await client.refreshAcceleration(
        'test_postgresql_table_accelerated',
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
        },
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
        },
      );

      expect(result).toHaveProperty('message');
      expect(typeof result.message).toBe('string');
    });

    test('refresh nonexistent dataset throws error', async () => {
      await expect(
        client.refreshAcceleration('nonexistent_dataset'),
      ).rejects.toThrow();
    });
  });

  describe('gRPC Arrow Flight Only Mode', () => {
    const flightOnlyClient = new SpiceClient({ flightOnly: true });

    test('should initialize with flightOnly mode', async () => {
      const isHealthy = await flightOnlyClient.isSpiceHealthy();
      expect(isHealthy).toBe(true);
    });

    test('.sql() should work in flightOnly mode and return Arrow Table', async () => {
      const table = await flightOnlyClient.query(
        'SELECT id, int2_column, int4_column, float4_column, text_column, bool_column FROM test_postgresql_table_not_accelerated ORDER BY id LIMIT 3',
      );

      // Verify we got an Arrow Table
      expect(table).toBeDefined();
      expect(table.toArray).toBeDefined();
      expect(table.schema).toBeDefined();

      // Verify data with actual values
      const rows = table.toArray();
      expect(rows).toHaveLength(3);

      // First row values
      expect(rows[0].id).toBe(1);
      expect(rows[0].int2_column).toBe(1);
      expect(rows[0].int4_column).toBe(2);
      expect(rows[0].float4_column).toBeCloseTo(4.0);
      expect(rows[0].text_column).toBe('test');
      expect(rows[0].bool_column).toBe(true);

      // Third row should have NULLs
      expect(rows[2].id).toBe(3);
      expect(rows[2].int2_column).toBeNull();
      expect(rows[2].text_column).toBeNull();
    });

    test('.sqlJson() should work in flightOnly mode and preserve numeric types', async () => {
      const result = await flightOnlyClient.sqlJson(
        'SELECT id, int2_column, int4_column, int8_column, float4_column, float8_column, numeric_column FROM test_postgresql_table_not_accelerated ORDER BY id LIMIT 3',
      );

      // Verify response structure
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('schema');
      expect(result.data).toHaveLength(3);

      // Verify numeric types are preserved (not converted to strings) and values are correct
      const firstRow = result.data[0];
      expect(firstRow.id).toBe(1);
      expect(typeof firstRow.id).toBe('number');

      expect(firstRow.int2_column).toBe(1);
      expect(typeof firstRow.int2_column).toBe('number');

      expect(firstRow.int4_column).toBe(2);
      expect(typeof firstRow.int4_column).toBe('number');

      expect(firstRow.int8_column).toBe(3);
      expect(typeof firstRow.int8_column).toBe('number');

      expect(firstRow.float4_column).toBeCloseTo(4.0);
      expect(typeof firstRow.float4_column).toBe('number');

      expect(firstRow.float8_column).toBeCloseTo(5.0);
      expect(typeof firstRow.float8_column).toBe('number');

      expect(firstRow.numeric_column).toBe(6);
      expect(typeof firstRow.numeric_column).toBe('number');

      // Verify NULL row
      const thirdRow = result.data[2];
      expect(thirdRow.id).toBe(3);
      expect(thirdRow.int2_column).toBeNull();
      expect(thirdRow.int4_column).toBeNull();
      expect(thirdRow.float4_column).toBeNull();
    });

    test('.sqlJson() should preserve BigInt values correctly', async () => {
      // Test with int8 (BIGINT) column which could have large numbers
      const result = await flightOnlyClient.sqlJson(
        'SELECT id, int8_column FROM test_postgresql_table_not_accelerated WHERE id = 1',
      );

      expect(result.data).toHaveLength(1);
      const row = result.data[0];

      // The test data has int8_column = 3, which is within safe integer range
      expect(row.id).toBe(1);
      expect(row.int8_column).toBe(3);
      expect(typeof row.int8_column).toBe('number');
      expect(Number.isSafeInteger(row.int8_column)).toBe(true);

      // Test with a computed large BigInt value
      const largeResult = await flightOnlyClient.sqlJson(
        'SELECT 9007199254740992::BIGINT as large_int FROM test_postgresql_table_not_accelerated LIMIT 1',
      );

      const largeRow = largeResult.data[0];
      // Values beyond Number.MAX_SAFE_INTEGER should be converted to strings
      expect(typeof largeRow.large_int).toBe('string');
      expect(largeRow.large_int).toBe('9007199254740992');
    });

    test('.sqlJson() should convert timestamps to ISO 8601 strings', async () => {
      // Test with timestamp and date columns
      const result = await flightOnlyClient.sqlJson(
        'SELECT id, timestamp_column, date_column FROM test_postgresql_table_not_accelerated WHERE id = 1',
      );

      expect(result.data).toHaveLength(1);
      const row = result.data[0];

      expect(row.id).toBe(1);

      // Timestamp should be converted to ISO 8601 string format
      expect(typeof row.timestamp_column).toBe('string');
      expect(row.timestamp_column).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );

      // Date should also be converted to ISO 8601 string format
      expect(typeof row.date_column).toBe('string');
      expect(row.date_column).toMatch(/^\d{4}-\d{2}-\d{2}/);

      // Verify the schema shows the correct types
      const timestampField = result.schema.fields.find(
        (f: any) => f.name === 'timestamp_column',
      );
      expect(timestampField).toBeDefined();
      expect(timestampField!.data_type).toHaveProperty('Timestamp');

      const dateField = result.schema.fields.find(
        (f: any) => f.name === 'date_column',
      );
      expect(dateField).toBeDefined();
      expect(dateField!.data_type).toBe('Date32');
    });

    test('should include proper schema information in sqlJson response', async () => {
      const result = await flightOnlyClient.sqlJson(
        'SELECT id, text_column, int4_column FROM test_postgresql_table_not_accelerated LIMIT 1',
      );

      // Verify schema structure
      expect(result.schema).toBeDefined();
      expect(result.schema.fields).toBeDefined();
      expect(Array.isArray(result.schema.fields)).toBe(true);
      expect(result.schema.fields.length).toBe(3);

      // Verify specific field structures and types
      const idField = result.schema.fields.find((f: any) => f.name === 'id');
      expect(idField).toBeDefined();
      expect(idField!.name).toBe('id');
      expect(idField!.data_type).toBe('Int32');
      expect(idField!.nullable).toBe(false);

      const textField = result.schema.fields.find(
        (f: any) => f.name === 'text_column',
      );
      expect(textField).toBeDefined();
      expect(textField!.name).toBe('text_column');
      expect(textField!.data_type).toBe('Utf8');
      expect(textField!.nullable).toBe(true);

      const intField = result.schema.fields.find(
        (f: any) => f.name === 'int4_column',
      );
      expect(intField).toBeDefined();
      expect(intField!.name).toBe('int4_column');
      expect(intField!.data_type).toBe('Int32');
      expect(intField!.nullable).toBe(true);
    });

    test('should handle streaming results correctly in flightOnly mode', async () => {
      const batches: any[] = [];
      let totalRows = 0;

      await flightOnlyClient.sql(
        'SELECT id, int4_column, text_column FROM test_postgresql_table_not_accelerated ORDER BY id',
        (table) => {
          batches.push(table);
          totalRows += table.numRows;
        },
      );

      // Verify we received batches
      expect(batches.length).toBeGreaterThan(0);
      expect(totalRows).toBe(3); // We have 3 rows in test data

      // Verify each batch is an Arrow Table with actual data
      batches.forEach((batch) => {
        expect(batch.toArray).toBeDefined();
        expect(batch.schema).toBeDefined();
        expect(batch.numRows).toBeGreaterThan(0);

        const rows = batch.toArray();
        rows.forEach((row: any) => {
          expect(row).toHaveProperty('id');
          expect(row).toHaveProperty('int4_column');
          expect(row).toHaveProperty('text_column');
        });
      });

      // Verify we can access data from all batches
      const allRows = batches.flatMap((batch) => batch.toArray());
      expect(allRows[0].id).toBe(1);
      expect(allRows[0].int4_column).toBe(2);
      expect(allRows[0].text_column).toBe('test');
    });

    test('should throw error if flightOnly enabled but gRPC unavailable (simulated)', async () => {
      // This test verifies the error path, though in this environment gRPC should work
      // We're testing the logic is in place

      // Create a client with an invalid endpoint to force gRPC failure
      const invalidClient = new SpiceClient({
        flightOnly: true,
        flightUrl: 'grpc://invalid-host:50051',
      });

      // Query should fail with specific flightOnly error
      await expect(invalidClient.query('SELECT 1')).rejects.toThrow(
        /flightOnly mode is enabled/,
      );
    });

    test('flightOnly mode should work with complex queries', async () => {
      const result = await flightOnlyClient.sqlJson(
        `SELECT 
          id, 
          int4_column,
          float4_column * 2 as doubled_value,
          CASE WHEN int4_column > 1 THEN 'high' ELSE 'low' END as category
        FROM test_postgresql_table_not_accelerated 
        WHERE id <= 2
        ORDER BY id`,
      );

      expect(result.data).toHaveLength(2);

      // Verify computed columns and values
      expect(result.data[0].id).toBe(1);
      expect(result.data[0].int4_column).toBe(2);
      expect(result.data[0].doubled_value).toBeCloseTo(8.0); // 4.0 * 2
      expect(result.data[0].category).toBe('high'); // int4_column = 2 > 1

      expect(result.data[1].id).toBe(2);
      expect(result.data[1].int4_column).toBe(2);
      expect(result.data[1].category).toBe('high');

      // Verify schema includes computed columns
      expect(result.schema.fields.some((f: any) => f.name === 'category')).toBe(
        true,
      );
      expect(
        result.schema.fields.some((f: any) => f.name === 'doubled_value'),
      ).toBe(true);
    });

    test('flightOnly mode should handle NULL values correctly', async () => {
      const result = await flightOnlyClient.sqlJson(
        'SELECT id, int4_column, text_column, bool_column FROM test_postgresql_table_not_accelerated ORDER BY id',
      );

      expect(result.data).toHaveLength(3);

      // First two rows have actual values
      expect(result.data[0].id).toBe(1);
      expect(result.data[0].int4_column).toBe(2);
      expect(result.data[0].text_column).toBe('test');
      expect(result.data[0].bool_column).toBe(true);

      expect(result.data[1].id).toBe(2);
      expect(result.data[1].int4_column).toBe(2);
      expect(result.data[1].text_column).toBe('test');
      expect(result.data[1].bool_column).toBe(true);

      // Third row has NULLs (except for id)
      expect(result.data[2].id).toBe(3);
      expect(result.data[2].int4_column).toBeNull();
      expect(result.data[2].text_column).toBeNull();
      expect(result.data[2].bool_column).toBeNull();
    });
  });
});
