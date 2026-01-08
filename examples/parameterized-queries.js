/**
 * Example demonstrating parameterized queries with Apache Flight SQL
 *
 * The SpiceClient automatically uses Apache Flight SQL (via gRPC) for parameterized
 * queries with client-side parameter substitution. This provides security against
 * SQL injection while maintaining compatibility with all Flight SQL implementations.
 */

const { SpiceClient } = require('@spiceai/spice');

async function main() {
  console.log('='.repeat(80));
  console.log('Parameterized Queries with Apache Flight SQL');
  console.log('='.repeat(80));

  // Initialize client
  const client = new SpiceClient({
    apiKey: process.env.SPICEAI_API_KEY,
    httpUrl: 'https://data.spiceai.io',
    flightUrl: 'flight.spiceai.io:443',
  });

  try {
    // Example 1: Positional parameters (recommended)
    console.log('\n📊 Example 1: Positional Parameters ($1, $2, etc.)');
    console.log('-'.repeat(80));

    const table1 = await client.sql(
      'SELECT * FROM taxi_trips WHERE passenger_count = $1 AND trip_distance > $2 LIMIT 10',
      { parameters: [2, 5.0] },
    );

    console.log(`✓ Query executed successfully`);
    console.log(`  Rows returned: ${table1.numRows}`);
    console.log(
      `  Transport used: Apache Flight SQL (gRPC) with parameter substitution`,
    );
    console.log('\nFirst few rows:');
    console.table(table1.toArray().slice(0, 3));

    // Example 2: Named parameters
    console.log('\n📊 Example 2: Named Parameters ($param_name)');
    console.log('-'.repeat(80));

    const table2 = await client.sql(
      'SELECT * FROM taxi_trips WHERE passenger_count = $passengers AND fare_amount > $min_fare LIMIT 10',
      {
        parameters: {
          passengers: 3,
          min_fare: 20.0,
        },
      },
    );

    console.log(`✓ Query executed successfully`);
    console.log(`  Rows returned: ${table2.numRows}`);
    console.log('\nFirst few rows:');
    console.table(table2.toArray().slice(0, 3));

    // Example 3: Different data types
    console.log('\n📊 Example 3: Multiple Data Types');
    console.log('-'.repeat(80));

    const table3 = await client.sql(
      `SELECT * FROM taxi_trips 
       WHERE passenger_count >= $1 
       AND trip_distance BETWEEN $2 AND $3 
       AND store_and_fwd_flag = $4 
       LIMIT 10`,
      {
        parameters: [
          2, // integer
          1.0, // float (minimum distance)
          10.0, // float (maximum distance)
          'N', // string
        ],
      },
    );

    console.log(`✓ Query executed successfully`);
    console.log(`  Rows returned: ${table3.numRows}`);
    console.log('\nFirst few rows:');
    console.table(table3.toArray().slice(0, 3));

    // Example 4: Handling special characters (SQL injection prevention)
    console.log('\n📊 Example 4: SQL Injection Prevention');
    console.log('-'.repeat(80));

    // This would be dangerous without proper escaping
    const maliciousInput = "' OR '1'='1";

    const table4 = await client.sql(
      'SELECT COUNT(*) as count FROM taxi_trips WHERE store_and_fwd_flag = $1',
      { parameters: [maliciousInput] },
    );

    console.log(`✓ Query executed safely`);
    console.log(`  Input value: "${maliciousInput}"`);
    console.log(`  Parameters are properly escaped - no SQL injection!`);
    console.log('\nResult:');
    console.table(table4.toArray());

    // Example 5: NULL handling
    console.log('\n📊 Example 5: NULL Values');
    console.log('-'.repeat(80));

    const table5 = await client.sql(
      'SELECT * FROM taxi_trips WHERE passenger_count = $1 OR $1 IS NULL LIMIT 5',
      { parameters: [null] },
    );

    console.log(`✓ NULL parameter handled correctly`);
    console.log(`  Rows returned: ${table5.numRows}`);

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('✓ All examples completed successfully!');
    console.log('='.repeat(80));
    console.log('\n📝 Key Points:');
    console.log(
      '  • Parameterized queries work perfectly with Apache Flight SQL',
    );
    console.log('  • Parameters are safely substituted on the client side');
    console.log(
      '  • Both positional ($1, $2) and named ($param_name) parameters supported',
    );
    console.log(
      '  • Automatic SQL injection prevention through proper escaping',
    );
    console.log(
      '  • Works with all data types: strings, numbers, booleans, null',
    );
    console.log('  • Automatic fallback to HTTP if Flight SQL is unavailable');
    console.log('\n💡 Best Practices:');
    console.log('  • Use positional parameters for simple queries');
    console.log(
      '  • Use named parameters for complex queries with many parameters',
    );
    console.log('  • Never concatenate user input directly into SQL strings');
    console.log('  • Let the SDK handle parameter escaping automatically');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
