import { WebSocket } from 'ws';
import { SpiceClient } from '../';
import 'dotenv/config';
import { Vector } from 'apache-arrow';
import listenForWebhookMessage from './ws';
import {
  AsyncQueryResponse,
  QueryCompleteNotification,
} from '../src/interfaces';

const api_key = process.env.API_KEY;
if (!api_key) {
  throw 'API_KEY environment variable not set';
}
const client = new SpiceClient(api_key);

jest.setTimeout(15000);

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

test.only('async query works', async () => {
  const queryName = 'recent_eth_blocks';
  const queryText =
    'SELECT number, "timestamp", base_fee_per_gas, base_fee_per_gas / 1e9 AS base_fee_per_gas_gwei FROM eth.recent_blocks limit 3';

  let queryResp: AsyncQueryResponse;
  let ws: WebSocket;

  const webhook = new Promise<void>((resolve) => {
    ws = listenForWebhookMessage([], (body: string) => {
      const notification = JSON.parse(body) as QueryCompleteNotification;

      expect(notification.appId).toEqual(102);
      expect(notification.queryId).toHaveLength(36);
      expect(notification.requestTime).toBeTruthy();
      expect(notification.completionTime).toBeTruthy();
      expect(notification.state).toEqual('completed');
      expect(notification.sql).toEqual(queryText);
      expect(notification.rowCount).toEqual(3);

      ws.close();
      resolve();
    });
  });

  queryResp = await client.queryAsync(
    queryName,
    queryText,
    'https://o4skc7qyx7mrl8x7wdtgmc.hooks.webhookrelay.com'
  );

  expect(queryResp).toBeTruthy();
  expect(queryResp.queryId).toHaveLength(36);

  await webhook;
});
