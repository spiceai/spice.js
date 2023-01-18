import { WebSocket } from 'ws';
import { SpiceClient } from '../';
import 'dotenv/config';
import { Vector } from 'apache-arrow';
import listenForWebhookMessage from './ws';
import {
  AsyncQueryResponse,
  QueryCompleteNotification,
} from '../src/interfaces';

const RELAY_BUCKETS = ['spice.js'];
const RELAY_URL = 'https://o4skc7qyx7mrl8x7wdtgmc.hooks.webhookrelay.com';

const api_key = process.env.API_KEY;
if (!api_key) {
  throw 'API_KEY environment variable not set';
}
const client = new SpiceClient(api_key);

test('streaming works', async () => {
  let numChunks = 0;
  await client.query(
    'SELECT number, "timestamp", base_fee_per_gas, base_fee_per_gas / 1e9 AS base_fee_per_gas_gwei FROM eth.blocks limit 2000',
    (table) => {
      expect(table.toArray().length).toBeLessThan(2000);

      let baseFeeGwei = table.getChild('base_fee_per_gas_gwei');
      expect(baseFeeGwei).toBeTruthy();
      baseFeeGwei = baseFeeGwei as Vector;
      expect(baseFeeGwei.length).toBeLessThan(2000);
      numChunks++;
    }
  );
  expect(numChunks).toEqual(2);
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
      const notification = JSON.parse(body) as QueryCompleteNotification;
      if (notification.sql !== queryText) return;

      expect(notification.appId).toEqual(49);
      expect(notification.queryId).toHaveLength(36);
      expect(notification.requestTime).toBeTruthy();
      expect(notification.completionTime).toBeTruthy();
      expect(notification.state).toEqual('completed');
      expect(notification.sql).toEqual(queryText);
      expect(notification.rowCount).toEqual(3);

      ws.close();

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
});

test('async query all pages works', async () => {
  const rowLimit = 1250;
  const queryName = 'recent_eth_transactions_paged';
  const queryText = `SELECT block_number, transaction_index, "value" FROM eth.recent_transactions limit ${rowLimit}`;

  let queryResp: AsyncQueryResponse;
  let ws: WebSocket;

  const webhook = new Promise<void>((resolve) => {
    ws = listenForWebhookMessage(RELAY_BUCKETS, async (body: string) => {
      const notification = JSON.parse(body) as QueryCompleteNotification;
      if (notification.sql !== queryText) return;
      ws.close();

      expect(notification.appId).toEqual(49);
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
});
