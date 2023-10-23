# spice.js

Spice.ai client library for Node.JS

See full documentation at [docs.spice.ai](https://docs.spice.ai/sdks/node.js-sdk).

## Installation

`npm install @spiceai/spice` or `yarn add @spiceai/spice`

## Usage

### High-Performance Apache Arrow Flight Query

```js
import { SpiceClient } from '@spiceai/spice';

const main = async () => {
  const spiceClient = new SpiceClient('API_KEY');
  const table = await spiceClient.query(
    'SELECT number, "timestamp", gas_used FROM eth.recent_blocks LIMIT 10'
  );
  console.table(table.toArray());
};

main();
```

Querying data is done through a `SpiceClient` object that initializes the connection with Spice endpoint. `SpiceClient` has the following arguments:

- `apiKey` (string, required): API key to authenticate with the endpoint.
- `url` (string, optional): URL of the endpoint to use (default: flight.spiceai.io:443)

Read more about the Spice.ai Apache Arrow Flight API at [docs.spice.ai](https://docs.spice.ai/api/sql-query-api/apache-arrow-flight-api).

### Async Query

```js
import { SpiceClient } from '@spiceai/spice';
const main = async () => {
  const spiceClient = new SpiceClient('API_KEY');
  const queryResp = await client.queryAsync(
    'recent_blocks',
    'SELECT number, "timestamp", gas_used FROM eth.recent_blocks LIMIT 10',
    'https://o4skc7qyx7mrl8x7wdtgmc.hooks.webhookrelay.com'
  ).catch((reason) => {
    console.error('Query failed.', reason)    
  });

  if !queryResp {
    return;
  }

  // Webhook trigger with body
  const queryResults = await client.getResultsFromQueryCompleteNotification(
    body
  );

  console.log(queryResults);
};

main();
```

Read more about the Spice.ai Async HTTP API at [docs.spice.ai](https://docs.spice.ai/api/sql-query-api/http-api-1).

## Documentation

Check out our [API documentation](https://docs.spice.ai/sdks/node.js-sdk) to learn more about how to use the Node.js SDK.
