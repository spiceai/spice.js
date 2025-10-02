/**
 * Example demonstrating HTTP fallback when gRPC is unavailable
 *
 * This example shows how the SpiceClient automatically falls back to HTTP
 * when the Flight.proto file is not available (e.g., in serverless environments).
 */

const { SpiceClient } = require('../dist');

async function main() {
  // Create a client - it will automatically detect if gRPC is available
  const client = new SpiceClient('http://localhost:8090');

  try {
    console.log('Executing query...');
    const result = await client.query('SELECT * FROM taxi_trips LIMIT 5');

    console.log('Query successful!');
    console.log(`Number of rows: ${result.numRows}`);
    console.log('\nResults:');
    console.log(result.toArray());
  } catch (error) {
    console.error('Query failed:', error.message);
  }
}

main();
