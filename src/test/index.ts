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
    'SELECT number, "timestamp", base_fee_per_gas FROM eth.recent_blocks limit 1'
  );
  if (result) {
    console.table(result.toArray());
  }
}

main();
