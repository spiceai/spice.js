/**
 * Node.js platform adapter with full gRPC support
 */

import * as fs from 'fs';
import * as https from 'https';
import os from 'os';
import { Agent } from 'undici';
import type {
  PlatformAdapter,
  FetchOptions,
  FetchResponse,
  HttpTlsFiles,
} from './types';
import { VERSION } from '../version';

const httpsAgent = new https.Agent({ keepAlive: true });

/**
 * Undici (Node's built-in fetch) defaults headersTimeout and bodyTimeout to
 * 300s. The previous node-fetch path had no such limit; cancellation is
 * caller-controlled via AbortSignal. Disable both so long-running /v1/sql
 * queries are not cut off after five minutes of waiting for headers or
 * between body chunks.
 */
export const NODE_FETCH_DISPATCHER_OPTIONS = {
  headersTimeout: 0,
  bodyTimeout: 0,
  keepAliveTimeout: 60_000,
  keepAliveMaxTimeout: 600_000,
} as const;

const fetchDispatcher = new Agent(NODE_FETCH_DISPATCHER_OPTIONS);

/**
 * Prefer the runtime's built-in fetch (Node 18+). node-fetch 2.x raises false
 * ERR_STREAM_PREMATURE_CLOSE errors on chunked responses (node-fetch#1767, #1576),
 * which broke `sql()` against `/v1/sql`. node-fetch is only loaded as a fallback
 * when no global fetch exists.
 */
export function hasGlobalFetch(): boolean {
  return typeof (globalThis as any).fetch === 'function';
}

/** Test helper: the Undici Agent passed as `dispatcher` to global fetch. */
export function getNodeFetchDispatcher(): Agent {
  return fetchDispatcher;
}

interface HttpTransport {
  dispatcher: Agent;
  httpsAgent: https.Agent;
}

/**
 * One transport per client's TLS settings (the client passes the same object
 * on every call), so each client's private CA and client certificate reach
 * the TLS handshake. The files are read on that client's first HTTP call:
 * a client created after a certificate is rotated loads the new files, and
 * clients never share credentials through matching path strings.
 */
const tlsTransports = new WeakMap<HttpTlsFiles, HttpTransport>();

function transportFor(tls?: HttpTlsFiles): HttpTransport {
  if (
    !tls ||
    (!tls.rootCertFile && !tls.clientCertFile && !tls.clientKeyFile)
  ) {
    return { dispatcher: fetchDispatcher, httpsAgent };
  }
  let transport = tlsTransports.get(tls);
  if (!transport) {
    const options = {
      ca: tls.rootCertFile ? fs.readFileSync(tls.rootCertFile) : undefined,
      cert: tls.clientCertFile
        ? fs.readFileSync(tls.clientCertFile)
        : undefined,
      key: tls.clientKeyFile ? fs.readFileSync(tls.clientKeyFile) : undefined,
    };
    transport = {
      dispatcher: new Agent({
        ...NODE_FETCH_DISPATCHER_OPTIONS,
        connect: options,
      }),
      httpsAgent: new https.Agent({ keepAlive: true, ...options }),
    };
    tlsTransports.set(tls, transport);
  }
  return transport;
}

class NodePlatformAdapter implements PlatformAdapter {
  supportsGrpc(): boolean {
    return true;
  }

  getUserAgent(): string {
    const osType = os.type();
    const osRelease = os.release();
    const osArch = os.machine();
    return `spice.js/${VERSION} (${osType}/${osRelease} ${osArch})`;
  }

  getPlatformName(): string {
    // Detect serverless/edge platforms based on environment variables
    if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
      return `AWS Lambda ${process.env.AWS_EXECUTION_ENV || 'unknown'} Node.js ${process.version}`;
    }
    if (process.env.VERCEL) {
      return `Vercel ${process.env.VERCEL_ENV || 'unknown'} Node.js ${process.version}`;
    }
    if (process.env.NETLIFY) {
      return `Netlify Node.js ${process.version}`;
    }
    if (typeof (globalThis as any).EdgeRuntime !== 'undefined') {
      return `Vercel Edge Runtime ${(globalThis as any).EdgeRuntime}`;
    }
    if (process.env.DENO_DEPLOYMENT_ID) {
      return `Deno Deploy ${process.version}`;
    }
    // Cloudflare Workers would use the browser adapter, not this one

    // Default: Node.js runtime information
    return `Node.js ${process.version} ${process.platform} ${process.arch}`;
  }

  async fetch(url: string, options: FetchOptions): Promise<FetchResponse> {
    const transport = transportFor(options.tls);
    let response: any;
    if (hasGlobalFetch()) {
      response = await (globalThis as any).fetch(url, {
        headers: { ...options.headers },
        method: options.method,
        body: options.body,
        signal: options.signal,
        dispatcher: transport.dispatcher,
      });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodeFetch = require('node-fetch');
      const fetchFn = nodeFetch.default ?? nodeFetch;
      const fetchOptions: Record<string, unknown> = {
        headers: new nodeFetch.Headers(options.headers),
        method: options.method,
        body: options.body,
        signal: options.signal,
      };
      if (url.startsWith('https://')) {
        fetchOptions.agent = transport.httpsAgent;
      }
      response = await fetchFn(url, fetchOptions);
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: {
        get: (name: string) => response.headers.get(name),
      },
      text: () => response.text(),
      json: () => response.json(),
    };
  }
}

export const platform: PlatformAdapter = new NodePlatformAdapter();
