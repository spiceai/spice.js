import { SpiceClient, Param } from '../';
import 'dotenv/config';

/**
 * Comprehensive integration tests for parameterized queries against the TPCH dataset
 *
 * TPCH is a decision support benchmark with realistic data including:
 * - tpch.customer: Customer data (c_custkey, c_name, c_address, c_nationkey, c_phone, c_acctbal, c_mktsegment, c_comment)
 * - tpch.orders: Order data (o_orderkey, o_custkey, o_orderstatus, o_totalprice, o_orderdate, o_orderpriority, o_clerk, o_shippriority, o_comment)
 * - tpch.lineitem: Line items (l_orderkey, l_partkey, l_suppkey, l_linenumber, l_quantity, l_extendedprice, l_discount, l_tax, ...)
 * - tpch.nation: Nations (n_nationkey, n_name, n_regionkey, n_comment)
 * - tpch.region: Regions (r_regionkey, r_name, r_comment)
 * - tpch.part: Parts (p_partkey, p_name, p_mfgr, p_brand, p_type, p_size, p_container, p_retailprice, p_comment)
 * - tpch.supplier: Suppliers (s_suppkey, s_name, s_address, s_nationkey, s_phone, s_acctbal, s_comment)
 * - tpch.partsupp: Part-Supplier relationship (ps_partkey, ps_suppkey, ps_availqty, ps_supplycost, ps_comment)
 *
 * These tests validate parameterized queries work correctly with real-world data types and relationships.
 */
