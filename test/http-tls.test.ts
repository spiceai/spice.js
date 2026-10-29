/**
 * Regression test: tlsRootCertFile, tlsClientCertFile and tlsClientKeyFile
 * must reach the HTTP transport, not only the gRPC one.
 *
 * Previously every HTTP call went through one shared dispatcher with no
 * certificate options, so against a runtime with a private-CA certificate
 * isSpiceReady() returned false and refreshDataset()/runtimeStatus() failed
 * with UNABLE_TO_VERIFY_LEAF_SIGNATURE, even though Flight queries from the
 * same client succeeded.
 *
 * Certificates are generated with openssl at test time, so no private key is
 * committed to the repository.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as https from 'https';
import { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';

import { SpiceClient } from '../src/index.node';

function openssl(args: string[], cwd: string) {
  execFileSync('openssl', args, { cwd, stdio: 'ignore' });
}

function makePki(dir: string) {
  openssl(
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      'ca.key',
      '-out',
      'ca.pem',
      '-days',
      '1',
      '-subj',
      '/CN=spice.js test CA',
    ],
    dir,
  );
  fs.writeFileSync(
    path.join(dir, 'server.ext'),
    'subjectAltName=DNS:localhost,IP:127.0.0.1\n',
  );
  openssl(
    [
      'req',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      'server.key',
      '-out',
      'server.csr',
      '-subj',
      '/CN=localhost',
    ],
    dir,
  );
  openssl(
    [
      'x509',
      '-req',
      '-in',
      'server.csr',
      '-CA',
      'ca.pem',
      '-CAkey',
      'ca.key',
      '-CAcreateserial',
      '-out',
      'server.pem',
      '-days',
      '1',
      '-extfile',
      'server.ext',
    ],
    dir,
  );
  openssl(
    [
      'req',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      'client.key',
      '-out',
      'client.csr',
      '-subj',
      '/CN=client',
    ],
    dir,
  );
  openssl(
    [
      'x509',
      '-req',
      '-in',
      'client.csr',
      '-CA',
      'ca.pem',
      '-CAkey',
      'ca.key',
      '-CAcreateserial',
      '-out',
      'client.pem',
      '-days',
      '1',
    ],
    dir,
  );
}

async function listen(server: https.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `https://localhost:${(server.address() as AddressInfo).port}`;
}

function handler(
  req: { url?: string },
  res: { writeHead: Function; end: Function },
) {
  res.writeHead(200, {
    'content-type':
      req.url === '/v1/status' ? 'application/json' : 'text/plain',
  });
  res.end(req.url === '/v1/status' ? '[]' : 'ready');
}

describe('HTTP calls honor the TLS certificate options', () => {
  let dir: string;
  const file = (name: string) => path.join(dir, name);

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spicejs-tls-'));
    makePki(dir);
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('trusts the server through tlsRootCertFile', async () => {
    const server = https.createServer(
      {
        key: fs.readFileSync(file('server.key')),
        cert: fs.readFileSync(file('server.pem')),
      },
      handler,
    );
    const httpUrl = await listen(server);
    try {
      const client = new SpiceClient({
        httpUrl,
        httpOnly: true,
        logging: false,
        tlsRootCertFile: file('ca.pem'),
      });
      expect(await client.isSpiceReady()).toBe(true);
      expect(await client.runtimeStatus()).toEqual([]);

      const untrusting = new SpiceClient({
        httpUrl,
        httpOnly: true,
        logging: false,
      });
      expect(await untrusting.isSpiceReady()).toBe(false);
    } finally {
      server.close();
    }
  });

  it('presents tlsClientCertFile and tlsClientKeyFile to a server that requires them', async () => {
    const server = https.createServer(
      {
        key: fs.readFileSync(file('server.key')),
        cert: fs.readFileSync(file('server.pem')),
        ca: fs.readFileSync(file('ca.pem')),
        requestCert: true,
        rejectUnauthorized: true,
      },
      handler,
    );
    const httpUrl = await listen(server);
    try {
      const client = new SpiceClient({
        httpUrl,
        httpOnly: true,
        logging: false,
        tlsRootCertFile: file('ca.pem'),
        tlsClientCertFile: file('client.pem'),
        tlsClientKeyFile: file('client.key'),
      });
      expect(await client.isSpiceReady()).toBe(true);

      const noClientCert = new SpiceClient({
        httpUrl,
        httpOnly: true,
        logging: false,
        tlsRootCertFile: file('ca.pem'),
      });
      expect(await noClientCert.isSpiceReady()).toBe(false);
    } finally {
      server.close();
    }
  });

  it('reads certificate files again for a new client after they are rotated in place', async () => {
    const rotated = fs.mkdtempSync(
      path.join(os.tmpdir(), 'spicejs-tls-rotated-'),
    );
    makePki(rotated);
    const caPath = path.join(dir, 'current-ca.pem');
    const servers: https.Server[] = [];
    try {
      fs.copyFileSync(file('ca.pem'), caPath);
      const before = https.createServer(
        {
          key: fs.readFileSync(file('server.key')),
          cert: fs.readFileSync(file('server.pem')),
        },
        handler,
      );
      servers.push(before);
      const first = new SpiceClient({
        httpUrl: await listen(before),
        httpOnly: true,
        logging: false,
        tlsRootCertFile: caPath,
      });
      expect(await first.isSpiceReady()).toBe(true);

      // The CA is rotated at the same path and the server now presents a
      // certificate from the new CA; a client created afterwards must trust it.
      fs.copyFileSync(path.join(rotated, 'ca.pem'), caPath);
      const after = https.createServer(
        {
          key: fs.readFileSync(path.join(rotated, 'server.key')),
          cert: fs.readFileSync(path.join(rotated, 'server.pem')),
        },
        handler,
      );
      servers.push(after);
      const second = new SpiceClient({
        httpUrl: await listen(after),
        httpOnly: true,
        logging: false,
        tlsRootCertFile: caPath,
      });
      expect(await second.isSpiceReady()).toBe(true);
    } finally {
      servers.forEach((server) => server.close());
      fs.rmSync(rotated, { recursive: true, force: true });
    }
  });
});
