# spice.js

Spice.ai client library for Node.JS

See full documentation at [docs.spice.ai](https://docs.spice.ai/sdks/node.js-sdk).

## Installation

`npm install @spiceai/spice` or `yarn add @spiceai/spice`

## Usage

### High-Performance Apache Arrow Flight Query with <https://spice.ai> cloud

```js
import { SpiceClient } from '@spiceai/spice';

const main = async () => {
  const spiceClient = new SpiceClient({
    apiKey: 'API_KEY', // spice.ai api key,
    httpUrl: 'https://data.spiceai.io',
    flightUrl: 'flight.spiceai.io:443',
  });
  const table = await spiceClient.sql('SHOW TABLES;');
  console.table(table.toArray());
};

main();
```

Querying data is done through a `SpiceClient` object that initializes the connection with Spice endpoint. `SpiceClient` has the following arguments:

- `apiKey` (string, optional): API key to authenticate with the endpoint.
- `flightUrl` (string, optional): URL of the Flight endpoint to use (default: `localhost:50051`)
- `httpUrl` (string, optional): URL of the HTTP endpoint to use (default: `http://localhost:8090`)

Read more about the Spice.ai Apache Arrow Flight API at [docs.spice.ai](https://docs.spice.ai/api/sql-query-api/apache-arrow-flight-api).

### Usage with locally running [spice runtime](https://github.com/spiceai/spiceai)

Follow the [quickstart guide](https://docs.spiceai.org/getting-started) to install and run spice locally

```js
import { SpiceClient } from '@spiceai/spice';

const main = async () => {
  // uses connection to local runtime by default
  const spiceClient = new SpiceClient();

  // or use custom connection params:
  // const spiceClient = new SpiceClient({
  //   httpUrl: 'http://my_spice_http_host',
  //   flightUrl: 'my_spice_flight_host',
  // });

  const table = await spiceClient.sql(
    'SELECT trip_distance, total_amount FROM taxi_trips ORDER BY trip_distance DESC LIMIT 10;',
  );
  console.table(table.toArray());
};

main();
```

## Upgrading from v2 to v3

Version 3.0 represents a major evolution of the SDK with cross-platform support, new APIs, and enhanced reliability.

### Quick Start: Code Changes Required

**Minimum Node.js Version: 20+**

```bash
# Check your Node.js version
node --version

# Upgrade if needed (using nvm)
nvm install 20
nvm use 20
```

**If upgrading from v1.x: Update parameter names from snake_case to camelCase**

```typescript
// ❌ v1.x (snake_case)
const client = new SpiceClient({
  api_key: 'your-api-key',
  http_url: 'https://data.spiceai.io',
  flight_url: 'flight.spiceai.io:443',
});

// ✅ v2.x/v3.x (camelCase)
const client = new SpiceClient({
  apiKey: 'your-api-key',
  httpUrl: 'https://data.spiceai.io',
  flightUrl: 'flight.spiceai.io:443',
});
```

**If upgrading from v1.x: Replace removed async query methods**

```typescript
// ❌ v1.x
const response = await client.queryAsync('my-query', sql, webhookUrl);
const results = await client.getQueryResults(response.query_id);

// ✅ v3.x
const table = await client.sql(sql);
// Or for JSON results:
const results = await client.sqlJson(sql);
```

**Package Installation**

```bash
npm install @spiceai/spice@latest
```

### What's New in v3

- ✅ **Browser Support**: Use the SDK directly in web applications with automatic platform detection
- ✅ **Platform-Optimized**: Node.js uses Apache Arrow Flight (gRPC), browsers use HTTP API
- ✅ **New Query Methods**: `sql()`, `sqlJson()`, and `nsql()` for flexible querying
- ✅ **Health Checks**: `isSpiceHealthy()` and `isSpiceReady()` for monitoring
- ✅ **Dataset Refresh**: `refreshAcceleration()` for on-demand dataset updates
- ✅ **HTTP Fallback**: Automatic fallback to HTTP in serverless environments
- ✅ **Proto Auto-Download**: Flight proto file automatically downloaded and cached when missing
- ✅ **TypeScript Strict Mode**: Enhanced type safety throughout the codebase
- ✅ **Updated Dependencies**: Apache Arrow 21.0.0, @grpc/grpc-js 1.14.0, TypeScript 5.7.2

### Breaking Changes (Detailed)

#### 1. Minimum Node.js Version

**v2.x**: Node.js 18+  
**v3.x**: Node.js 20+

```bash
# Check your Node.js version
node --version

# Upgrade if needed
nvm install 20
nvm use 20
```

#### 2. Package Structure (v3.0.2)

The package now includes separate builds for different platforms:

**v2.x**: Single build at `dist/`

```
dist/
  index.js
  client.js
  ...
```

**v3.x**: Platform-specific builds

```
dist/
  node/       # Node.js with gRPC support
  browser/    # Browser with HTTP-only
```

The correct version is automatically loaded via package.json `exports` field. **No code changes needed** unless you were importing from `dist/` directly.

```typescript
// ✅ Recommended (works in v2 and v3)
import { SpiceClient } from '@spiceai/spice';

// ❌ Don't do this (breaks in v3)
import { SpiceClient } from '@spiceai/spice/dist/client';
```

#### 3. Parameter Naming Convention (v2.0.0)

**v1.x**: snake_case parameters

```typescript
const client = new SpiceClient({
  api_key: 'your-api-key',
  http_url: 'https://data.spiceai.io',
  flight_url: 'flight.spiceai.io:443',
});
```

**v2.x/v3.x**: camelCase parameters

```typescript
const client = new SpiceClient({
  apiKey: 'your-api-key', // was: api_key
  httpUrl: 'https://data.spiceai.io', // was: http_url
  flightUrl: 'flight.spiceai.io:443', // was: flight_url
});
```

This applies to all configuration parameters including `apiKey`, `httpUrl`, `flightUrl`, and method options like `refreshAcceleration()`.

#### 4. Constructor Changes (v2.0.0)

**v1.x**: API key only

```typescript
const client = new SpiceClient('your-api-key');
```

**v2.x/v3.x**: Configuration object (API key string still supported for backwards compatibility)

```typescript
// New recommended way
const client = new SpiceClient({
  apiKey: 'your-api-key',
  httpUrl: 'https://data.spiceai.io',
  flightUrl: 'flight.spiceai.io:443',
});

// Still works (backwards compatible)
const client = new SpiceClient('your-api-key');
```

#### 5. Removed Methods (v2.0+)

If you're upgrading from v1.x, these methods were removed in v2.0:

- ❌ `queryAsync()`, `getQueryResults()`, `getQueryResultsAll()`, `getQueryResultsFromNotification()`

**Migration:** Use `sql()` or `sqlJson()` for direct queries instead of the old async query pattern.

### New Features You Can Use

#### 1. Modern Query Methods

```typescript
// Recommended: sql() with Apache Arrow
const table = await client.sql('SELECT * FROM my_table LIMIT 10');
console.table(table.toArray());

// Streaming for large results
await client.sql('SELECT * FROM large_table', (chunk) => {
  console.log('Chunk:', chunk.numRows, 'rows');
});

// JSON results with schema
const result = await client.sqlJson('SELECT name, age FROM users');
console.log(`${result.row_count} rows`, result.data);

// Natural language queries
const result = await client.nsql('Show top 10 customers by revenue');
console.log('Generated SQL:', result.sql);
console.log('Results:', result.data);
```

#### 2. Health Check Methods

```typescript
// Check if Spice runtime is healthy (unauthenticated)
const isHealthy = await client.isSpiceHealthy();

// Check if ready to accept queries (authenticated)
const isReady = await client.isSpiceReady();

// Wait for Spice to be ready before querying
async function waitForSpice(client, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    if (await client.isSpiceReady()) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}
```

#### 3. Dataset Refresh

```typescript
// Basic refresh
await client.refreshAcceleration('my_dataset');

// Advanced with options
await client.refreshAcceleration('my_dataset', {
  refresh_mode: 'append',
  refresh_sql: 'SELECT * FROM source WHERE updated_at > NOW() - INTERVAL 1 DAY',
  refresh_jitter_max: '1s',
});
```

#### 4. Browser Usage

```typescript
// Works in browser environments!
import { SpiceClient } from '@spiceai/spice';

const client = new SpiceClient({
  apiKey: 'your-api-key',
  httpUrl: 'https://data.spiceai.io',
});

const result = await client.sql('SELECT * FROM my_table LIMIT 10');
console.table(result.toArray());
```

### Migration Checklist

**Required:**

- [ ] Verify Node.js version is 20 or higher
- [ ] Update to v3: `npm install @spiceai/spice@latest`
- [ ] Test your application

**Recommended:**

- [ ] Use `sql()` instead of `query()` for better performance
- [ ] Add health checks with `isSpiceHealthy()` and `isSpiceReady()`
- [ ] Try `nsql()` for natural language queries
- [ ] Use `refreshAcceleration()` for on-demand dataset refresh

**If deploying to browsers:**

- [ ] Test the browser build
- [ ] Ensure your bundler supports package.json `exports` field

**If upgrading from v1.x:**

- [ ] Replace `queryAsync()`, `getQueryResults()`, etc. with `sql()` or `sqlJson()`
- [ ] Update `new SpiceClient('api-key')` to config object if needed

### No Changes Required For

If you're using these standard patterns, your code will work without changes:

✅ `SpiceClient` initialization with API key string or config object  
✅ `query()` method (works but `sql()` is recommended)  
✅ Connection retry configuration via `setMaxRetries()`  
✅ Custom headers  
✅ Flight and HTTP URL configuration

### Upgrading

```bash
# Upgrade to v3.x
npm install @spiceai/spice@latest

# Or with yarn
yarn add @spiceai/spice@latest

# Or with pnpm
pnpm add @spiceai/spice@latest
```

### Troubleshooting

**Cannot find module '@spiceai/spice'**

- Ensure Node.js 20+ is installed
- Delete `node_modules` and reinstall: `rm -rf node_modules package-lock.json && npm install`

**Flight proto file not found in serverless environments**

- The SDK now automatically downloads and caches the proto file
- Ensure your deployment allows HTTPS requests to `data.spiceai.io`
- The SDK will automatically fallback to HTTP if gRPC fails

**Import errors in TypeScript**

- Ensure you're importing from `@spiceai/spice`, not internal paths
- Update `tsconfig.json` with `"moduleResolution": "node16"` or `"bundler"`

### Need Help?

- 📖 [Full Documentation](https://docs.spice.ai/sdks/node.js-sdk)
- 💬 [Join our Discord](https://discord.gg/kZnTfneP5u)
- 🐛 [Report Issues](https://github.com/spiceai/spice.js/issues)
- 📝 [View Changelog](https://github.com/spiceai/spice.js/releases)
- 📦 [npm Package](https://www.npmjs.com/package/@spiceai/spice)

## API Methods

### `sql(query: string, onData?: callback)` - Execute SQL queries

The `sql()` method executes SQL queries and returns results as Apache Arrow tables. This is the recommended method for querying data.

```js
// Full result (recommended for most use cases)
const table = await spiceClient.sql('SELECT * FROM my_table LIMIT 10');
console.table(table.toArray());

// Streaming results (for large datasets)
await spiceClient.sql('SELECT * FROM large_table', (chunk) => {
  console.log('Received chunk with', chunk.numRows, 'rows');
  // Process chunk immediately
});
```

#### `sqlJson(query: string)` - Execute SQL queries with JSON results

The `sqlJson()` method executes SQL queries and returns results in a JSON format with schema information.

```js
const result = await spiceClient.sqlJson('SELECT name, age FROM users LIMIT 5');

console.log(`Returned ${result.row_count} rows`);
console.log('Schema:', result.schema);
console.log('Data:', result.data);
console.log(`Query took ${result.execution_time_ms}ms`);

// Access individual rows
result.data.forEach((row) => {
  console.log(`${row.name} is ${row.age} years old`);
});
```

The response includes:

- `row_count`: Number of rows returned
- `schema`: Schema information with field names and types
- `data`: Array of row objects
- `execution_time_ms`: Query execution time in milliseconds

#### `isSpiceHealthy()` - Check Spice runtime health

The `isSpiceHealthy()` method checks if the Spice runtime is healthy. This endpoint is **unauthenticated** and does not require an API key.

```js
const isHealthy = await spiceClient.isSpiceHealthy();
if (isHealthy) {
  console.log('✅ Spice runtime is healthy');
} else {
  console.log('❌ Spice runtime is unhealthy');
}
```

#### `isSpiceReady()` - Check if Spice is ready

The `isSpiceReady()` method checks if the Spice runtime is ready to accept requests. This endpoint is **authenticated** and requires an API key if configured on the Spice runtime.

```js
const isReady = await spiceClient.isSpiceReady();
if (isReady) {
  console.log('✅ Spice is ready to accept queries');
} else {
  console.log('❌ Spice is not ready yet');
}

// Example: Wait for Spice to be ready before querying
async function waitForSpice(maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    if (await spiceClient.isSpiceReady()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

if (await waitForSpice()) {
  const result = await spiceClient.sql('SELECT * FROM my_table');
}
```

#### `refreshAcceleration(dataset: string, options?)` - Trigger dataset refresh

The `refreshAcceleration()` method triggers an on-demand refresh for an accelerated dataset.

```js
// Basic refresh
const result = await spiceClient.refreshAcceleration('my_dataset');
console.log(result.message);

// Refresh with custom options
const result = await spiceClient.refreshAcceleration('my_dataset', {
  refresh_mode: 'full', // 'full', 'append', 'changes', or 'disabled'
  refresh_sql: 'SELECT * FROM source WHERE updated_at > NOW() - INTERVAL 1 DAY',
  refresh_jitter_max: '1s',
});
```

Options:

- `refresh_mode`: Controls how data is refreshed ('full', 'append', 'changes', 'disabled')
- `refresh_sql`: Custom SQL query to use for the refresh
- `refresh_jitter_max`: Maximum jitter time for refresh scheduling

#### `nsql(request)` - Natural language to SQL (NSQL)

The `nsql()` method converts natural language queries into SQL and executes them, returning both the results and the generated SQL.

```js
// Basic natural language query
const result = await spiceClient.nsql(
  'Show me the top 5 customers by total sales',
);

console.log('Generated SQL:', result.sql);
console.log('Results:', result.data);
console.log(`Returned ${result.row_count} rows`);

// Advanced usage with options
const result = await spiceClient.nsql(
  'What are the average trip distances by payment type?',
  {
    datasets: ['taxi_trips'], // Limit to specific datasets
    model: 'nql', // Specify the model (default: 'nql')
    sample_data_enabled: true, // Include sample data in context (default: true)
  },
);

// Access the generated SQL
console.log('AI generated this SQL:', result.sql);

// Process results
result.data.forEach((row) => {
  console.log(row);
});
```

Parameters:

- `query` (required): The natural language query to convert to SQL
- `options` (optional): Configuration object with the following properties:
  - `datasets` (optional): Array of dataset names to sample from, or `null` to use all datasets
  - `model` (optional): Name of the model to use for SQL generation (default: `"nql"`)
  - `sample_data_enabled` (optional): Whether to include sample data in context (default: `true`)

The response includes:

- `row_count`: Number of rows returned
- `schema`: Schema information with field names and types
- `data`: Array of row objects
- `sql`: The SQL query generated by the AI model

#### `query(sql: string, onData?: callback)` - Legacy query method

The `query()` method is the legacy API for executing SQL queries. It's still supported but `sql()` is recommended for new code.

```js
const table = await spiceClient.query('SELECT * FROM my_table');
```

### Connection retry

From [version 1.0.1](https://github.com/spiceai/spice.js/releases/tag/v1.0.1) the `SpiceClient` implements connection retry mechanism (3 attempts by default).
The number of attempts can be configured via `setMaxRetries`:

```js
const spiceClient = new SpiceClient('API_KEY');
spiceClient.setMaxRetries(5); // Setting to 0 will disable retries
```

Retries are performed for connection and system internal errors. It is the SDK user's responsibility to properly
handle other errors, for example RESOURCE_EXHAUSTED (HTTP 429).

### Fallback behavior

The `SpiceClient` automatically handles environments where Apache Arrow Flight gRPC cannot be used (e.g., serverless environments like AWS Lambda, Vercel, Netlify). The fallback strategy is:

1. **Preferred**: Uses Apache Arrow Flight (gRPC) with gzip compression for optimal performance
2. **Automatic**: If the Flight proto file is missing, it's automatically downloaded from `https://data.spiceai.io/v1/proto/flight` and cached
3. **Fallback**: If gRPC cannot be initialized, automatically falls back to the HTTP `/v1/sql` endpoint

Both gRPC and HTTP modes support compression (gzip, deflate) to reduce bandwidth usage. This ensures the SDK works efficiently in any environment without configuration changes. See [docs/http-fallback.md](./docs/http-fallback.md) for more details.

## Documentation

Check out our [API documentation](https://docs.spice.ai/sdks/node.js-sdk) to learn more about how to use the Node.js SDK.

## Running tests locally

Run the tests with `make test`. For more information, see [CONTRIBUTING.md](./CONTRIBUTING.md)
