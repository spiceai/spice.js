/**
 * Regression test: grpc-js advertises HTTP/2's 65,535-byte initial flow-control
 * window unless told otherwise, so a Flight server can have only 64 KiB in flight
 * per round trip. Over a WAN link that capped a streamed result at about
 * window / RTT, and a 1.5M-row query from Spice Cloud took minutes instead of
 * seconds. The client now opens every Flight channel, TLS and plaintext, with a
 * 16 MiB window.
 *
 * The throughput cases stream about 4 MiB through a local TCP proxy that delays
 * every chunk by 20 ms each way (a 40 ms RTT). With a 64 KiB window that needs
 * about 64 round trips; with 16 MiB it needs a handful.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import {
  makeVector,
  Table,
  tableToIPC,
  Utf8,
  vectorFromArray,
} from 'apache-arrow';
import { SpiceClient } from '../src/index.node';
import {
  DEFAULT_FLOW_CONTROL_WINDOW,
  GrpcFlightClient,
  MAX_RECEIVE_MESSAGE_LENGTH,
  buildFlightChannelOptions,
  splitArrowIpcStream,
} from '../src/grpc/client.node';

const PROTO = path.join(__dirname, '..', 'proto', 'Flight.proto');
const ONE_WAY_DELAY_MS = 20;
const ROWS_PER_BATCH = 2_000;
const BATCHES = 8; // 8 x ~512 KiB = ~4 MiB
const PAYLOAD = 'x'.repeat(256);

function openssl(args: string[], cwd: string) {
  execFileSync('openssl', args, { cwd, stdio: 'ignore' });
}

/** A self-signed server certificate for localhost, generated at test time. */
function makeServerCert(dir: string) {
  fs.writeFileSync(
    path.join(dir, 'server.ext'),
    'subjectAltName=DNS:localhost,IP:127.0.0.1\n',
  );
  openssl(
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      'server.key',
      '-out',
      'server.pem',
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1',
    ],
    dir,
  );
}

/** A TCP proxy that delays every chunk in both directions. */
function delayProxy(targetPort: number): Promise<net.Server> {
  const server = net.createServer((client) => {
    const upstream = net.connect(targetPort, '127.0.0.1');
    const pipe = (from: net.Socket, to: net.Socket) => {
      from.on('data', (chunk) =>
        setTimeout(() => to.destroyed || to.write(chunk), ONE_WAY_DELAY_MS),
      );
      from.on('end', () => setTimeout(() => to.end(), ONE_WAY_DELAY_MS));
      from.on('error', () => to.destroy());
    };
    pipe(client, upstream);
    pipe(upstream, client);
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve(server)),
  );
}

function port(server: net.Server): number {
  return (server.address() as net.AddressInfo).port;
}

