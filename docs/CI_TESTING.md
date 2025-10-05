# Continuous Integration Testing

This document describes how the Spice.js SDK is tested in CI using GitHub Actions.

## Overview

The CI pipeline runs two types of tests:

1. **Browser Tests** - Lightweight tests using jsdom (no external dependencies)
2. **Node.js Tests** - Full integration tests with Spice runtime and PostgreSQL

## Workflows

### Test Workflow (`.github/workflows/test.yml`)

Runs on every pull request and push to trunk/release branches.

#### Job 1: `browser-tests`

Fast, lightweight browser tests that run on Ubuntu with multiple Node.js versions.

**Matrix:**

- OS: `ubuntu-latest`
- Node.js: `20`, `22`, `24`

**Steps:**

1. Checkout code
2. Setup Node.js
3. Install dependencies (`npm install`)
4. Build project (`npm run build`)
5. Run browser tests (`npm run test:browser`)

**Duration:** ~1-2 minutes per matrix job

**What's tested:**

- Browser-specific SpiceClient functionality
- HTTP-only communication (no gRPC)
- Browser platform adapter
- Browser retry logic
- All tests run in jsdom environment

#### Job 2: `test`

Full integration tests with Spice runtime and PostgreSQL.

**Matrix:**

- OS: `ubuntu-latest`, `macos-latest`
- Node.js: `20`, `22`, `24`

**Steps:**

1. Checkout code
2. Setup Node.js
3. Install dependencies
4. Build project
5. Install and start PostgreSQL
6. Setup test database
7. Install Spice runtime
8. Start Spice runtime
9. **Run browser tests** (`npm run test:browser`)
10. **Run Node.js local tests** (`npm run test:node`)
11. Setup Vercel endpoint
12. Run cloud tests
13. Stop Spice and check logs

**Duration:** ~5-10 minutes per matrix job

**What's tested:**

- All browser tests (redundantly, for safety)
- Node.js SpiceClient functionality
- gRPC Flight protocol
- HTTP fallback
- Local Spice runtime integration
- Cloud Spice.ai API integration
- User agent tests

### NPM Publish Workflow (`.github/workflows/npm-publish.yml`)

Runs when a release is published or manually triggered.

#### Job 1: `build`

Pre-publish validation tests.

**Matrix:**

- OS: `ubuntu-latest`, `macos-latest`
- Node.js: `20`, `22`, `24`

**Steps:**

1. Checkout code
2. Setup Node.js
3. Install dependencies
4. Build project
5. **Run browser tests** (`npm run test:browser`)
6. Setup Vercel endpoint
7. Run cloud tests (`npm run test -t 'cloud'`)

**What's tested:**

- Browser compatibility across platforms
- Cloud API integration
- Build artifacts are valid

#### Job 2: `publish-npm`

Publishes the package to npm after successful tests.

**Requirements:**

- `build` job must pass
- Node.js 18
- NPM token configured

**Steps:**

1. Update version in `version.ts`
2. Build project
3. Publish to npm

## Test Commands

### Local Development

```bash
# Run all tests
npm test

# Run only browser tests
npm run test:browser

# Run only Node.js tests
npm run test:node

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### CI Commands

The CI uses the same commands as local development:

- `npm run test:browser` - Browser tests with jsdom
- `npm run test:node` - Node.js tests with Jest node environment

## Environment Variables

### Required for Cloud Tests

- `SPICE_API_KEY` - Spice.ai API key (from GitHub Secrets)

### Optional

- `HTTP_URL` - HTTP endpoint (defaults to `https://data.spiceai.io`)
- `FLIGHT_URL` - Flight endpoint (defaults to `flight.spiceai.io:443`)
- `VERCEL_ENDPOINT` - Custom Vercel endpoint for testing
- `VERCEL_AUTOMATION_BYPASS_SECRET` - Vercel bypass token

### Local Runtime Tests

- `SPICE_SECRET_POSTGRES_PASSWORD` - PostgreSQL password (set to `postgres`)
- `PGPASSWORD` - PostgreSQL password for psql commands

## Test Matrix Coverage

