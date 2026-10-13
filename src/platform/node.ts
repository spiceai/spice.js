/**
 * Node.js platform adapter with full gRPC support
 */

import * as https from 'https';
import os from 'os';
import type { PlatformAdapter, FetchOptions, FetchResponse } from './types';
import { VERSION } from '../version';

const httpsAgent = new https.Agent({ keepAlive: true });

/**
 * Prefer the runtime's built-in fetch (Node 18+). node-fetch 2.x raises false
 * ERR_STREAM_PREMATURE_CLOSE errors on chunked responses (node-fetch#1767, #1576),
 * which broke `sql()` against `/v1/sql`. node-fetch is only loaded as a fallback
 * when no global fetch exists.
 */
export function hasGlobalFetch(): boolean {
  return typeof (globalThis as any).fetch === 'function';
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
    let response: any;
    if (hasGlobalFetch()) {
      response = await (globalThis as any).fetch(url, {
        headers: { ...options.headers },
        method: options.method,
        body: options.body,
        signal: options.signal,
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
        fetchOptions.agent = httpsAgent;
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
