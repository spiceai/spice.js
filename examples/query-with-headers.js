/**
 * Example: Using custom headers with SQL queries
 *
 * This example demonstrates how to pass custom headers to SQL queries.
 * Headers are translated to:
 * - HTTP headers when using HTTP transport
 * - Flight metadata when using gRPC/Arrow Flight transport
 */

const { SpiceClient } = require('@spiceai/spice');

async function main() {
  // Initialize the Spice client
  const client = new SpiceClient({
    apiKey: process.env.SPICEAI_API_KEY || 'your-api-key',
    httpUrl: process.env.SPICE_HTTP_URL || 'http://127.0.0.1:8090',
    flightUrl: process.env.SPICE_FLIGHT_URL || '127.0.0.1:50051',
  });

  // Custom headers to pass with the query
  const headers = {
    'X-Custom-Header': 'custom-value',
    'X-Request-ID': '12345',
  };

  try {
    // Example 1: Using .sql() with custom headers
    console.log('Example 1: SQL query with custom headers (Arrow Table)');
    const table = await client.sql(
      'SELECT * FROM my_table LIMIT 10',
      undefined, // no streaming callback
      headers, // custom headers
    );
    console.log('Rows returned:', table.numRows);
    console.log('Columns:', table.schema.fields.map((f) => f.name).join(', '));
    console.log();

    // Example 2: Using .sqlJson() with custom headers
    console.log('Example 2: SQL query with custom headers (JSON response)');
    const jsonResult = await client.sqlJson(
      'SELECT * FROM my_table LIMIT 10',
      headers, // custom headers
    );
    console.log('Rows returned:', jsonResult.row_count);
    console.log('Execution time:', jsonResult.execution_time_ms, 'ms');
    console.log('First row:', JSON.stringify(jsonResult.data[0], null, 2));
    console.log();

    // Example 3: Streaming query with custom headers
    console.log('Example 3: Streaming SQL query with custom headers');
    let chunkCount = 0;
    await client.sql(
      'SELECT * FROM my_table',
      (chunk) => {
        chunkCount++;
        console.log(`Received chunk ${chunkCount} with ${chunk.numRows} rows`);
      },
      headers, // custom headers
    );
    console.log(`Total chunks received: ${chunkCount}`);
  } catch (error) {
    console.error('Error executing query:', error.message);
  }
}

main();