### Browser Tests Matrix

- **3 Node.js versions** × **1 OS** = **3 jobs**
- Fast feedback (~1-2 minutes)
- No external dependencies
- Tests browser build validity

### Full Tests Matrix

- **3 Node.js versions** × **2 OSes** = **6 jobs**
- Complete validation (~5-10 minutes)
- Tests Node.js build with gRPC
- Tests against real Spice runtime
- Tests cloud API integration

### Publish Tests Matrix

- **3 Node.js versions** × **2 OSes** = **6 jobs**
- Pre-publish validation
- Ensures package works before release

## Why Separate Browser Tests?

1. **Fast Feedback**: Browser tests run quickly without infrastructure setup
2. **Early Detection**: Catch browser-specific issues immediately
3. **Platform Coverage**: Test on Linux without full runtime overhead
4. **Cost Efficiency**: Lightweight tests use fewer CI minutes
5. **Redundancy**: Also run in full test job for extra safety

## Test Failure Scenarios

### Browser Tests Fail

- Usually indicates:
  - Browser build issues
  - HTTP-only functionality broken
  - TypeScript compilation errors
  - Mock/test setup issues

### Node.js Tests Fail

- Could indicate:
  - gRPC client issues
  - Spice runtime compatibility problems
  - PostgreSQL setup issues
  - Environment-specific bugs

### Cloud Tests Fail

- May indicate:
  - API key issues
  - Cloud API changes
  - Network connectivity problems
  - Vercel endpoint issues

## Adding New Tests

### Browser Tests

Add to `test/browser/`:

```typescript
import { SpiceClient } from '../../src/index.browser';

describe('New Feature', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test('works in browser', async () => {
    // Test implementation
  });
});
```

Will automatically run in both `browser-tests` and `test` jobs.

### Node.js Tests

Add to `test/`:

```typescript
import { SpiceClient } from '../src';

describe('New Feature', () => {
  test('works with gRPC', async () => {
    // Test implementation
  });
});
```

Will run in `test` job only.

## Debugging CI Failures

### View Logs

1. Go to the Actions tab in GitHub
2. Click on the failing workflow run
3. Click on the failing job
4. Expand the failing step

### Common Issues

**Browser tests timeout:**

- Check for missing `await` in async tests
- Verify fake timers are properly configured
- Check mock fetch responses

**Node.js tests connection refused:**

- Spice runtime may not have started
- Check PostgreSQL is running
- Verify network ports are available

**Build failures:**

- Check TypeScript errors
- Verify all dependencies are installed
- Check for platform-specific issues

### Local Reproduction

Run the same commands as CI:

```bash
# Browser tests
npm install
npm run build
npm run test:browser

# Node.js tests (requires Spice runtime)
npm run test:node

# Cloud tests (requires API key)
SPICE_API_KEY=your_key npm run test -- test/cloud.test.ts
```

## Performance

### Expected Durations

| Job           | Matrix Size | Duration  | Total CI Minutes |
| ------------- | ----------- | --------- | ---------------- |
| browser-tests | 3           | ~1-2 min  | ~3-6 min         |
| test          | 6           | ~5-10 min | ~30-60 min       |
| **Total**     | **9**       | -         | **~33-66 min**   |

### Optimization Strategies

1. **Parallel Execution**: All matrix jobs run in parallel
2. **Caching**: Node modules are cached by setup-node action
3. **Fast Browser Tests**: Run first for quick feedback
4. **Conditional Steps**: OS-specific steps only run where needed
5. **Background Processes**: Spice runtime runs in background

## Future Improvements

Potential enhancements:

- [ ] Cache compiled TypeScript output
- [ ] Add Windows to test matrix
- [ ] Split cloud tests into separate job
- [ ] Add performance benchmarks
- [ ] Add code coverage reporting
- [ ] Add integration test for browser bundle size
- [ ] Test with real browsers (Playwright/Puppeteer)

## Related Documentation

- [Browser Tests](./BROWSER_TESTS.md)
- [Test README](../test/README.md)
- [Contributing Guide](../CONTRIBUTING.md)
