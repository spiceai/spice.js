# Browser Tests

## Overview

Comprehensive test suite for browser-specific functionality in the Spice.js SDK. These tests verify that the library works correctly in browser environments using HTTP-only communication (no gRPC).

## Test Coverage

### 1. Client Tests (`test/browser/client.test.ts`)

50 tests covering all SpiceClient functionality in browser environments:

#### Initialization

- ✅ Default initialization
- ✅ Custom HTTP URL
- ✅ Custom headers
- ✅ API key authentication

#### Health Checks

- ✅ `isSpiceHealthy()` - unauthenticated health check
- ✅ `isSpiceReady()` - authenticated readiness check
- ✅ Error handling for health endpoints

#### SQL Queries

- ✅ Basic SQL query execution
- ✅ Response parsing (Arrow IPC format)
- ✅ Error handling (HTTP errors, parse errors)
- ✅ Custom query parameters
- ✅ Retry logic on retryable errors
- ✅ Authentication headers

#### NSQL (Natural Language SQL)

- ✅ Basic NSQL queries
- ✅ Custom parameters
- ✅ Error handling

#### Dataset Refresh

- ✅ Basic refresh
- ✅ Refresh with options
- ✅ Refresh with custom SQL

#### Browser-Specific Behavior

- ✅ No gRPC support (HTTP only)
- ✅ Native fetch API usage
- ✅ Browser User-Agent detection

### 2. Platform Tests (`test/browser/platform.test.ts`)

Tests for the browser platform adapter:

- ✅ `supportsGrpc()` returns `false`
- ✅ `getUserAgent()` includes "Browser"
- ✅ `fetch()` wrapper functionality
- ✅ Error handling

### 3. Retry Tests (`test/browser/retry.test.ts`)

Tests for browser-specific retry logic:

#### Retry Behavior

- ✅ Success on first attempt
- ✅ Retry on failure and succeed
- ✅ Exhaust all retries
- ✅ No retry when maxRetries is 0
- ✅ Error on negative maxRetries

#### HTTP Status Codes

- ✅ Retry on 500 (Internal Server Error)
- ✅ Retry on 503 (Service Unavailable)
- ✅ Retry on 408 (Request Timeout)
- ✅ Retry on 429 (Too Many Requests)
- ✅ No retry on 400 (Bad Request)
- ✅ No retry on 404 (Not Found)
- ✅ No retry on 401 (Unauthorized)
- ✅ No retry on 403 (Forbidden)

#### Permanent Errors

- ✅ No retry when error marked with `dontRetry()`

#### Timing

- ✅ Exponential backoff (1.5^attempt \* 1000ms)
- ✅ Uses Jest fake timers to avoid slow tests

## Running Tests

### Run Browser Tests Only

```bash
npm run test:browser
```

### Run All Tests (Node.js + Browser)

```bash
npm test
```

### Watch Mode

```bash
npm run test:watch
```

### Coverage Report

```bash
npm run test:coverage
```

## Test Environment

- **Test Framework**: Jest 30.2.0
- **Environment**: jsdom (simulated browser)
- **TypeScript**: ts-jest with strict mode
- **Entry Point**: `src/index.browser.ts`

### Polyfills

Browser tests require TextEncoder/TextDecoder for Apache Arrow:

```typescript
// test/browser/setup.ts
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
```

## Test Structure

```typescript
import { SpiceClient } from '../../src/index.browser';

describe('Browser Feature', () => {
  beforeEach(() => {
    // Mock global fetch
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should work in browser', async () => {
    // Mock successful response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: jest.fn() },
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
    });

    const client = new SpiceClient({ httpUrl: 'http://localhost:8090' });
    const result = await client.query('SELECT 1');

    expect(result).toBeDefined();
  });
});
```

## Key Differences from Node.js Tests

| Feature  | Node.js             | Browser                |
| -------- | ------------------- | ---------------------- |
| gRPC     | ✅ Supported        | ❌ Not supported       |
| HTTP     | ✅ Fallback         | ✅ Primary             |
| Fetch    | node-fetch          | Native fetch           |
| Platform | Node.js runtime     | jsdom                  |
| Entry    | `src/index.node.ts` | `src/index.browser.ts` |

## Mocking

### Fetch API

```typescript
global.fetch = jest.fn().mockResolvedValueOnce({
  ok: true,
  status: 200,
  headers: {
    get: jest.fn().mockReturnValue('application/json'),
  },
  text: jest.fn().mockResolvedValue('response body'),
  arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
});
```

### Timers (for retry tests)

```typescript
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test('retry with delay', async () => {
  const promise = retryOperation();
  await jest.runAllTimersAsync();
  const result = await promise;
});
```

## Configuration

### Jest Config (`jest.config.browser.js`)

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testMatch: ['**/test/browser/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/browser/setup.ts'],
  moduleNameMapper: {
    '^@spiceai/spice$': '<rootDir>/src/index.browser.ts',
  },
};
```

## Continuous Integration

For CI pipelines:

```yaml
- name: Install dependencies
  run: npm ci

- name: Build
  run: npm run build

- name: Run Browser Tests
  run: npm run test:browser
```

## Debugging

### Run Specific Test

```bash
npm run test:browser -- -t "should query via HTTP"
```

### Verbose Output

```bash
npm run test:browser -- --verbose
```

### Debug with Inspector

```bash
node --inspect-brk node_modules/.bin/jest --config jest.config.browser.js --runInBand
```

## Future Enhancements

Potential additions:

- [ ] Integration tests with real Spice runtime
- [ ] WebSocket support tests
- [ ] Large dataset handling tests
- [ ] Browser-specific error scenarios
- [ ] Performance benchmarks
- [ ] Cross-browser compatibility tests (using Playwright/Puppeteer)

## Related Documentation

- [Main Test README](../test/README.md)
- [Platform Abstraction](../src/platform/README.md)
- [Contributing Guide](../CONTRIBUTING.md)
