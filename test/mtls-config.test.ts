import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SpiceClient } from '../src';

/**
 * Unit tests for the mTLS client configuration (tlsRootCertFile,
 * tlsClientCertFile, tlsClientKeyFile).
 *
 * mTLS termination requires the Enterprise runtime, so these tests cover the
 * client-side contract only: option validation and that certificate files are
 * read and wired into the gRPC channel credentials.
 */
describe('mTLS configuration', () => {
  let dir: string;
  let certFile: string;
  let keyFile: string;
  let caFile: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spicejs-mtls-'));
    certFile = path.join(dir, 'client.pem');
    keyFile = path.join(dir, 'client.key');
    caFile = path.join(dir, 'ca.pem');
    fs.writeFileSync(certFile, '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n');
    fs.writeFileSync(keyFile, '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----\n');
    fs.writeFileSync(caFile, '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n');
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('throws when only tlsClientCertFile is provided', () => {
    expect(
      () =>
        new SpiceClient({
          httpOnly: true,
          tlsClientCertFile: certFile,
        }),
    ).toThrow(/tlsClientKeyFile is missing/);
  });

  test('throws when only tlsClientKeyFile is provided', () => {
    expect(
      () =>
        new SpiceClient({
          httpOnly: true,
          tlsClientKeyFile: keyFile,
        }),
    ).toThrow(/tlsClientCertFile is missing/);
  });

  test('accepts cert and key together', () => {
    const client = new SpiceClient({
      httpOnly: true,
      tlsClientCertFile: certFile,
      tlsClientKeyFile: keyFile,
      tlsRootCertFile: caFile,
    });
    expect((client as any)._tlsClientCertFile).toBe(certFile);
    expect((client as any)._tlsClientKeyFile).toBe(keyFile);
    expect((client as any)._tlsRootCertFile).toBe(caFile);
  });

  test('tlsRootCertFile alone is valid (custom CA without mTLS)', () => {
    const client = new SpiceClient({
      httpOnly: true,
      tlsRootCertFile: caFile,
    });
    expect((client as any)._tlsRootCertFile).toBe(caFile);
    expect((client as any)._tlsClientCertFile).toBeUndefined();
  });

  test('no TLS options is valid (standard TLS / plaintext)', () => {
    expect(() => new SpiceClient({ httpOnly: true })).not.toThrow();
  });

  test('gRPC client receives the certificate file paths', () => {
    const client = new SpiceClient({
      flightUrl: 'my-host:50051',
      tlsClientCertFile: certFile,
      tlsClientKeyFile: keyFile,
      tlsRootCertFile: caFile,
    });
    const grpcClient = (client as any)._grpcClient;
    expect(grpcClient).toBeDefined();
    expect(grpcClient.tlsClientCertFile).toBe(certFile);
    expect(grpcClient.tlsClientKeyFile).toBe(keyFile);
    expect(grpcClient.tlsRootCertFile).toBe(caFile);
  });
});
