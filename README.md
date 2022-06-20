# spice.js

Spice.xyz client library for Node.JS

## Installation

`npm install @spiceai/spice` or `yarn add @spiceai/spice`

## Usage

### Arrow Query

```js
import { SpiceClient } from "@spiceai/spice";

const main = async () => {
  const spiceClient = new SpiceClient("API_KEY");
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

## Documentation

Check out our [API documentation](https://docs.spice.xyz/sdks/node.js-sdk) to learn more about how to use the Node.js SDK.
