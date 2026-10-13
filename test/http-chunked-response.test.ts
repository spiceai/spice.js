/**
 * Regression test: sql() over HTTP against a chunked /v1/sql response.
 *
 * node-fetch 2.x raised false ERR_STREAM_PREMATURE_CLOSE errors on chunked,
 * keep-alive responses (node-fetch#1767, #1576). The Node adapter now uses the
 * built-in fetch and must not load node-fetch when global fetch exists.
 */
import * as http from 'http';
import { AddressInfo } from 'net';

jest.mock('node-fetch', () => {
  throw new Error('node-fetch must not be loaded when global fetch exists');
});

import { SpiceClient } from '../src/index.node';

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
