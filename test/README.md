# Spice.js Tests

This directory contains tests for both Node.js and browser environments.

## Test Structure

```
test/
├── browser/                 # Browser-specific tests (jsdom)
│   ├── client.test.ts      # SpiceClient browser tests
│   ├── platform.test.ts    # Browser platform adapter tests
│   └── retry.test.ts       # Browser retry logic tests
├── cloud.test.ts           # Cloud/production API tests (Node.js)
├── local-runtime.test.ts   # Local runtime tests (Node.js)
└── user-agent.test.ts      # User agent tests (Node.js)
```

## Running Tests

### Run All Tests

```bash
npm test
```

This runs both Node.js and browser tests sequentially.

### Run Node.js Tests Only

```bash
npm run test:node
```

Tests the Node.js build with full gRPC support and HTTP fallback.

### Run Browser Tests Only

```bash
npm run test:browser
```

Tests the browser build using jsdom environment. These tests verify:

- HTTP-only functionality (no gRPC)
- Browser platform adapter
- Native fetch API usage
- Browser-specific retry logic

### Watch Mode

```bash
npm run test:watch
```

Runs tests in watch mode for development.

### Coverage Report

```bash
npm run test:coverage
```

Generates a test coverage report.

## Test Environments

### Node.js Tests

- **Environment**: Node.js runtime
- **Configuration**: `jest.config.node.js`
- **Entry Point**: Tests import from `@spiceai/spice` (default/Node.js build)
- **Features Tested**:
  - gRPC Flight protocol
  - HTTP fallback
  - Node.js platform adapter
  - Full API functionality

### Browser Tests

- **Environment**: jsdom (simulated browser)
- **Configuration**: `jest.config.browser.js`
- **Entry Point**: Tests import from `src/index.browser.ts`
- **Features Tested**:
  - HTTP-only queries
  - Browser platform adapter
  - Native fetch API
  - Browser retry logic (HTTP error codes)
  - No gRPC dependencies

## Writing Tests

### Node.js Test Example

```typescript
import { SpiceClient } from '../';

describe('Node.js Feature', () => {
  test('should work with gRPC', async () => {
    const client = new SpiceClient();
    // Test Node.js specific functionality
  });
});
```

### Browser Test Example

```typescript
import { SpiceClient } from '../../src/index.browser';

describe('Browser Feature', () => {
  beforeEach(() => {
    global.fetch = jest.fn(); // Mock fetch
  });

  test('should work in browser', async () => {
    const client = new SpiceClient({ httpUrl: 'http://localhost:8090' });
    // Test browser-specific functionality
  });
});
```

## Mocking

### Browser Tests

Browser tests mock the global `fetch` API:

```typescript
beforeEach(() => {
  global.fetch = jest.fn();
});

// Mock a successful response
(global.fetch as jest.Mock).mockResolvedValueOnce({
  ok: true,
  status: 200,
  headers: { get: jest.fn() },
  text: jest.fn().mockResolvedValue('response'),
  json: jest.fn().mockResolvedValue({ data: 'test' }),
});
```

### Node.js Tests

Node.js tests can run against a real Spice runtime or mock responses as needed.

## Test Coverage

Tests should cover:

- ✅ Client initialization
- ✅ SQL queries (via gRPC and HTTP)
- ✅ Health checks (`isSpiceHealthy`, `isSpiceReady`)
- ✅ NSQL (natural language queries)
- ✅ Dataset refresh
- ✅ Retry logic
- ✅ Error handling
- ✅ Authentication (API keys)
- ✅ Custom headers
- ✅ Platform-specific behavior

## Continuous Integration

In CI environments, ensure:

1. Install dependencies: `npm install`
2. Build the package: `npm run build`
3. Run all tests: `npm test`

Example GitHub Actions workflow:

```yaml
- name: Install dependencies
  run: npm ci

- name: Build
  run: npm run build

- name: Run Node.js tests
  run: npm run test:node

- name: Run Browser tests
  run: npm run test:browser
```

## Environment Variables

For cloud tests, set:

- `SPICE_API_KEY` - Your Spice.ai API key
- `HTTP_URL` - HTTP endpoint (optional, defaults to https://data.spiceai.io)
- `FLIGHT_URL` - Flight endpoint (optional, defaults to flight.spiceai.io:443)

## Debugging Tests

### Debug a Specific Test

```bash
node --inspect-brk node_modules/.bin/jest --runInBand test/browser/client.test.ts
```

### Run Tests Verbosely

```bash
npm test -- --verbose
```

### Run a Single Test File

```bash
npm run test:node -- cloud.test.ts
npm run test:browser -- test/browser/client.test.ts
```

## Best Practices

1. **Isolate Tests**: Each test should be independent
2. **Mock External Calls**: Mock fetch/network calls in browser tests
3. **Clean Up**: Use `afterEach` to restore mocks
4. **Descriptive Names**: Use clear test descriptions
5. **Test Both Paths**: Test success and error cases
6. **Platform-Specific**: Keep Node.js and browser tests separate

## Troubleshooting

### Tests Fail Due to Missing Build

Run `npm run build` before testing.

### Browser Tests Fail

Ensure `jest-environment-jsdom` is installed:

```bash
npm install --save-dev jest-environment-jsdom
```

### Type Errors in Tests

Make sure TypeScript configurations include test files:

```json
{
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```
