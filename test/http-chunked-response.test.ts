/**
 * Regression test: sql() over HTTP against a chunked /v1/sql response.
 *
 * node-fetch 2.x raised false ERR_STREAM_PREMATURE_CLOSE errors on chunked,
 * keep-alive responses (node-fetch#1767, #1576). The Node adapter now uses the
 * built-in fetch and must not load node-fetch when global fetch exists.
 *
 * Undici's default 300s headersTimeout/bodyTimeout is disabled via an Agent
 * dispatcher so long-running queries keep the prior no-implicit-timeout
 * semantics (cancellation remains caller AbortSignal only).
 */
import * as http from 'http';
import { AddressInfo } from 'net';
import { Agent } from 'undici';

jest.mock('node-fetch', () => {
  throw new Error('node-fetch must not be loaded when global fetch exists');
});

import { SpiceClient } from '../src/index.node';
import {
  getNodeFetchDispatcher,
  NODE_FETCH_DISPATCHER_OPTIONS,
  platform,
} from '../src/platform/node';

describe('sql() over HTTP with chunked responses', () => {
  let server: http.Server;
  let url: string;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const n = Number(/SELECT (\d+)/.exec(body)?.[1] ?? 0);
        res.writeHead(200, { 'content-type': 'application/json' }); // no content-length => chunked
        res.write('[{"x":');
        setImmediate(() => {
          res.write(String(n));
          setImmediate(() => res.end('}]'));
        });
      });
    });
    server.keepAliveTimeout = 5000;
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  });

  it('completes 200 back-to-back sql() calls with no errors', async () => {
    const client = new SpiceClient({ httpUrl: url, httpOnly: true, logging: false });
    client.setMaxRetries(0);
    for (let i = 0; i < 200; i++) {
      const table = await client.sql(`SELECT ${i} AS x`);
      expect(table.numRows).toBe(1);
      expect(Number(table.getChild('x')?.get(0))).toBe(i);
    }
  });
});

describe('Node fetch Undici dispatcher timeouts', () => {
  it('disables undici headersTimeout and bodyTimeout (no implicit 300s limit)', () => {
    expect(NODE_FETCH_DISPATCHER_OPTIONS.headersTimeout).toBe(0);
    expect(NODE_FETCH_DISPATCHER_OPTIONS.bodyTimeout).toBe(0);
    expect(getNodeFetchDispatcher()).toBeInstanceOf(Agent);
  });

  it('passes the no-timeout dispatcher to global fetch', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => null },
      text: async () => '',
      json: async () => ({}),
    } as unknown as Response);

    try {
      await platform.fetch('http://127.0.0.1:1/', {
        method: 'GET',
        headers: {},
      });
      expect(fetchSpy).toHaveBeenCalled();
      const init = fetchSpy.mock.calls[0][1] as RequestInit & {
        dispatcher?: Agent;
      };
      expect(init.dispatcher).toBe(getNodeFetchDispatcher());
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('completes sql() when response headers are delayed beyond a short undici headersTimeout', async () => {
    // Prove the default 300s undici limit is not in effect: a 500ms headersTimeout
    // Agent fails on a 2s delayed-headers response (undici fast timers need >~500ms
    // headroom), while the SDK (timeouts disabled) succeeds on the same delay.
    const delayMs = 2000;
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        setTimeout(() => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('[{"x":1}]');
        }, delayMs);
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    try {
      const shortTimeoutAgent = new Agent({
        headersTimeout: 500,
        bodyTimeout: 500,
      });
      await expect(
        fetch(url, {
          method: 'POST',
          body: 'SELECT 1',
          dispatcher: shortTimeoutAgent,
        } as RequestInit),
      ).rejects.toThrow(/Headers Timeout|UND_ERR_HEADERS_TIMEOUT|fetch failed/i);
      await shortTimeoutAgent.close();

      const client = new SpiceClient({
        httpUrl: url,
        httpOnly: true,
        logging: false,
      });
      client.setMaxRetries(0);
      const table = await client.sql('SELECT 1 AS x');
      expect(table.numRows).toBe(1);
      expect(Number(table.getChild('x')?.get(0))).toBe(1);
    } finally {
      server.closeAllConnections?.();
      await new Promise((r) => server.close(r));
    }
  });
});
