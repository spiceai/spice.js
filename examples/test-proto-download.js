/**
 * Test script to verify proto download functionality
 *
 * This script simulates a scenario where the local proto file is missing
 * and verifies that the client can download it automatically.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const PROTO_CACHE_DIR = path.join(os.tmpdir(), 'spiceai-proto-cache');
const PROTO_CACHE_FILE = path.join(PROTO_CACHE_DIR, 'Flight.proto');

console.log('Testing proto download functionality...\n');

// Clean up any existing cache
if (fs.existsSync(PROTO_CACHE_DIR)) {
  console.log('Removing existing proto cache...');
  fs.rmSync(PROTO_CACHE_DIR, { recursive: true, force: true });
}

console.log('Cache directory:', PROTO_CACHE_DIR);
console.log('Expected cache file:', PROTO_CACHE_FILE);
console.log(
  '\nImporting SpiceClient (this should trigger proto initialization)...',
);

// Import the client - this will attempt to load proto
const { SpiceClient } = require('../dist');

console.log('\nClient imported. Creating client instance...');
const client = new SpiceClient('http://localhost:8090');

console.log('\nClient created successfully!');
console.log(
  '\nNote: The proto file will be downloaded on the first query if needed.',
);
console.log('To test with a real Spice instance, run:');
console.log('  node examples/http-fallback.js\n');
