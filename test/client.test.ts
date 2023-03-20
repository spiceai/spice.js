import dotenv from 'dotenv';
import { WebSocket } from 'ws';
import { SpiceClient } from '../';
import 'dotenv/config';
import { Vector } from 'apache-arrow';
import listenForWebhookMessage from './ws';
import {
  AsyncQueryResponse,
  QueryCompleteNotification,
} from '../src/interfaces';
import { LatestPrice } from '../dist/interfaces';

const RELAY_BUCKETS = ['spice.js'];
const RELAY_URL = 'https://o4skc7qyx7mrl8x7wdtgmc.hooks.webhookrelay.com';

dotenv.config();
const api_key = process.env.API_KEY;
if (!api_key) {
  throw 'API_KEY environment variable not set';
}
const client = new SpiceClient(api_key);

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
});

test('full result works', async () => {
  const tableResult = await client.query(
    'SELECT number, "timestamp", base_fee_per_gas, base_fee_per_gas / 1e9 AS base_fee_per_gas_gwei FROM eth.recent_blocks limit 3'
  );

  expect(tableResult.toArray()).toHaveLength(3);

  let baseFeeGwei = tableResult.getChild('base_fee_per_gas_gwei');
  expect(baseFeeGwei?.length).toEqual(3);
});

test('async query first page works', async () => {
  const queryName = 'recent_eth_blocks';
  const queryText =
    'SELECT number, "timestamp", base_fee_per_gas, base_fee_per_gas / 1e9 AS base_fee_per_gas_gwei FROM eth.recent_blocks limit 3';

  let queryResp: AsyncQueryResponse;
  let ws: WebSocket;

  const webhook = new Promise<void>((resolve) => {
    ws = listenForWebhookMessage(RELAY_BUCKETS, async (body: string) => {
      ws.close();
      await wait(500);

      const notification = JSON.parse(body) as QueryCompleteNotification;
      if (notification.sql !== queryText) return;

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

      resolve();
    });
  });

  queryResp = await client.queryAsync(queryName, queryText, RELAY_URL);

  expect(queryResp).toBeTruthy();
  expect(queryResp.queryId).toHaveLength(36);

  await webhook;
}, 30000);

test('async query all pages works', async () => {
  const rowLimit = 1250;
  const queryName = 'recent_eth_transactions_paged';
  const queryText = `SELECT block_number, transaction_index, "value" FROM eth.recent_transactions limit ${rowLimit}`;

  let queryResp: AsyncQueryResponse;
  let ws: WebSocket;

  const webhook = new Promise<void>((resolve) => {
    ws = listenForWebhookMessage(RELAY_BUCKETS, async (body: string) => {
      ws.close();
      await wait(500);

      const notification = JSON.parse(body) as QueryCompleteNotification;
      if (notification.sql !== queryText) return;

      expect(notification.appId).toEqual(239); // spicehq/spicejs
      expect(notification.queryId).toHaveLength(36);
      expect(notification.state).toEqual('completed');
      expect(notification.rowCount).toEqual(rowLimit);

      const results = await client.getQueryResultsFromNotification(body);

      expect(results.rowCount).toEqual(rowLimit);
      expect(results.rows).toHaveLength(rowLimit);

      resolve();
    });
  });

  queryResp = await client.queryAsync(queryName, queryText, RELAY_URL);

  expect(queryResp).toBeTruthy();
  expect(queryResp.queryId).toHaveLength(36);

  await webhook;
}, 30000);

test('test latest prices (USD) works', async () => {
  const price = await client.getPrice('BTC');
  const latestPrice = price as LatestPrice;

  expect(latestPrice).toBeTruthy();
  expect(latestPrice.pair).toEqual('BTC-USD');
  expect(latestPrice.minPrice).toBeTruthy();
  expect(latestPrice.maxPrice).toBeTruthy();
  expect(latestPrice.avePrice).toBeTruthy();
});

test('test latest prices (other currency) works', async () => {
  const price = await client.getPrice('BTC-AUD');
  const latestPrice = price as LatestPrice;

  expect(latestPrice).toBeTruthy();
  expect(latestPrice.pair).toEqual('BTC-AUD');
  expect(latestPrice.minPrice).toBeTruthy();
  expect(latestPrice.maxPrice).toBeTruthy();
  expect(latestPrice.avePrice).toBeTruthy();
});

test('test historical prices works', async () => {
  const prices = await client.getPrices(
    'BTC-USD',
    new Date('2023-01-01').getTime() / 1000,
    new Date('2023-01-02').getTime() / 1000,
    '1h'
  );

  expect(prices).toBeTruthy();
  expect(prices.pair).toEqual('BTC-USD');
  expect(prices.prices.length).toEqual(24);
  expect(prices.prices[0].timestamp).toEqual('2023-01-01T00:00:00Z');
  expect(prices.prices[0].price).toEqual(16539.396678151857);
  expect(prices.prices[23].timestamp).toEqual('2023-01-01T23:59:00Z');
  expect(prices.prices[23].price).toEqual(16625.08055070908);
});
