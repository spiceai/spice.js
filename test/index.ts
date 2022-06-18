import { Client, StreamingQuery } from "../";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("API key required as argument");
    return;
  }
  const api_key = args[0];

  const client = new Client(api_key);
  const streamingResult: StreamingQuery = await client.streaming_query(
    'SELECT number, "timestamp", base_fee_per_gas, base_fee_per_gas / 1e9 AS base_fee_per_gas_gwei FROM eth.blocks limit 2000'
  );

  streamingResult.onData((table: any) => {
    console.table(table.toArray());

    let baseFeeGwei = table.getChild("base_fee_per_gas_gwei");
    console.log("base_fee_per_gas_gwei:", baseFeeGwei?.toJSON());
  });

  streamingResult.onEnd(async () => {
    const tableResult = await client.query(
      'SELECT number, "timestamp", base_fee_per_gas, base_fee_per_gas / 1e9 AS base_fee_per_gas_gwei FROM eth.recent_blocks limit 3'
    );

    console.table(tableResult.toArray());

    let baseFeeGwei = tableResult.getChild("base_fee_per_gas_gwei");
    console.log("base_fee_per_gas_gwei:", baseFeeGwei?.toJSON());
  });
}

main();
