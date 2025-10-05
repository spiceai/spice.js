/**
 * Test setup - Load environment variables from .env file
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env file from project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Ensure API key is available for tests that need it
if (!process.env.SPICE_API_KEY) {
  console.warn(
    '⚠️  Warning: SPICE_API_KEY not set in environment. ' +
    'Some integration tests will be skipped. ' +
    'Copy .env.example to .env and add your API key to run all tests.'
  );
}
