import dotenv from 'dotenv';
import { SpiceClient } from '../';
import 'dotenv/config';
import { Vector } from 'apache-arrow';

describe('cloud', () => {
  const HTTP_DATA_PATH = process.env.HTTP_URL
    ? process.env.HTTP_URL
    : 'https://data.spiceai.io';
  const FLIGHT_PATH = process.env.FLIGHT_URL
    ? process.env.FLIGHT_URL
    : 'flight.spiceai.io:443';

  dotenv.config();
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw 'API_KEY environment variable not set';
  }
  const client = new SpiceClient({
    apiKey,
    httpUrl: HTTP_DATA_PATH,
    flightUrl: FLIGHT_PATH,
  });

  const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

  test('legacy client uses spice.ai cloud ', async () => {
    const client = new SpiceClient(apiKey);

    const tableResult = await client.query(
      'SELECT number, "timestamp", base_fee_per_gas, base_fee_per_gas / 1e9 AS base_fee_per_gas_gwei FROM eth.recent_blocks limit 3'
    );

    expect(tableResult.toArray()).toHaveLength(3);

    let baseFeeGwei = tableResult.getChild('base_fee_per_gas_gwei');
    expect(baseFeeGwei?.length).toEqual(3);
  });

  test('streaming works', async () => {
    let numChunks = 0;
    await client.query(
      'SELECT number, "timestamp", base_fee_per_gas, base_fee_per_gas / 1e9 AS base_fee_per_gas_gwei FROM eth.blocks limit 2000',
      (table) => {
        expect(table.toArray().length).toBeLessThanOrEqual(2000);

        let baseFeeGwei = table.getChild('base_fee_per_gas_gwei');
        expect(baseFeeGwei).toBeTruthy();
        baseFeeGwei = baseFeeGwei as Vector;
        expect(baseFeeGwei.length).toBeLessThanOrEqual(2000);
        numChunks++;
      }
    );
    expect(numChunks).toBeGreaterThanOrEqual(1);
    expect(numChunks).toBeLessThanOrEqual(3);
  }, 10000);

  test('full result works', async () => {
    const tableResult = await client.query(
      'SELECT number, "timestamp", base_fee_per_gas, base_fee_per_gas / 1e9 AS base_fee_per_gas_gwei FROM eth.recent_blocks limit 3'
    );

    expect(tableResult.toArray()).toHaveLength(3);

    let baseFeeGwei = tableResult.getChild('base_fee_per_gas_gwei');
    expect(baseFeeGwei?.length).toEqual(3);
  }, 30000);
});
