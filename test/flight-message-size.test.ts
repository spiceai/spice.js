/**
 * Regression test: the runtime sends each record batch as one Flight message, so a
 * batch of wide rows (nested columns, long strings) can be several MiB. grpc-js
 * rejects any message over its default 4 MiB receive limit, so `sql()` failed with
 * `RESOURCE_EXHAUSTED: Received message larger than max`.
 */
import * as path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import {
  Int64,
  makeVector,
  Table,
  tableToIPC,
  Utf8,
  vectorFromArray,
} from 'apache-arrow';
import { SpiceClient } from '../src/index.node';
import {
  MAX_RECEIVE_MESSAGE_LENGTH,
  splitArrowIpcStream,
} from '../src/grpc/client.node';

const PROTO = path.join(__dirname, '..', 'proto', 'Flight.proto');
const ROWS = 25_000;

describe('Flight message size limit', () => {
  let server: grpc.Server;
  let port: number;

  beforeAll(async () => {
    // One record batch of about 6 MiB, sent as a single Flight message the way an
    // unsplit runtime sends a wide accelerated batch.
    const table = new Table({
      id: makeVector(BigInt64Array.from({ length: ROWS }, (_, i) => BigInt(i))),
      payload: vectorFromArray(
        Array.from({ length: ROWS }, () => 'x'.repeat(240)),
        new Utf8(),
      ),
    });
    expect(table.batches).toHaveLength(1);
    expect(table.schema.fields[0].type).toBeInstanceOf(Int64);
    const messages = splitArrowIpcStream(tableToIPC(table, 'stream'));

    const def = protoLoader.loadSync(PROTO, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const pkg: any = grpc.loadPackageDefinition(def);
    const svc = pkg.arrow.flight.protocol.FlightService.service;
    server = new grpc.Server();
    const unimplemented = (call: any, cb?: any) => {
      const err = {
        code: grpc.status.UNIMPLEMENTED,
        details: 'not in this test',
      };
      if (cb) cb(err);
      else call.emit('error', err);
    };
    const impl: Record<string, any> = {};
    for (const name of Object.keys(svc)) impl[name] = unimplemented;
    impl.GetFlightInfo = (_call: any, cb: any) =>
      cb(null, { endpoint: [{ ticket: { ticket: Buffer.from('wide') } }] });
    impl.DoGet = (call: any) => {
      for (const m of messages) {
        call.write({ dataHeader: m.header, dataBody: m.body });
      }
      call.end();
    };
    server.addService(svc, impl);
    port = await new Promise<number>((resolve, reject) =>
      server.bindAsync(
        '127.0.0.1:0',
        grpc.ServerCredentials.createInsecure(),
        (err, p) => (err ? reject(err) : resolve(p)),
      ),
    );
  });

  afterAll(() => {
    server.forceShutdown();
  });

  it('defaults to the runtime’s 100 MiB limit', () => {
    expect(MAX_RECEIVE_MESSAGE_LENGTH).toBe(100 * 1024 * 1024);
  });

  it('reads a record batch larger than 4 MiB', async () => {
    const client = new SpiceClient({
      flightUrl: `127.0.0.1:${port}`,
      httpUrl: 'http://127.0.0.1:1',
      flightOnly: true,
      logging: false,
    });
    const table = await client.sql('SELECT * FROM wide');
    expect(table.numRows).toBe(ROWS);
    expect(table.getChild('payload')?.get(ROWS - 1)).toBe('x'.repeat(240));
  });
});
