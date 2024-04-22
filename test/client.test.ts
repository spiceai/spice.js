import dotenv from 'dotenv';
import { SpiceClient } from '../';
import 'dotenv/config';
import { Vector } from 'apache-arrow';
import {
  AsyncQueryResponse,
  QueryCompleteNotification,
} from '../src/interfaces';
import { webHookAction } from './webHookAction';

const RELAY_URL = process.env.RELAY_URL;
if (!RELAY_URL) {
  throw 'RELAY_URL environment variable not set';
}

const HTTP_DATA_PATH = process.env.HTTP_URL
  ? process.env.HTTP_URL
  : 'https://data.spiceai.io';
const FLIGHT_PATH = process.env.FLIGHT_URL
  ? process.env.FLIGHT_URL
  : 'flight.spiceai.io:443';

dotenv.config();
const api_key = process.env.API_KEY;
if (!api_key) {
  throw 'API_KEY environment variable not set';
}
const client = new SpiceClient(api_key, HTTP_DATA_PATH);
beforeAll(async () => {
  let p1 = client.queryAsync(
    'recent_eth_blocks',
    'SELECT number, "timestamp", base_fee_per_gas, base_fee_per_gas / 1e9 AS base_fee_per_gas_gwei FROM eth.recent_blocks limit 3',
    RELAY_URL
  );
  let p2 = client.queryAsync(
    'recent_eth_transactions_paged',
    `SELECT block_number, transaction_index, "value" FROM eth.recent_transactions limit 1250`,
    RELAY_URL
  );
  await p1;
  await p2;
}, 30000);

const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

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

test('async query first page works', async () => {
  const queryName = 'recent_eth_blocks';
  const queryText =
    'SELECT number, "timestamp", base_fee_per_gas, base_fee_per_gas / 1e9 AS base_fee_per_gas_gwei FROM eth.recent_blocks limit 3';

  let body = await webHookAction(async () => {
    let queryResp: AsyncQueryResponse = await client.queryAsync(
      queryName,
      queryText,
      RELAY_URL
    );

    expect(queryResp).toBeTruthy();
    expect(queryResp.queryId).toHaveLength(36);
  });

  const notification = JSON.parse(body) as QueryCompleteNotification;
  if (notification.sql !== queryText) return;

  // TODO: change appID to correspond your API key when testing locally
  expect(notification.appId).toEqual(239); // spicehq/spicejs

  expect(notification.queryId).toHaveLength(36);
  expect(notification.requestTime).toBeTruthy();
  expect(notification.completionTime).toBeTruthy();
  expect(notification.state).toEqual('completed');
  expect(notification.sql).toEqual(queryText);
  expect(notification.rowCount).toEqual(3);

  const results = await client.getQueryResultsFromNotification(body);

  expect(results.rowCount).toEqual(3);
  expect(results.schema).toHaveLength(4);
  expect(results.schema[0].name).toEqual('number');
  expect(results.schema[0].type).toEqual({ name: 'BIGINT' });
  expect(results.schema[1].name).toEqual('timestamp');
  expect(results.schema[1].type).toEqual({ name: 'BIGINT' });
  expect(results.schema[2].name).toEqual('base_fee_per_gas');
  expect(results.schema[2].type).toEqual({ name: 'BIGINT' });
  expect(results.schema[3].name).toEqual('base_fee_per_gas_gwei');
  expect(results.schema[3].type).toEqual({ name: 'DOUBLE' });

  expect(results.rows).toHaveLength(3);
}, 60000);

test('async query all pages works', async () => {
  const rowLimit = 1250;
  const queryName = 'recent_eth_transactions_paged';
  const queryText = `SELECT block_number, transaction_index, "value" FROM eth.recent_transactions limit ${rowLimit}`;

  let body = await webHookAction(async () => {
    let queryResp: AsyncQueryResponse = await client.queryAsync(
      queryName,
      queryText,
      RELAY_URL
    );

    expect(queryResp).toBeTruthy();
    expect(queryResp.queryId).toHaveLength(36);
  });

  const notification = JSON.parse(body) as QueryCompleteNotification;
  if (notification.sql !== queryText) return;

  // TODO: change appID to correspond your API key when testing locally
  expect(notification.appId).toEqual(239); // spicehq/spicejs
  expect(notification.queryId).toHaveLength(36);
  expect(notification.state).toEqual('completed');
  expect(notification.rowCount).toEqual(rowLimit);

  const results = await client.getQueryResultsFromNotification(body);

  expect(results.rowCount).toEqual(rowLimit);
  expect(results.rows).toHaveLength(rowLimit);
}, 60000);
