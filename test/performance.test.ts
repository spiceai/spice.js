import { SpiceClient } from '../';

/**
 * Performance Tests
 *
 * These tests verify that the SpiceClient maintains high performance
 * for .sql() and .sqlJson() operations.
 *
 * Requirements:
 * - Local Spice runtime must be running (http://127.0.0.1:8090)
 * - PostgreSQL test data must be loaded
 *
 * To run these tests:
 * 1. Start PostgreSQL and load test data:
 *    psql -h localhost -U postgres -d testdb < test/scripts/setup-data-postgresql.sql
 * 2. Start Spice runtime:
 *    cd test/scripts && spiced
 * 3. Run tests:
 *    npm run test:perf
 *
 * Note: These tests are automatically skipped if the runtime is not available.
 */

describe('Performance Tests', () => {
  const client = new SpiceClient();
  const PERFORMANCE_THRESHOLD_MS = 1000; // Max acceptable time for operations
  const LARGE_RESULT_THRESHOLD_MS = 5000; // Max acceptable time for large result sets
  let runtimeAvailable = false;

  beforeAll(async () => {
    // Check if runtime is available
    try {
      const isHealthy = await client.isSpiceHealthy();
      if (isHealthy) {
        // Verify test table exists by attempting a simple query
        await client.sql(
          'SELECT 1 FROM test_postgresql_table_not_accelerated LIMIT 1',
        );
        runtimeAvailable = true;
      }
    } catch (error) {
      console.warn(
        '\n⚠️  Spice runtime not available or test data not loaded.',
      );
      console.warn(
        '   Performance tests require a running Spice runtime with test data.',
      );
      console.warn('   See test/performance.test.ts for setup instructions.\n');
      runtimeAvailable = false;
    }
  });

  // Helper to skip test if runtime is not available
  function skipIfNoRuntime() {
    if (!runtimeAvailable) {
      return test.skip;
    }
    return test;
  }

  describe('Query Performance', () => {
    skipIfNoRuntime()(
      '.sql() should complete small queries quickly',
      async () => {
        const startTime = performance.now();

        const result = await client.sql(
          'SELECT * FROM test_postgresql_table_not_accelerated LIMIT 10',
        );

        const endTime = performance.now();
        const duration = endTime - startTime;

        expect(result).toBeDefined();
        expect(result.numRows).toBeLessThanOrEqual(10);
        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);

        console.log(
          `  ✓ Small .sql() query completed in ${duration.toFixed(2)}ms`,
        );
      },
    );

    skipIfNoRuntime()(
      '.sql() should handle medium result sets efficiently',
      async () => {
        const startTime = performance.now();

        const result = await client.sql(
          'SELECT * FROM test_postgresql_table_not_accelerated LIMIT 1000',
        );

        const endTime = performance.now();
        const duration = endTime - startTime;

        expect(result).toBeDefined();
        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);

        console.log(
          `  ✓ Medium .sql() query (1000 rows) completed in ${duration.toFixed(2)}ms`,
        );
      },
    );

    skipIfNoRuntime()(
      '.sql() with toArray() should be performant',
      async () => {
        const startTime = performance.now();

        const result = await client.sql(
          'SELECT * FROM test_postgresql_table_not_accelerated LIMIT 100',
        );
        const rows = result.toArray();

        const endTime = performance.now();
        const duration = endTime - startTime;

        expect(rows).toBeDefined();
        expect(Array.isArray(rows)).toBe(true);
        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);

        console.log(
          `  ✓ .sql() with toArray() (100 rows) completed in ${duration.toFixed(2)}ms`,
        );
      },
    );
  });

  describe('sqlJson Performance', () => {
    skipIfNoRuntime()(
      '.sqlJson() should complete small queries quickly',
      async () => {
        const startTime = performance.now();

        const result = await client.sqlJson(
          'SELECT * FROM test_postgresql_table_not_accelerated LIMIT 10',
        );

        const endTime = performance.now();
        const duration = endTime - startTime;

        expect(result).toBeDefined();
        expect(result.data).toBeDefined();
        expect(result.row_count).toBeLessThanOrEqual(10);
        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);

        console.log(
          `  ✓ Small .sqlJson() query completed in ${duration.toFixed(2)}ms`,
        );
      },
    );

    skipIfNoRuntime()(
      '.sqlJson() should handle medium result sets efficiently',
      async () => {
        const startTime = performance.now();

        const result = await client.sqlJson(
          'SELECT * FROM test_postgresql_table_not_accelerated LIMIT 1000',
        );

        const endTime = performance.now();
        const duration = endTime - startTime;

        expect(result).toBeDefined();
        expect(result.data).toBeDefined();
        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);

        console.log(
          `  ✓ Medium .sqlJson() query (1000 rows) completed in ${duration.toFixed(2)}ms`,
        );
      },
    );

    skipIfNoRuntime()(
      '.sqlJson() should have minimal overhead compared to .sql()',
      async () => {
        const query =
          'SELECT * FROM test_postgresql_table_not_accelerated LIMIT 100';

        // Measure .sql() time
        const sqlStartTime = performance.now();
        const sqlResult = await client.sql(query);
        const sqlRows = sqlResult.toArray();
        const sqlEndTime = performance.now();
        const sqlDuration = sqlEndTime - sqlStartTime;

        // Measure .sqlJson() time
        const jsonStartTime = performance.now();
        const jsonResult = await client.sqlJson(query);
        const jsonEndTime = performance.now();
        const jsonDuration = jsonEndTime - jsonStartTime;

        expect(sqlRows.length).toBe(jsonResult.row_count);

        // sqlJson should not be more than 2x slower than sql + toArray
        const overhead = jsonDuration / sqlDuration;
        expect(overhead).toBeLessThan(2.0);

        console.log(`  ✓ .sql() + toArray(): ${sqlDuration.toFixed(2)}ms`);
        console.log(`  ✓ .sqlJson(): ${jsonDuration.toFixed(2)}ms`);
        console.log(`  ✓ Overhead: ${(overhead * 100).toFixed(1)}%`);
      },
    );
  });

  describe('Type Conversion Performance', () => {
    skipIfNoRuntime()('numeric type conversions should be fast', async () => {
      const query =
        'SELECT id, int2_column, int4_column, int8_column, float4_column, float8_column, numeric_column FROM test_postgresql_table_not_accelerated LIMIT 100';

      const startTime = performance.now();
      const result = await client.sqlJson(query);
      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(result.data.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);

      console.log(
        `  ✓ Numeric type conversion (100 rows) completed in ${duration.toFixed(2)}ms`,
      );
    });

    skipIfNoRuntime()('timestamp conversions should be fast', async () => {
      const query =
        'SELECT id, timestamp_column, date_column FROM test_postgresql_table_not_accelerated LIMIT 100';

      const startTime = performance.now();
      const result = await client.sqlJson(query);
      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(result.data.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);

      console.log(
        `  ✓ Timestamp conversion (100 rows) completed in ${duration.toFixed(2)}ms`,
      );
    });

    skipIfNoRuntime()('array type handling should be performant', async () => {
      const query =
        'SELECT id, int2_array_column, int4_array_column, text_array_column FROM test_postgresql_table_not_accelerated LIMIT 100';

      const startTime = performance.now();
      const result = await client.sqlJson(query);
      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(result.data.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);

      console.log(
        `  ✓ Array type handling (100 rows) completed in ${duration.toFixed(2)}ms`,
      );
    });
  });

  describe('Streaming Performance', () => {
    skipIfNoRuntime()(
      '.sql() with callback should handle chunks efficiently',
      async () => {
        const chunks: number[] = [];
        const startTime = performance.now();

        await client.sql(
          'SELECT * FROM test_postgresql_table_not_accelerated LIMIT 1000',
          (table) => {
            chunks.push(table.numRows);
          },
        );

        const endTime = performance.now();
        const duration = endTime - startTime;

        expect(chunks.length).toBeGreaterThan(0);
        expect(duration).toBeLessThan(LARGE_RESULT_THRESHOLD_MS);

        console.log(
          `  ✓ Streaming query (${chunks.length} chunks) completed in ${duration.toFixed(2)}ms`,
        );
      },
    );

    skipIfNoRuntime()(
      'streaming should not have excessive per-chunk overhead',
      async () => {
        const chunkTimes: number[] = [];
        let lastTime = performance.now();

        await client.sql(
          'SELECT * FROM test_postgresql_table_not_accelerated LIMIT 1000',
          (_table) => {
            const currentTime = performance.now();
            const chunkDuration = currentTime - lastTime;
            chunkTimes.push(chunkDuration);
            lastTime = currentTime;
          },
        );

        if (chunkTimes.length > 1) {
          const avgChunkTime =
            chunkTimes.reduce((a, b) => a + b, 0) / chunkTimes.length;
          const maxChunkTime = Math.max(...chunkTimes);

          // Average chunk processing should be fast
          expect(avgChunkTime).toBeLessThan(100);

          console.log(
            `  ✓ Average chunk processing: ${avgChunkTime.toFixed(2)}ms`,
          );
          console.log(`  ✓ Max chunk processing: ${maxChunkTime.toFixed(2)}ms`);
        }
      },
    );
  });

  describe('Concurrent Query Performance', () => {
    skipIfNoRuntime()(
      'should handle multiple concurrent .sql() queries efficiently',
      async () => {
        const queries = Array(5).fill(
          'SELECT * FROM test_postgresql_table_not_accelerated LIMIT 100',
        );

        const startTime = performance.now();
        const results = await Promise.all(
          queries.map((query) => client.sql(query)),
        );
        const endTime = performance.now();
        const duration = endTime - startTime;

        expect(results).toHaveLength(5);
        results.forEach((result) => {
          expect(result).toBeDefined();
          expect(result.numRows).toBeGreaterThan(0);
        });

        // Should complete in less than 5x single query time
        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS * 5);

        console.log(
          `  ✓ 5 concurrent .sql() queries completed in ${duration.toFixed(2)}ms`,
        );
      },
    );

    skipIfNoRuntime()(
      'should handle multiple concurrent .sqlJson() queries efficiently',
      async () => {
        const queries = Array(5).fill(
          'SELECT * FROM test_postgresql_table_not_accelerated LIMIT 100',
        );

        const startTime = performance.now();
        const results = await Promise.all(
          queries.map((query) => client.sqlJson(query)),
        );
        const endTime = performance.now();
        const duration = endTime - startTime;

        expect(results).toHaveLength(5);
        results.forEach((result) => {
          expect(result).toBeDefined();
          expect(result.row_count).toBeGreaterThan(0);
        });

        // Should complete in less than 5x single query time
        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS * 5);

        console.log(
          `  ✓ 5 concurrent .sqlJson() queries completed in ${duration.toFixed(2)}ms`,
        );
      },
    );
  });

  describe('Memory Efficiency', () => {
    skipIfNoRuntime()(
      '.sql() should not cause excessive memory allocation for large results',
      async () => {
        if (global.gc) {
          global.gc(); // Force GC if --expose-gc flag is set
        }

        const startMemory = process.memoryUsage().heapUsed;

        const result = await client.sql(
          'SELECT * FROM test_postgresql_table_not_accelerated LIMIT 10000',
        );
        const rows = result.toArray();

        const endMemory = process.memoryUsage().heapUsed;
        const memoryIncreaseMB = (endMemory - startMemory) / 1024 / 1024;

        expect(rows.length).toBeGreaterThan(0);

        // Memory increase should be reasonable (less than 100MB for 10k rows)
        expect(memoryIncreaseMB).toBeLessThan(100);

        console.log(
          `  ✓ Memory increase for 10k rows: ${memoryIncreaseMB.toFixed(2)}MB`,
        );
      },
    );

    skipIfNoRuntime()(
      '.sqlJson() should not cause excessive memory allocation',
      async () => {
        if (global.gc) {
          global.gc(); // Force GC if --expose-gc flag is set
        }

        const startMemory = process.memoryUsage().heapUsed;

        const result = await client.sqlJson(
          'SELECT * FROM test_postgresql_table_not_accelerated LIMIT 10000',
        );

        const endMemory = process.memoryUsage().heapUsed;
        const memoryIncreaseMB = (endMemory - startMemory) / 1024 / 1024;

        expect(result.data.length).toBeGreaterThan(0);

        // Memory increase should be reasonable (less than 100MB for 10k rows)
        expect(memoryIncreaseMB).toBeLessThan(100);

        console.log(
          `  ✓ Memory increase for 10k rows: ${memoryIncreaseMB.toFixed(2)}MB`,
        );
      },
    );
  });

  describe('Cold Start Performance', () => {
    skipIfNoRuntime()(
      'first query should not have excessive initialization overhead',
      async () => {
        // Create a new client to test cold start
        const newClient = new SpiceClient();

        const startTime = performance.now();
        const result = await newClient.sql(
          'SELECT * FROM test_postgresql_table_not_accelerated LIMIT 10',
        );
        const endTime = performance.now();
        const duration = endTime - startTime;

        expect(result).toBeDefined();
        // Cold start should still be reasonably fast
        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS * 2);

        console.log(
          `  ✓ Cold start query completed in ${duration.toFixed(2)}ms`,
        );
      },
    );
  });
});
