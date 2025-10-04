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
    expect(rows[0].int8_column).toBe(3n); // int8 returns BigInt
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

    test('.sql() and .sqlJson() should return consistent data', async () => {
      const query =
        'SELECT id, int2_column, int4_column, float4_column, text_column, bool_column FROM test_postgresql_table_not_accelerated ORDER BY id LIMIT 3';

      // Get data from both methods
      const table = await flightOnlyClient.query(query);
      const jsonResult = await flightOnlyClient.sqlJson(query);

      // Verify Arrow Table
      expect(table).toBeDefined();
      expect(table.toArray).toBeDefined();
      expect(table.schema).toBeDefined();

      // Verify JSON result
      expect(jsonResult).toHaveProperty('data');
      expect(jsonResult).toHaveProperty('schema');

      // Convert Arrow to array for comparison
      const arrowRows = table.toArray();
      const jsonRows = jsonResult.data;

      // Both should have same number of rows
      expect(arrowRows).toHaveLength(3);
      expect(jsonRows).toHaveLength(3);
      expect(jsonResult.row_count).toBe(3);

      // Verify first row values are identical
      expect(arrowRows[0].id).toBe(jsonRows[0].id);
      expect(arrowRows[0].id).toBe(1);

      expect(arrowRows[0].int2_column).toBe(jsonRows[0].int2_column);
      expect(arrowRows[0].int2_column).toBe(1);

      expect(arrowRows[0].int4_column).toBe(jsonRows[0].int4_column);
      expect(arrowRows[0].int4_column).toBe(2);

      expect(arrowRows[0].float4_column).toBeCloseTo(jsonRows[0].float4_column);
      expect(arrowRows[0].float4_column).toBeCloseTo(4.0);

      expect(arrowRows[0].text_column).toBe(jsonRows[0].text_column);
      expect(arrowRows[0].text_column).toBe('test');

      expect(arrowRows[0].bool_column).toBe(jsonRows[0].bool_column);
      expect(arrowRows[0].bool_column).toBe(true);

      // Verify third row NULLs are consistent
      expect(arrowRows[2].id).toBe(jsonRows[2].id);
      expect(arrowRows[2].id).toBe(3);

      expect(arrowRows[2].int2_column).toBeNull();
      expect(jsonRows[2].int2_column).toBeNull();

      expect(arrowRows[2].text_column).toBeNull();
      expect(jsonRows[2].text_column).toBeNull();
    });

    test('.sql() and .sqlJson() should return identical numeric types', async () => {
      const query =
        'SELECT id, int2_column, int4_column, int8_column, float4_column, float8_column, numeric_column FROM test_postgresql_table_not_accelerated ORDER BY id LIMIT 3';

      // Get data from both methods
      const table = await flightOnlyClient.query(query);
      const jsonResult = await flightOnlyClient.sqlJson(query);

      const arrowRows = table.toArray();
      const jsonRows = jsonResult.data;

      // Verify row counts match
      expect(arrowRows).toHaveLength(3);
      expect(jsonRows).toHaveLength(3);

      // Verify first row: all numeric types are identical and preserved as numbers
      expect(arrowRows[0].id).toBe(jsonRows[0].id);
      expect(arrowRows[0].id).toBe(1);
      expect(typeof jsonRows[0].id).toBe('number');

      expect(arrowRows[0].int2_column).toBe(jsonRows[0].int2_column);
      expect(arrowRows[0].int2_column).toBe(1);
      expect(typeof jsonRows[0].int2_column).toBe('number');

      expect(arrowRows[0].int4_column).toBe(jsonRows[0].int4_column);
      expect(arrowRows[0].int4_column).toBe(2);
      expect(typeof jsonRows[0].int4_column).toBe('number');

      // int8_column: Arrow returns BigInt, JSON returns number (if within safe range)
      expect(Number(arrowRows[0].int8_column)).toBe(jsonRows[0].int8_column);
      expect(arrowRows[0].int8_column).toBe(3n); // Arrow returns BigInt
      expect(typeof jsonRows[0].int8_column).toBe('number');

      expect(arrowRows[0].float4_column).toBeCloseTo(jsonRows[0].float4_column);
      expect(arrowRows[0].float4_column).toBeCloseTo(4.0);
      expect(typeof jsonRows[0].float4_column).toBe('number');

      expect(arrowRows[0].float8_column).toBeCloseTo(jsonRows[0].float8_column);
      expect(arrowRows[0].float8_column).toBeCloseTo(5.0);
      expect(typeof jsonRows[0].float8_column).toBe('number');

      expect(arrowRows[0].numeric_column).toBe(jsonRows[0].numeric_column);
      expect(arrowRows[0].numeric_column).toBe(6);
      expect(typeof jsonRows[0].numeric_column).toBe('number');

      // Verify third row: NULL values are consistent
      expect(arrowRows[2].id).toBe(jsonRows[2].id);
      expect(arrowRows[2].id).toBe(3);

      expect(arrowRows[2].int2_column).toBeNull();
      expect(jsonRows[2].int2_column).toBeNull();

      expect(arrowRows[2].int4_column).toBeNull();
      expect(jsonRows[2].int4_column).toBeNull();

      expect(arrowRows[2].float4_column).toBeNull();
      expect(jsonRows[2].float4_column).toBeNull();
    });

    test('.sql() and .sqlJson() should handle BigInt consistently', async () => {
      const query =
        'SELECT id, int8_column FROM test_postgresql_table_not_accelerated WHERE id = 1';

      // Get data from both methods
      const table = await flightOnlyClient.query(query);
      const jsonResult = await flightOnlyClient.sqlJson(query);

      const arrowRows = table.toArray();
      const jsonRows = jsonResult.data;

      expect(arrowRows).toHaveLength(1);
      expect(jsonRows).toHaveLength(1);

      // The test data has int8_column = 3, which is within safe integer range
      // Arrow returns BigInt, JSON returns number (if within safe range)
      expect(arrowRows[0].id).toBe(jsonRows[0].id);
      expect(arrowRows[0].id).toBe(1);

      expect(Number(arrowRows[0].int8_column)).toBe(jsonRows[0].int8_column);
      expect(arrowRows[0].int8_column).toBe(3n); // Arrow returns BigInt
      expect(typeof jsonRows[0].int8_column).toBe('number');
      expect(Number.isSafeInteger(jsonRows[0].int8_column)).toBe(true);

      // Test with a computed large BigInt value
      const largeQuery =
        'SELECT 9007199254740992::BIGINT as large_int FROM test_postgresql_table_not_accelerated LIMIT 1';
      const largeTable = await flightOnlyClient.query(largeQuery);
      const largeJsonResult = await flightOnlyClient.sqlJson(largeQuery);

      const largeArrowRows = largeTable.toArray();
      const largeJsonRows = largeJsonResult.data;

      // Values beyond Number.MAX_SAFE_INTEGER should be converted to strings in sqlJson
      expect(typeof largeJsonRows[0].large_int).toBe('string');
      expect(largeJsonRows[0].large_int).toBe('9007199254740992');

      // Arrow returns as string as well since it exceeds safe integer range
      expect(largeArrowRows[0].large_int.toString()).toBe(
        largeJsonRows[0].large_int,
      );
    });

    test('.sql() and .sqlJson() should convert timestamps to ISO 8601 strings consistently', async () => {
      const query =
        'SELECT id, timestamp_column, date_column FROM test_postgresql_table_not_accelerated WHERE id = 1';

      // Get data from both methods
      const table = await flightOnlyClient.query(query);
      const jsonResult = await flightOnlyClient.sqlJson(query);

      const arrowRows = table.toArray();
      const jsonRows = jsonResult.data;

      expect(arrowRows).toHaveLength(1);
      expect(jsonRows).toHaveLength(1);

      expect(arrowRows[0].id).toBe(jsonRows[0].id);
      expect(arrowRows[0].id).toBe(1);

      // Both Arrow and JSON should now return ISO 8601 strings consistently
      expect(typeof arrowRows[0].timestamp_column).toBe('string');
      expect(typeof jsonRows[0].timestamp_column).toBe('string');

      // Timestamps should match exactly and follow ISO 8601 format
      expect(arrowRows[0].timestamp_column).toBe(jsonRows[0].timestamp_column);
      expect(jsonRows[0].timestamp_column).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );

      // Date columns should also match
      expect(typeof jsonRows[0].date_column).toBe('string');
      const arrowDate =
        arrowRows[0].date_column instanceof Date
          ? arrowRows[0].date_column.toISOString()
          : arrowRows[0].date_column;
      expect(arrowDate).toBe(jsonRows[0].date_column);
      expect(jsonRows[0].date_column).toMatch(/^\d{4}-\d{2}-\d{2}/);

      // Verify the schema shows the correct types
      const timestampField = jsonResult.schema.fields.find(
        (f: any) => f.name === 'timestamp_column',
      );
      expect(timestampField).toBeDefined();
      expect(timestampField!.data_type).toHaveProperty('Timestamp');

      const dateField = jsonResult.schema.fields.find(
        (f: any) => f.name === 'date_column',
      );
      expect(dateField).toBeDefined();
      expect(dateField!.data_type).toMatch(/^Date32/);
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

      // Query should fail with gRPC error (since flightOnly means no HTTP fallback)
      await expect(invalidClient.query('SELECT 1')).rejects.toThrow(
        /UNAVAILABLE|flightOnly mode is enabled/,
      );
    });

    test('.sql() and .sqlJson() should handle complex queries identically', async () => {
      const query = `SELECT 
        id, 
        int4_column,
        float4_column * 2 as doubled_value,
        CASE WHEN int4_column > 1 THEN 'high' ELSE 'low' END as category
      FROM test_postgresql_table_not_accelerated 
      WHERE id <= 2
      ORDER BY id`;

      // Get data from both methods
      const table = await flightOnlyClient.query(query);
      const jsonResult = await flightOnlyClient.sqlJson(query);

      const arrowRows = table.toArray();
      const jsonRows = jsonResult.data;

      // Both should have same number of rows
      expect(arrowRows).toHaveLength(2);
      expect(jsonRows).toHaveLength(2);

      // Verify first row: computed columns and values match
      expect(arrowRows[0].id).toBe(jsonRows[0].id);
      expect(arrowRows[0].id).toBe(1);

      expect(arrowRows[0].int4_column).toBe(jsonRows[0].int4_column);
      expect(arrowRows[0].int4_column).toBe(2);

      expect(arrowRows[0].doubled_value).toBeCloseTo(jsonRows[0].doubled_value);
      expect(jsonRows[0].doubled_value).toBeCloseTo(8.0); // 4.0 * 2

      expect(arrowRows[0].category).toBe(jsonRows[0].category);
      expect(jsonRows[0].category).toBe('high'); // int4_column = 2 > 1

      // Verify second row
      expect(arrowRows[1].id).toBe(jsonRows[1].id);
      expect(arrowRows[1].id).toBe(2);

      expect(arrowRows[1].int4_column).toBe(jsonRows[1].int4_column);
      expect(jsonRows[1].int4_column).toBe(2);

      expect(arrowRows[1].category).toBe(jsonRows[1].category);
      expect(jsonRows[1].category).toBe('high');

      // Verify schema includes computed columns
      expect(
        jsonResult.schema.fields.some((f: any) => f.name === 'category'),
      ).toBe(true);
      expect(
        jsonResult.schema.fields.some((f: any) => f.name === 'doubled_value'),
      ).toBe(true);
    });

    test('.sql() and .sqlJson() should handle NULL values identically', async () => {
      const query =
        'SELECT id, int4_column, text_column, bool_column FROM test_postgresql_table_not_accelerated ORDER BY id';

      // Get data from both methods
      const table = await flightOnlyClient.query(query);
      const jsonResult = await flightOnlyClient.sqlJson(query);

      const arrowRows = table.toArray();
      const jsonRows = jsonResult.data;

      // Both should have same number of rows
      expect(arrowRows).toHaveLength(3);
      expect(jsonRows).toHaveLength(3);

      // First row: actual values should match
      expect(arrowRows[0].id).toBe(jsonRows[0].id);
      expect(arrowRows[0].id).toBe(1);

      expect(arrowRows[0].int4_column).toBe(jsonRows[0].int4_column);
      expect(jsonRows[0].int4_column).toBe(2);

      expect(arrowRows[0].text_column).toBe(jsonRows[0].text_column);
      expect(jsonRows[0].text_column).toBe('test');

      expect(arrowRows[0].bool_column).toBe(jsonRows[0].bool_column);
      expect(jsonRows[0].bool_column).toBe(true);

      // Second row should also match
      expect(arrowRows[1].id).toBe(jsonRows[1].id);
      expect(arrowRows[1].id).toBe(2);

      expect(arrowRows[1].int4_column).toBe(jsonRows[1].int4_column);
      expect(arrowRows[1].text_column).toBe(jsonRows[1].text_column);
      expect(arrowRows[1].bool_column).toBe(jsonRows[1].bool_column);

      // Third row: NULLs should be consistent (except for id)
      expect(arrowRows[2].id).toBe(jsonRows[2].id);
      expect(arrowRows[2].id).toBe(3);

      expect(arrowRows[2].int4_column).toBeNull();
      expect(jsonRows[2].int4_column).toBeNull();

      expect(arrowRows[2].text_column).toBeNull();
      expect(jsonRows[2].text_column).toBeNull();

      expect(arrowRows[2].bool_column).toBeNull();
      expect(jsonRows[2].bool_column).toBeNull();
    });
  });
});
