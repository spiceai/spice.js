/**
 * Node.js platform adapter with full gRPC support
 */
import * as https from 'https';
import fetch, { Headers, } from 'node-fetch';
import os from 'os';
import { VERSION } from '../version';
const httpsAgent = new https.Agent({ keepAlive: true });
class NodePlatformAdapter {
    supportsGrpc() {
        return true;
    }
    getUserAgent() {
        const osType = os.type();
        const osRelease = os.release();
        const osArch = os.machine();
        return `spice.js/${VERSION} (${osType}/${osRelease} ${osArch})`;
    }
    getPlatformName() {
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
        if (typeof globalThis.EdgeRuntime !== 'undefined') {
            return `Vercel Edge Runtime ${globalThis.EdgeRuntime}`;
        }
        if (process.env.DENO_DEPLOYMENT_ID) {
            return `Deno Deploy ${process.version}`;
        }
        // Cloudflare Workers would use the browser adapter, not this one
        // Default: Node.js runtime information
        return `Node.js ${process.version} ${process.platform} ${process.arch}`;
    }
    async fetch(url, options) {
        const headers = new Headers();
        Object.entries(options.headers).forEach(([key, value]) => {
            headers.set(key, value);
        });
        const fetchOptions = {
            headers,
            method: options.method,
            body: options.body,
            signal: options.signal,
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
                get: (name) => response.headers.get(name),
            },
            text: () => response.text(),
            json: () => response.json(),
        };
    }
}
export const platform = new NodePlatformAdapter();
//# sourceMappingURL=node.js.map