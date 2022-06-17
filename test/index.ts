import { Client } from "../";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("API key required as argument");
    return;
  }
  const api_key = args[0];

  const client = new Client(api_key);
  const result = await client.query(
    'SELECT number, "timestamp", base_fee_per_gas, base_fee_per_gas / 1e9 AS base_fee_per_gas_gwei FROM eth.recent_blocks limit 5'
  );
  console.table(result.toArray());

  let baseFeeGwei = result.getChild("base_fee_per_gas_gwei");
  console.log("base_fee_per_gas_gwei:", baseFeeGwei?.toJSON());
}

main();