describe('TPCH Integration Tests', () => {
  // Use dedicated TPCH API key or fall back to general key
  // SCP_SPICEAI_TPCH_API_KEY is used in CI
  const api_key =
    process.env.SCP_SPICEAI_TPCH_API_KEY ||
    process.env.TPCH_API_KEY ||
    process.env.SPICEAI_API_KEY;

  if (!api_key) {
    test.skip('Skipping TPCH integration tests - SPICEAI_API_KEY or TPCH_API_KEY not set', () => {});
    return;
  }

  const client = new SpiceClient({
    apiKey: api_key,
  });

  beforeAll(async () => {
    // Verify connection before running tests
    try {
      const result = await client.sql('SELECT 1 AS test');
      const rows = result.toArray();
      expect(rows).toHaveLength(1);
    } catch (error) {
      console.error('Failed to connect to TPCH dataset:', error);
      throw error;
    }
  });

  describe('Customer Table Queries', () => {
    describe('Positional Parameters', () => {
      test('should filter customer by key', async () => {
        const result = await client.sql(
          'SELECT c_custkey, c_name, c_nationkey FROM tpch.customer WHERE c_custkey = $1 LIMIT 1',
          { parameters: [1] },
        );
        const rows = result.toArray();
        expect(rows.length).toBeLessThanOrEqual(1);
        if (rows.length > 0) {
          expect(Number(rows[0].c_custkey)).toBe(1);
        }
      });

      test('should filter customer by market segment', async () => {
        const result = await client.sql(
          'SELECT c_custkey, c_name, c_mktsegment FROM tpch.customer WHERE c_mktsegment = $1 LIMIT 5',
          { parameters: ['BUILDING'] },
        );
        const rows = result.toArray();
        expect(rows.length).toBeLessThanOrEqual(5);
        rows.forEach((row) => {
          expect(row.c_mktsegment).toBe('BUILDING');
        });
      });

      test('should filter customers by account balance range', async () => {
        const result = await client.sql(
          'SELECT c_custkey, c_name, c_acctbal FROM tpch.customer WHERE c_acctbal >= $1 AND c_acctbal <= $2 LIMIT 10',
          { parameters: [1000.0, 2000.0] },
        );
        const rows = result.toArray();
        expect(rows.length).toBeLessThanOrEqual(10);
        rows.forEach((row) => {
          const balance = Number(row.c_acctbal);
          expect(balance).toBeGreaterThanOrEqual(1000.0);
          expect(balance).toBeLessThanOrEqual(2000.0);
        });
      });

      test('should filter customers by multiple criteria', async () => {
        const result = await client.sql(
          `SELECT c_custkey, c_name, c_mktsegment, c_acctbal 
           FROM tpch.customer 
           WHERE c_mktsegment = $1 AND c_acctbal > $2 AND c_nationkey = $3 
           LIMIT 5`,
          { parameters: ['AUTOMOBILE', 0, 1] },
        );
        const rows = result.toArray();
        expect(rows.length).toBeLessThanOrEqual(5);
        rows.forEach((row) => {
          expect(row.c_mktsegment).toBe('AUTOMOBILE');
          expect(Number(row.c_acctbal)).toBeGreaterThan(0);
        });
      });
    });

    describe('Named Parameters', () => {
      test('should filter customer by named key parameter', async () => {
        const result = await client.sql(
          'SELECT c_custkey, c_name FROM tpch.customer WHERE c_custkey = $custkey LIMIT 1',
          { parameters: { custkey: 1 } },
        );
        const rows = result.toArray();
        expect(rows.length).toBeLessThanOrEqual(1);
        if (rows.length > 0) {
          expect(Number(rows[0].c_custkey)).toBe(1);
        }
      });

      test('should filter by named segment and balance', async () => {
        const result = await client.sql(
          `SELECT c_custkey, c_name, c_mktsegment, c_acctbal 
           FROM tpch.customer 
           WHERE c_mktsegment = $segment AND c_acctbal > $min_balance 
           LIMIT 5`,
          {
            parameters: {
              segment: 'MACHINERY',
              min_balance: 5000.0,
            },
          },
        );
        const rows = result.toArray();
        expect(rows.length).toBeLessThanOrEqual(5);
        rows.forEach((row) => {
          expect(row.c_mktsegment).toBe('MACHINERY');
          expect(Number(row.c_acctbal)).toBeGreaterThan(5000.0);
        });
      });
    });
  });

  describe('Orders Table Queries', () => {
    describe('Positional Parameters', () => {
      test('should filter orders by order key', async () => {
        const result = await client.sql(
          'SELECT o_orderkey, o_custkey, o_orderstatus, o_totalprice FROM tpch.orders WHERE o_orderkey = $1 LIMIT 1',
          { parameters: [1] },
        );
        const rows = result.toArray();
        expect(rows.length).toBeLessThanOrEqual(1);
        if (rows.length > 0) {
          expect(Number(rows[0].o_orderkey)).toBe(1);
        }
      });

      test('should filter orders by status', async () => {
        const result = await client.sql(
          'SELECT o_orderkey, o_orderstatus FROM tpch.orders WHERE o_orderstatus = $1 LIMIT 10',
          { parameters: ['F'] },
        );
        const rows = result.toArray();
        expect(rows.length).toBeLessThanOrEqual(10);
        rows.forEach((row) => {
          expect(row.o_orderstatus).toBe('F');
        });
      });

      test('should filter orders by priority', async () => {
        const result = await client.sql(
          'SELECT o_orderkey, o_orderpriority FROM tpch.orders WHERE o_orderpriority = $1 LIMIT 10',
          { parameters: ['1-URGENT'] },
        );
        const rows = result.toArray();
        expect(rows.length).toBeLessThanOrEqual(10);
        rows.forEach((row) => {
          expect(row.o_orderpriority).toBe('1-URGENT');
        });
      });

      test('should filter orders by total price range', async () => {
        const result = await client.sql(
          `SELECT o_orderkey, o_totalprice 
           FROM tpch.orders 
           WHERE o_totalprice >= $1 AND o_totalprice <= $2 
           LIMIT 10`,
          { parameters: [10000.0, 50000.0] },
        );
        const rows = result.toArray();
        expect(rows.length).toBeLessThanOrEqual(10);
        rows.forEach((row) => {
          const price = Number(row.o_totalprice);
          expect(price).toBeGreaterThanOrEqual(10000.0);
          expect(price).toBeLessThanOrEqual(50000.0);
        });
      });

      test('should filter orders by ship priority', async () => {
        const result = await client.sql(
          'SELECT o_orderkey, o_shippriority FROM tpch.orders WHERE o_shippriority = $1 LIMIT 5',
          { parameters: [0] },
        );
        const rows = result.toArray();
        expect(rows.length).toBeLessThanOrEqual(5);
        rows.forEach((row) => {
          expect(Number(row.o_shippriority)).toBe(0);
        });
      });
    });

    describe('Named Parameters', () => {
      test('should filter orders by named status and customer', async () => {
        const result = await client.sql(
          `SELECT o_orderkey, o_custkey, o_orderstatus 
           FROM tpch.orders 
           WHERE o_orderstatus = $status AND o_custkey = $customer_id 
           LIMIT 5`,
          {
            parameters: {
              status: 'O',
              customer_id: 1,
            },
          },
        );
        const rows = result.toArray();
        rows.forEach((row) => {
          expect(row.o_orderstatus).toBe('O');
          expect(Number(row.o_custkey)).toBe(1);
        });
      });

      test('should filter orders by date range using named params', async () => {
        const result = await client.sql(
          `SELECT o_orderkey, o_orderdate 
           FROM tpch.orders 
           WHERE o_orderdate >= $start_date AND o_orderdate <= $end_date 
           LIMIT 10`,
          {
            parameters: {
              start_date: '1995-01-01',
              end_date: '1995-12-31',
            },
          },
        );
        const rows = result.toArray();
        expect(rows.length).toBeLessThanOrEqual(10);
      });
    });
  });

  describe('Nation and Region Tables', () => {
    test('should filter nations by key', async () => {
      const result = await client.sql(
        'SELECT n_nationkey, n_name, n_regionkey FROM tpch.nation WHERE n_nationkey = $1',
        { parameters: [1] },
      );
      const rows = result.toArray();
      expect(rows.length).toBeLessThanOrEqual(1);
      if (rows.length > 0) {
        expect(Number(rows[0].n_nationkey)).toBe(1);
      }
    });

    test('should filter nations by region', async () => {
      const result = await client.sql(
        'SELECT n_nationkey, n_name, n_regionkey FROM tpch.nation WHERE n_regionkey = $1',
        { parameters: [1] },
      );
      const rows = result.toArray();
      rows.forEach((row) => {
        expect(Number(row.n_regionkey)).toBe(1);
      });
    });

    test('should filter regions by name', async () => {
      const result = await client.sql(
        'SELECT r_regionkey, r_name FROM tpch.region WHERE r_name = $1',
        { parameters: ['EUROPE'] },
      );
      const rows = result.toArray();
      expect(rows.length).toBeLessThanOrEqual(1);
      if (rows.length > 0) {
        expect(rows[0].r_name).toBe('EUROPE');
      }
    });

    test('should filter using IN clause with array', async () => {
      const result = await client.sql(
        'SELECT r_regionkey, r_name FROM tpch.region WHERE r_regionkey IN ($1, $2, $3)',
        { parameters: [0, 1, 2] },
      );
      const rows = result.toArray();
      expect(rows.length).toBeGreaterThanOrEqual(0);
      expect(rows.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Lineitem Table Queries', () => {
    test('should filter lineitems by order key', async () => {
      const result = await client.sql(
        'SELECT l_orderkey, l_partkey, l_quantity FROM tpch.lineitem WHERE l_orderkey = $1 LIMIT 10',
        { parameters: [1] },
      );
      const rows = result.toArray();
      rows.forEach((row) => {
        expect(Number(row.l_orderkey)).toBe(1);
      });
    });

    test('should filter lineitems by quantity range', async () => {
      const result = await client.sql(
        `SELECT l_orderkey, l_quantity, l_extendedprice 
         FROM tpch.lineitem 
         WHERE l_quantity >= $1 AND l_quantity <= $2 
         LIMIT 10`,
        { parameters: [10, 20] },
      );
      const rows = result.toArray();
      rows.forEach((row) => {
        const qty = Number(row.l_quantity);
        expect(qty).toBeGreaterThanOrEqual(10);
        expect(qty).toBeLessThanOrEqual(20);
      });
    });

    test('should filter lineitems by discount', async () => {
      const result = await client.sql(
        'SELECT l_orderkey, l_discount FROM tpch.lineitem WHERE l_discount >= $1 LIMIT 10',
        { parameters: [0.05] },
      );
      const rows = result.toArray();
      rows.forEach((row) => {
        expect(Number(row.l_discount)).toBeGreaterThanOrEqual(0.05);
      });
    });

    test('should filter lineitems with multiple conditions', async () => {
      const result = await client.sql(
        `SELECT l_orderkey, l_quantity, l_extendedprice, l_discount, l_tax 
         FROM tpch.lineitem 
         WHERE l_quantity > $1 AND l_discount < $2 AND l_tax <= $3 
         LIMIT 10`,
        { parameters: [5, 0.1, 0.08] },
      );
      const rows = result.toArray();
      rows.forEach((row) => {
        expect(Number(row.l_quantity)).toBeGreaterThan(5);
        expect(Number(row.l_discount)).toBeLessThan(0.1);
        expect(Number(row.l_tax)).toBeLessThanOrEqual(0.08);
      });
    });
  });

  describe('Part and Supplier Tables', () => {
    test('should filter parts by brand', async () => {
      const result = await client.sql(
        'SELECT p_partkey, p_name, p_brand FROM tpch.part WHERE p_brand = $1 LIMIT 5',
        { parameters: ['Brand#13'] },
      );
      const rows = result.toArray();
      rows.forEach((row) => {
        expect(row.p_brand).toBe('Brand#13');
      });
    });

    test('should filter parts by size', async () => {
      const result = await client.sql(
        'SELECT p_partkey, p_name, p_size FROM tpch.part WHERE p_size = $1 LIMIT 10',
        { parameters: [15] },
      );
      const rows = result.toArray();
      rows.forEach((row) => {
        expect(Number(row.p_size)).toBe(15);
      });
    });

    test('should filter suppliers by nation', async () => {
      const result = await client.sql(
        'SELECT s_suppkey, s_name, s_nationkey FROM tpch.supplier WHERE s_nationkey = $1 LIMIT 5',
        { parameters: [5] },
      );
      const rows = result.toArray();
      rows.forEach((row) => {
        expect(Number(row.s_nationkey)).toBe(5);
      });
    });

    test('should filter partsupp by availability', async () => {
      const result = await client.sql(
        `SELECT ps_partkey, ps_suppkey, ps_availqty 
         FROM tpch.partsupp 
         WHERE ps_availqty > $1 
         LIMIT 10`,
        { parameters: [5000] },
      );
      const rows = result.toArray();
      rows.forEach((row) => {
        expect(Number(row.ps_availqty)).toBeGreaterThan(5000);
      });
    });
  });

  describe('Join Queries with Parameters', () => {
    test('should join customer and orders with customer filter', async () => {
      const result = await client.sql(
        `SELECT c.c_custkey, c.c_name, o.o_orderkey, o.o_totalprice 
         FROM tpch.customer c 
         JOIN tpch.orders o ON c.c_custkey = o.o_custkey 
         WHERE c.c_custkey = $1 
         LIMIT 10`,
        { parameters: [1] },
      );
      const rows = result.toArray();
      rows.forEach((row) => {
        expect(Number(row.c_custkey)).toBe(1);
      });
    });

    test('should join customer and nation with region filter', async () => {
      const result = await client.sql(
        `SELECT c.c_custkey, c.c_name, n.n_name 
         FROM tpch.customer c 
         JOIN tpch.nation n ON c.c_nationkey = n.n_nationkey 
         WHERE n.n_regionkey = $1 
         LIMIT 10`,
        { parameters: [1] },
      );
      const rows = result.toArray();
      expect(rows.length).toBeLessThanOrEqual(10);
    });

    test('should join orders and lineitem with order key filter', async () => {
      const result = await client.sql(
        `SELECT o.o_orderkey, o.o_totalprice, l.l_partkey, l.l_quantity 
         FROM tpch.orders o 
         JOIN tpch.lineitem l ON o.o_orderkey = l.l_orderkey 
         WHERE o.o_orderkey = $1`,
        { parameters: [1] },
      );
      const rows = result.toArray();
      rows.forEach((row) => {
        expect(Number(row.o_orderkey)).toBe(1);
      });
    });

    test('should perform three-way join with named parameters', async () => {
      const result = await client.sql(
        `SELECT c.c_name, n.n_name, r.r_name 
         FROM tpch.customer c 
         JOIN tpch.nation n ON c.c_nationkey = n.n_nationkey 
         JOIN tpch.region r ON n.n_regionkey = r.r_regionkey 
         WHERE r.r_name = $region AND c.c_mktsegment = $segment 
         LIMIT 5`,
        {
          parameters: {
            region: 'EUROPE',
            segment: 'BUILDING',
          },
        },
      );
      const rows = result.toArray();
      rows.forEach((row) => {
        expect(row.r_name).toBe('EUROPE');
      });
    });

    test('should join with multiple filter conditions', async () => {
      const result = await client.sql(
        `SELECT o.o_orderkey, o.o_totalprice, l.l_quantity, l.l_extendedprice 
         FROM tpch.orders o 
         JOIN tpch.lineitem l ON o.o_orderkey = l.l_orderkey 
         WHERE o.o_orderstatus = $1 AND l.l_quantity > $2 AND l.l_discount < $3 
         LIMIT 10`,
        { parameters: ['F', 10, 0.05] },
      );
      const rows = result.toArray();
      rows.forEach((row) => {
        expect(Number(row.l_quantity)).toBeGreaterThan(10);
      });
    });
  });

  describe('Aggregate Queries with Parameters', () => {
    test('should count orders by status', async () => {
      const result = await client.sql(
        'SELECT COUNT(*) AS order_count FROM tpch.orders WHERE o_orderstatus = $1',
        { parameters: ['O'] },
      );
      const rows = result.toArray();
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].order_count)).toBeGreaterThanOrEqual(0);
    });

    test('should calculate sum with filter', async () => {
      const result = await client.sql(
        'SELECT SUM(o_totalprice) AS total_value FROM tpch.orders WHERE o_custkey = $1',
        { parameters: [1] },
      );
      const rows = result.toArray();
      expect(rows).toHaveLength(1);
    });

    test('should calculate average with filter', async () => {
      const result = await client.sql(
        'SELECT AVG(l_quantity) AS avg_qty FROM tpch.lineitem WHERE l_orderkey = $1',
        { parameters: [1] },
      );
      const rows = result.toArray();
      expect(rows).toHaveLength(1);
    });

    test('should group by with filter using named param', async () => {
      const result = await client.sql(
        `SELECT o_orderpriority, COUNT(*) AS cnt 
         FROM tpch.orders 
         WHERE o_orderstatus = $status 
         GROUP BY o_orderpriority 
         LIMIT 5`,
        { parameters: { status: 'F' } },
      );
      const rows = result.toArray();
      expect(rows.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Explicit Type Parameters with Param Class', () => {
    test('should use Param.int32 for customer key', async () => {
      const result = await client.sql(
        'SELECT c_custkey, c_name FROM tpch.customer WHERE c_custkey = $1 LIMIT 1',
        { parameters: [Param.int32(1)] },
      );
      const rows = result.toArray();
      expect(rows.length).toBeLessThanOrEqual(1);
      if (rows.length > 0) {
        expect(Number(rows[0].c_custkey)).toBe(1);
      }
    });

    test('should use Param.string for market segment', async () => {
      const result = await client.sql(
        'SELECT c_custkey, c_mktsegment FROM tpch.customer WHERE c_mktsegment = $1 LIMIT 5',
        { parameters: [Param.string('HOUSEHOLD')] },
      );
      const rows = result.toArray();
      rows.forEach((row) => {
        expect(row.c_mktsegment).toBe('HOUSEHOLD');
      });
    });

    test('should use Param.float64 for price filter', async () => {
      const result = await client.sql(
        'SELECT o_orderkey, o_totalprice FROM tpch.orders WHERE o_totalprice >= $1 LIMIT 5',
        { parameters: [Param.float64(100000.0)] },
      );
      const rows = result.toArray();
      rows.forEach((row) => {
        expect(Number(row.o_totalprice)).toBeGreaterThanOrEqual(100000.0);
      });
    });

    test('should use Param.int64 for large order keys', async () => {
      const result = await client.sql(
        'SELECT o_orderkey, o_custkey FROM tpch.orders WHERE o_orderkey > $1 LIMIT 5',
        { parameters: [Param.int64(BigInt(1000000))] },
      );
      const rows = result.toArray();
      rows.forEach((row) => {
        expect(BigInt(row.o_orderkey)).toBeGreaterThan(BigInt(1000000));
      });
    });

    test('should mix Param and raw values', async () => {
      const result = await client.sql(
        `SELECT c_custkey, c_mktsegment, c_acctbal 
         FROM tpch.customer 
         WHERE c_mktsegment = $1 AND c_acctbal > $2 
         LIMIT 5`,
        { parameters: [Param.string('FURNITURE'), 1000.0] },
      );
      const rows = result.toArray();
      rows.forEach((row) => {
        expect(row.c_mktsegment).toBe('FURNITURE');
        expect(Number(row.c_acctbal)).toBeGreaterThan(1000.0);
      });
    });

    test('should use named params with Param class', async () => {
      const result = await client.sql(
        `SELECT o_orderkey, o_orderstatus, o_totalprice 
         FROM tpch.orders 
         WHERE o_orderstatus = $status AND o_totalprice > $min_price 
         LIMIT 5`,
        {
          parameters: {
            status: Param.string('O'),
            min_price: Param.float64(50000.0),
          },
        },
      );
      const rows = result.toArray();
      rows.forEach((row) => {
        expect(row.o_orderstatus).toBe('O');
        expect(Number(row.o_totalprice)).toBeGreaterThan(50000.0);
      });
    });
  });

  describe('Many Positional Parameters', () => {
    test('should handle 10+ positional parameters', async () => {
      const result = await client.sql(
        `SELECT $1 AS v1, $2 AS v2, $3 AS v3, $4 AS v4, $5 AS v5, 
                $6 AS v6, $7 AS v7, $8 AS v8, $9 AS v9, $10 AS v10,
                $11 AS v11, $12 AS v12`,
        {
          parameters: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        },
      );
      const rows = result.toArray();
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].v1)).toBe(1);
      expect(Number(rows[0].v10)).toBe(10);
      expect(Number(rows[0].v11)).toBe(11);
      expect(Number(rows[0].v12)).toBe(12);
    });

    test('should handle parameters in non-sequential order in query', async () => {
      const result = await client.sql(
        'SELECT $3 AS first, $1 AS second, $2 AS third',
        { parameters: ['a', 'b', 'c'] },
      );
      const rows = result.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0].first).toBe('c');
      expect(rows[0].second).toBe('a');
      expect(rows[0].third).toBe('b');
    });
  });

  describe('Edge Cases and Special Characters', () => {
    test('should handle LIKE pattern with parameter', async () => {
      const result = await client.sql(
        "SELECT c_custkey, c_name FROM tpch.customer WHERE c_name LIKE $1 || '%' LIMIT 5",
        { parameters: ['Customer#00000'] },
      );
      const rows = result.toArray();
      rows.forEach((row) => {
        expect(row.c_name).toMatch(/^Customer#00000/);
      });
    });

    test('should handle parameter with special SQL characters', async () => {
      // Test with comment that might have SQL-like content
      const result = await client.sql(
        'SELECT n_nationkey, n_name FROM tpch.nation WHERE n_name != $1 LIMIT 5',
        { parameters: ["'; DROP TABLE nation; --"] },
      );
      const rows = result.toArray();
      // Query should succeed and return results (SQL injection prevented)
      expect(rows.length).toBeGreaterThanOrEqual(0);
    });

    test('should handle empty result set with valid parameters', async () => {
      const result = await client.sql(
        'SELECT c_custkey FROM tpch.customer WHERE c_custkey = $1 AND c_custkey = $2',
        { parameters: [1, 2] }, // Impossible condition
      );
      const rows = result.toArray();
      expect(rows).toHaveLength(0);
    });

    test('should handle comparison with zero', async () => {
      const result = await client.sql(
        'SELECT o_orderkey, o_shippriority FROM tpch.orders WHERE o_shippriority = $1 LIMIT 5',
        { parameters: [0] },
      );
      const rows = result.toArray();
      rows.forEach((row) => {
        expect(Number(row.o_shippriority)).toBe(0);
      });
    });

    test('should handle negative number parameter', async () => {
      const result = await client.sql(
        'SELECT c_custkey, c_acctbal FROM tpch.customer WHERE c_acctbal < $1 LIMIT 5',
        { parameters: [0] },
      );
      const rows = result.toArray();
      rows.forEach((row) => {
        expect(Number(row.c_acctbal)).toBeLessThan(0);
      });
    });
  });

  describe('Subquery with Parameters', () => {
    test('should use parameter in subquery', async () => {
      const result = await client.sql(
        `SELECT c_custkey, c_name 
         FROM tpch.customer 
         WHERE c_custkey IN (
           SELECT o_custkey FROM tpch.orders WHERE o_orderstatus = $1 LIMIT 5
         ) 
         LIMIT 5`,
        { parameters: ['O'] },
      );
      const rows = result.toArray();
      expect(rows.length).toBeLessThanOrEqual(5);
    });

    test('should use parameters in correlated subquery', async () => {
      const result = await client.sql(
        `SELECT c.c_custkey, c.c_name,
           (SELECT COUNT(*) FROM tpch.orders o WHERE o.o_custkey = c.c_custkey AND o.o_orderstatus = $1) AS order_count
         FROM tpch.customer c
         WHERE c.c_mktsegment = $2
         LIMIT 5`,
        { parameters: ['O', 'BUILDING'] },
      );
      const rows = result.toArray();
      expect(rows.length).toBeLessThanOrEqual(5);
    });
  });

  describe('ORDER BY and LIMIT with Parameters', () => {
    test('should combine ORDER BY with parameter filter', async () => {
      const result = await client.sql(
        `SELECT o_orderkey, o_totalprice 
         FROM tpch.orders 
         WHERE o_orderstatus = $1 
         ORDER BY o_totalprice DESC 
         LIMIT 10`,
        { parameters: ['F'] },
      );
      const rows = result.toArray();
      expect(rows.length).toBeLessThanOrEqual(10);
      // Verify descending order
      for (let i = 1; i < rows.length; i++) {
        expect(Number(rows[i - 1].o_totalprice)).toBeGreaterThanOrEqual(
          Number(rows[i].o_totalprice),
        );
      }
    });
  });

  describe('Case Expressions with Parameters', () => {
    test('should use parameter in CASE expression', async () => {
      const result = await client.sql(
        `SELECT c_custkey, 
                CASE WHEN c_mktsegment = $1 THEN 'match' ELSE 'no_match' END AS segment_match
         FROM tpch.customer 
         LIMIT 10`,
        { parameters: ['BUILDING'] },
      );
      const rows = result.toArray();
      expect(rows).toHaveLength(10);
      rows.forEach((row) => {
        expect(['match', 'no_match']).toContain(row.segment_match);
      });
    });
  });

  describe('COALESCE and NULL handling with Parameters', () => {
    test('should use COALESCE with parameter', async () => {
      const result = await client.sql(
        `SELECT c_custkey, COALESCE(c_phone, $1) AS phone
         FROM tpch.customer 
         LIMIT 5`,
        { parameters: ['N/A'] },
      );
      const rows = result.toArray();
      expect(rows.length).toBeLessThanOrEqual(5);
    });

    test('should compare with NULL using IS NOT NULL and parameter', async () => {
      const result = await client.sql(
        `SELECT c_custkey, c_comment 
         FROM tpch.customer 
         WHERE c_comment IS NOT NULL AND c_mktsegment = $1 
         LIMIT 5`,
        { parameters: ['AUTOMOBILE'] },
      );
      const rows = result.toArray();
      rows.forEach((row) => {
        expect(row.c_comment).not.toBeNull();
      });
    });
  });
});
