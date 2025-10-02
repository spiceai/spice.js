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
  const table = await spiceClient.query('SHOW TABLES;');
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

  const table = await spiceClient.query(
    'SELECT trip_distance, total_amount FROM taxi_trips ORDER BY trip_distance DESC LIMIT 10;',
  );
  console.table(table.toArray());
};

main();
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

Both gRPC and HTTP modes support compression (zstd, br, gzip, deflate) to reduce bandwidth usage. This ensures the SDK works efficiently in any environment without configuration changes. See [docs/http-fallback.md](./docs/http-fallback.md) for more details.

## Documentation

Check out our [API documentation](https://docs.spice.ai/sdks/node.js-sdk) to learn more about how to use the Node.js SDK.

## Running tests locally

Run the tests with `make test`. For more information, see [CONTRIBUTING.md](./CONTRIBUTING.md)
