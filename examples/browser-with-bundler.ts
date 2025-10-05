/**
 * Example for using Spice.js in a browser with a bundler (webpack, vite, etc.)
 */

import { SpiceClient } from '@spiceai/spice';

// Create a client - in browser environments, it automatically uses HTTP-only mode
const client = new SpiceClient({
  httpUrl: 'http://localhost:8090',
  // apiKey: 'your-api-key-here' // if connecting to Spice Cloud
});

async function queryData() {
  try {
    console.log('Executing query...');

    // Execute a SQL query
    const result = await client.sql('SELECT * FROM taxi_trips LIMIT 10');

    console.log('Query successful!');
    console.log(`Number of rows: ${result.numRows}`);
    console.log(`Number of columns: ${result.numCols}`);
    console.log('\nData:');
    console.log(result.toArray());
  } catch (error) {
    console.error(
      'Query failed:',
      error instanceof Error ? error.message : String(error)
    );
  }
}

// Execute the query
queryData();
