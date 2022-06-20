# spice-js

Spice.xyz client library for Node.JS

## Installation

From GitHub Packages:

- Set NPM/Yarn to get the package from GitHub, use a PAT for the password: `npm login --scope=@spicehq --registry=https://npm.pkg.github.com`

```bash
yarn add @spicehq/spice-js
```

## Usage

### Arrow Query

```js
import { Client } from "@spicehq/spice-js";

const main = async () => {
  const client = new Client("API_KEY");
  const table = await client.query("SELECT * FROM eth.recent_blocks LIMIT 10;");
  console.table(table.toArray());
};

main();
```

Querying data is done through a `Client` object that initializes the connection with Spice endpoint. `Client` has the following arguments:

- `apiKey` (string, required): API key to authenticate with the endpoint.
- `url` (string, optional): URL of the endpoint to use (default: flight.spiceai.io:443)
