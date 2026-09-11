"use strict";
/**
 * Node.js platform adapter with full gRPC support
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.platform = void 0;
const https = __importStar(require("https"));
const node_fetch_1 = __importStar(require("node-fetch"));
const os_1 = __importDefault(require("os"));
const version_1 = require("../version");
const httpsAgent = new https.Agent({ keepAlive: true });
class NodePlatformAdapter {
    supportsGrpc() {
        return true;
    }
    getUserAgent() {
        const osType = os_1.default.type();
        const osRelease = os_1.default.release();
        const osArch = os_1.default.machine();
        return `spice.js/${version_1.VERSION} (${osType}/${osRelease} ${osArch})`;
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
        const headers = new node_fetch_1.Headers();
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
        const response = await (0, node_fetch_1.default)(url, fetchOptions);
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
exports.platform = new NodePlatformAdapter();
//# sourceMappingURL=node.js.map