/**
 * Integration test for proto download from https://data.spiceai.io/v1/proto
 *
 * This test verifies that the proto file can be downloaded successfully.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROTO_DOWNLOAD_URL = 'https://data.spiceai.io/v1/proto/flight';
const PROTO_CACHE_DIR = path.join(os.tmpdir(), 'spiceai-proto-cache-test');
const PROTO_CACHE_FILE = path.join(PROTO_CACHE_DIR, 'Flight.proto');

async function testProtoDownload() {
  console.log('Testing proto download from:', PROTO_DOWNLOAD_URL);
  console.log('');

  try {
    // Clean up test directory
    if (fs.existsSync(PROTO_CACHE_DIR)) {
      fs.rmSync(PROTO_CACHE_DIR, { recursive: true, force: true });
    }

    // Create cache directory
    fs.mkdirSync(PROTO_CACHE_DIR, { recursive: true });

    // Download proto file
    console.log('Downloading proto file...');
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(PROTO_DOWNLOAD_URL);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const protoContent = await response.text();
    console.log(`✓ Downloaded ${protoContent.length} bytes`);

    // Verify it looks like a proto file
    if (
      !protoContent.includes('syntax = "proto3"') &&
      !protoContent.includes("syntax = 'proto3'")
    ) {
      throw new Error(
        'Downloaded content does not appear to be a valid proto file',
      );
    }
    console.log('✓ Content validated as proto file');

    // Check for expected Flight service definitions
    if (protoContent.includes('service FlightService')) {
      console.log('✓ FlightService definition found');
    } else {
      console.warn(
        '⚠ FlightService definition not found (may be OK if format changed)',
      );
    }

    // Save to file
    fs.writeFileSync(PROTO_CACHE_FILE, protoContent);
    console.log(`✓ Saved to ${PROTO_CACHE_FILE}`);

    // Verify file exists and is readable
    const savedContent = fs.readFileSync(PROTO_CACHE_FILE, 'utf8');
    if (savedContent === protoContent) {
      console.log('✓ File verification passed');
    } else {
      throw new Error('Saved file content does not match downloaded content');
    }

    console.log('\n✅ Proto download test PASSED\n');
    console.log('The proto file can be successfully downloaded from:');
    console.log(PROTO_DOWNLOAD_URL);

    // Clean up
    fs.rmSync(PROTO_CACHE_DIR, { recursive: true, force: true });

    return true;
  } catch (error) {
    console.error('\n❌ Proto download test FAILED');
    console.error('Error:', error.message);
    console.error(
      '\nThis means HTTP fallback will be used in environments where the proto file is missing.',
    );
    return false;
  }
}

// Run the test
testProtoDownload().then((success) => {
  process.exit(success ? 0 : 1);
});
