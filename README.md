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

### Configuring retry policy

SDK performs 3 retry attempts when using Apache Arrow Flight API. This could be configured as 
```
const spiceClient = new SpiceClient('API_KEY');
spiceClient.setMaxRetries(5); // Setting to 0 will disable retries
```

## Documentation

Check out our [API documentation](https://docs.spice.ai/sdks/node.js-sdk) to learn more about how to use the Node.js SDK.

## Running tests locally

To run the tests (`yarn test`):
1. Create [WebhookRelay](https://webhookrelay.com/) account (Free)
2. [Create Access Token](https://my.webhookrelay.com/tokens) => save **key** and **secret** as `RELAY_KEY` and `RELAY_SECRET`
3. Create [New Empty Bucket](https://my.webhookrelay.com/buckets) called `spice.js` => save **Default public endpoint** value as `RELAY_URL` 

Pass `RELAY_KEY`, `RELAY_SECRET`, `RELAY_URL` as parameters when running the tests, for example via **.env** config file.
```
API_KEY=<Your API_KEY>
RELAY_KEY=<Your RELAY_KEY from Step 2 above>
RELAY_SECRET=<Your RELAY_SECRET from Step 2 above>
RELAY_URL=<Your RELAY_URL from Step 3 above>
```