/**
 * Example demonstrating health check functionality
 *
 * This example shows how to use the isSpiceHealthy() and isSpiceReady()
 * methods to check the status of a Spice runtime.
 */

const { SpiceClient } = require('../dist/node/index.node.js');

async function main() {
  // Create a client pointing to local Spice runtime
  const client = new SpiceClient({
    httpUrl: 'http://localhost:8090',
  });

  console.log('Checking Spice runtime status...\n');

  // Check health (unauthenticated)
  try {
    const isHealthy = await client.isSpiceHealthy();
    console.log(`Health check: ${isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`);
  } catch (error) {
    console.error('Health check error:', error.message);
  }

  // Check ready status (authenticated)
  try {
    const isReady = await client.isSpiceReady();
    console.log(`Ready check: ${isReady ? '✅ Ready' : '❌ Not Ready'}`);
  } catch (error) {
    console.error('Ready check error:', error.message);
  }

  // Example: Wait for Spice to be ready before executing queries
  console.log('\nWaiting for Spice to be ready...');
  const maxAttempts = 10;
  let attempt = 0;

  while (attempt < maxAttempts) {
    const isReady = await client.isSpiceReady();
    if (isReady) {
      console.log('✅ Spice is ready!');
      break;
    }

    attempt++;
    console.log(`Attempt ${attempt}/${maxAttempts}: Not ready yet, waiting...`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (attempt === maxAttempts) {
    console.log('❌ Spice did not become ready in time');
  }
}

main().catch(console.error);