describe('Flight channel flow-control window', () => {
  describe('channel options', () => {
    it('defaults to a 16 MiB window and the 100 MiB message limit', () => {
      expect(DEFAULT_FLOW_CONTROL_WINDOW).toBe(16 * 1024 * 1024);
      expect(buildFlightChannelOptions()).toEqual({
        'grpc.max_receive_message_length': MAX_RECEIVE_MESSAGE_LENGTH,
        'grpc-node.flow_control_window': DEFAULT_FLOW_CONTROL_WINDOW,
      });
    });

    it('applies flowControlWindow, then channelOptions over the defaults', () => {
      expect(
        buildFlightChannelOptions({
          flowControlWindow: 4 * 1024 * 1024,
          channelOptions: {
            'grpc.keepalive_time_ms': 30_000,
            'grpc.max_receive_message_length': 8 * 1024 * 1024,
          },
        }),
      ).toEqual({
        'grpc.max_receive_message_length': 8 * 1024 * 1024,
        'grpc-node.flow_control_window': 4 * 1024 * 1024,
        'grpc.keepalive_time_ms': 30_000,
      });
    });

    it.each([0, 1024, 1.5, 2 ** 31, NaN])(
      'rejects flightFlowControlWindow %p',
      (flightFlowControlWindow) => {
        expect(
          () =>
            new SpiceClient({
              flightUrl: '127.0.0.1:1',
              httpUrl: 'http://127.0.0.1:1',
              logging: false,
              flightFlowControlWindow,
            }),
        ).toThrow(/flightFlowControlWindow must be an integer/);
      },
    );

    it.each([true, false])(
      'passes the options to the grpc channel (TLS %p)',
      (flightTlsEnabled) => {
        const client = new SpiceClient({
          flightUrl: 'localhost:1',
          httpUrl: 'http://127.0.0.1:1',
          flightTlsEnabled,
          logging: false,
          flightFlowControlWindow: 1024 * 1024,
          flightChannelOptions: { 'grpc.keepalive_time_ms': 30_000 },
        });
        const grpcClient = (client as any)._grpcClient as GrpcFlightClient;
        expect(grpcClient.getChannelOptions()).toMatchObject({
          'grpc-node.flow_control_window': 1024 * 1024,
          'grpc.keepalive_time_ms': 30_000,
        });
      },
    );
  });

  describe('throughput over a 40 ms RTT link', () => {
    let dir: string;
    let plainServer: grpc.Server;
    let tlsServer: grpc.Server;
    let plainProxy: net.Server;
    let tlsProxy: net.Server;

    beforeAll(async () => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spicejs-flowwin-'));
      makeServerCert(dir);

      const table = new Table({
        id: makeVector(
          Int32Array.from({ length: ROWS_PER_BATCH }, (_, i) => i),
        ),
        payload: vectorFromArray(
          Array.from({ length: ROWS_PER_BATCH }, () => PAYLOAD),
          new Utf8(),
        ),
      });
      const [schema, batch] = splitArrowIpcStream(tableToIPC(table, 'stream'));

      const def = protoLoader.loadSync(PROTO, {
        keepCase: false,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });
      const pkg: any = grpc.loadPackageDefinition(def);
      const svc = pkg.arrow.flight.protocol.FlightService.service;
      const impl: Record<string, any> = {};
      for (const name of Object.keys(svc)) {
        impl[name] = (call: any, cb?: any) => {
          const err = {
            code: grpc.status.UNIMPLEMENTED,
            details: 'not in this test',
          };
          if (cb) cb(err);
          else call.emit('error', err);
        };
      }
      impl.GetFlightInfo = (_call: any, cb: any) =>
        cb(null, { endpoint: [{ ticket: { ticket: Buffer.from('wide') } }] });
      impl.DoGet = (call: any) => {
        call.write({ dataHeader: schema.header, dataBody: schema.body });
        for (let i = 0; i < BATCHES; i++) {
          call.write({ dataHeader: batch.header, dataBody: batch.body });
        }
        call.end();
      };

      const bind = (server: grpc.Server, creds: grpc.ServerCredentials) =>
        new Promise<number>((resolve, reject) =>
          server.bindAsync('127.0.0.1:0', creds, (err, p) =>
            err ? reject(err) : resolve(p),
          ),
        );
      plainServer = new grpc.Server();
      plainServer.addService(svc, impl);
      tlsServer = new grpc.Server();
      tlsServer.addService(svc, impl);
      const plainPort = await bind(
        plainServer,
        grpc.ServerCredentials.createInsecure(),
      );
      const tlsPort = await bind(
        tlsServer,
        grpc.ServerCredentials.createSsl(null, [
          {
            private_key: fs.readFileSync(path.join(dir, 'server.key')),
            cert_chain: fs.readFileSync(path.join(dir, 'server.pem')),
          },
        ]),
      );
      plainProxy = await delayProxy(plainPort);
      tlsProxy = await delayProxy(tlsPort);
    });

    afterAll(() => {
      plainServer?.forceShutdown();
      tlsServer?.forceShutdown();
      plainProxy?.close();
      tlsProxy?.close();
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    });

    async function timedQuery(config: {
      tls: boolean;
      flightFlowControlWindow?: number;
    }): Promise<number> {
      const client = new SpiceClient({
        flightUrl: config.tls
          ? `localhost:${port(tlsProxy)}`
          : `127.0.0.1:${port(plainProxy)}`,
        httpUrl: 'http://127.0.0.1:1',
        flightTlsEnabled: config.tls,
        tlsRootCertFile: config.tls ? path.join(dir, 'server.pem') : undefined,
        flightOnly: true,
        logging: false,
        flightFlowControlWindow: config.flightFlowControlWindow,
      });
      const start = performance.now();
      const result = await client.sql('SELECT * FROM wide');
      const elapsed = performance.now() - start;
      expect(result.numRows).toBe(ROWS_PER_BATCH * BATCHES);
      expect(result.getChild('payload')?.get(result.numRows - 1)).toBe(PAYLOAD);
      return elapsed;
    }

    it('streams several times faster with the default window than with 64 KiB', async () => {
      const small = await timedQuery({
        tls: false,
        flightFlowControlWindow: 65535,
      });
      const plain = await timedQuery({ tls: false });
      const tls = await timedQuery({ tls: true });
      // ~4 MiB / 64 KiB = ~64 round trips of 40 ms, so at least ~2.5 s.
      expect(small).toBeGreaterThan(1500);
      expect(plain * 3).toBeLessThan(small);
      expect(tls * 3).toBeLessThan(small);
    }, 60_000);
  });
});
