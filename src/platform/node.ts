/**
 * Node.js platform adapter with full gRPC support
 */

import * as https from 'https';
import fetch, {
  Headers,
  RequestInit as NodeFetchRequestInit,
} from 'node-fetch';
import os from 'os';
import type { PlatformAdapter, FetchOptions, FetchResponse } from './types';
import { VERSION } from '../version';

const httpsAgent = new https.Agent({ keepAlive: true });

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
    const headers = new Headers();
    Object.entries(options.headers).forEach(([key, value]) => {
      headers.set(key, value);
    });

    const fetchOptions: NodeFetchRequestInit = {
      headers,
      method: options.method,
      body: options.body,
    };

    if (url.startsWith('https://')) {
      fetchOptions.agent = httpsAgent;
    }

    const response = await fetch(url, fetchOptions);

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
