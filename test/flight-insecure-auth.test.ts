/**
 * Regression test: over a plaintext (insecure) Flight channel the client must still
 * send `authorization: Bearer <key>` metadata. grpc-js silently drops call
 * credentials on insecure channels, so a secured local runtime used to reject every
 * Flight call with UNAUTHENTICATED.
 */
import * as path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { GrpcFlightClient } from '../src/grpc/client.node';
import { toFlightAuthError } from '../src/client-common';

const PROTO = path.join(__dirname, '..', 'proto', 'Flight.proto');

describe('Flight auth over an insecure channel', () => {
  let server: grpc.Server;
  let port: number;
  const seenAuth: (string | undefined)[] = [];

  beforeAll(async () => {
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
    const reject = (call: any, cb?: any) => {
      const auth = call.metadata.get('authorization')[0] as string | undefined;
      seenAuth.push(auth);
      const err = {
        code: grpc.status.UNAUTHENTICATED,
        details: auth === 'Bearer good-key' ? 'stop here' : 'Missing authorization header',
      };
      if (cb) cb(err);
      else call.emit('error', err);
    };
    const impl: Record<string, any> = {};
    for (const name of Object.keys(svc)) impl[name] = reject;
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

  it('attaches the bearer token on a plaintext channel', async () => {
    const client = new GrpcFlightClient(
      'good-key',
      `127.0.0.1:${port}`,
      'spice.js-test',
      false,
    );
    expect(await client.ensureInitialized()).toBe(true);
    await expect(client.executeQuery('SELECT 1')).rejects.toBeDefined();
    expect(seenAuth.at(-1)).toBe('Bearer good-key');
  });

  it('maps UNAUTHENTICATED to a clear auth error', () => {
    const err = Object.assign(new Error('16 UNAUTHENTICATED: Invalid credentials'), {
      code: 16,
    });
    const mapped = toFlightAuthError(err);
    expect(mapped?.message).toMatch(/authentication failed \(UNAUTHENTICATED\)/);
    expect((mapped as any).code).toBe(16);
    expect(toFlightAuthError(new Error('boom'))).toBeUndefined();
  });
});
