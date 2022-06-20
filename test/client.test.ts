import { SpiceClient } from "../";
import "dotenv/config";
import { Vector } from "apache-arrow";

const api_key = process.env.API_KEY;
if (!api_key) {
  throw "API_KEY environment variable not set";
}
const client = new SpiceClient(api_key);

test("streaming works", async () => {
  let numChunks = 0;
  await client.query(
    'SELECT number, "timestamp", base_fee_per_gas, base_fee_per_gas / 1e9 AS base_fee_per_gas_gwei FROM eth.blocks limit 2000',
    (table) => {
      expect(table.toArray().length).toBeLessThan(2000);

      let baseFeeGwei = table.getChild("base_fee_per_gas_gwei");
      expect(baseFeeGwei).toBeTruthy();
      baseFeeGwei = baseFeeGwei as Vector;
      expect(baseFeeGwei.length).toBeLessThan(2000);
      numChunks++;
    }
  );
  expect(numChunks).toEqual(2);
});

test("full result works", async () => {
  const tableResult = await client.query(
    'SELECT number, "timestamp", base_fee_per_gas, base_fee_per_gas / 1e9 AS base_fee_per_gas_gwei FROM eth.recent_blocks limit 3'
  );

  expect(tableResult.toArray()).toHaveLength(3);

  let baseFeeGwei = tableResult.getChild("base_fee_per_gas_gwei");
  expect(baseFeeGwei?.length).toEqual(3);
});
