/**
 * Browser platform adapter - HTTP only, no gRPC support
 */
import { VERSION } from '../version';
class BrowserPlatformAdapter {
    supportsGrpc() {
        return false;
    }
    getUserAgent() {
        // In browsers, we can't override the User-Agent header
        // but we can return it for X-Client-Info or similar
        return `spice.js/${VERSION} (Browser)`;
    }
    getPlatformName() {
        // Use browser's navigator API to get platform information
        if (typeof navigator !== 'undefined') {
            return navigator.userAgent;
        }
        return 'Browser';
    }
    async fetch(url, options) {
        // Use globalThis.fetch which works in both browser and test environments
        const response = await globalThis.fetch(url, {
            method: options.method,
            headers: options.headers,
            body: options.body,
            signal: options.signal,
        });
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
export const platform = new BrowserPlatformAdapter();
//# sourceMappingURL=browser.js.map