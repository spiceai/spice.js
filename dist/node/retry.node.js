"use strict";
/**
 * Retry logic for Node.js with gRPC error codes
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FLIGHT_QUERY_MAX_RETRIES = void 0;
exports.dontRetry = dontRetry;
exports.retryWithExponentialBackoff = retryWithExponentialBackoff;
const retry = __importStar(require("retry"));
const grpc = __importStar(require("@grpc/grpc-js"));
//default max retry value
const FLIGHT_QUERY_MAX_RETRIES = 3;
exports.FLIGHT_QUERY_MAX_RETRIES = FLIGHT_QUERY_MAX_RETRIES;
const SPICE_NO_RETRY = '_SPICE_NO_RETRY';
function dontRetry(err) {
    err[SPICE_NO_RETRY] = true;
}
function shouldRetryOperationForError(err) {
    // error marked as permanent so operation should not be retried
    if (err && err[SPICE_NO_RETRY]) {
        return false;
    }
    // the caller cancelled, so retrying would restart the work they just stopped
    const name = err?.name;
    if (name === 'AbortError' || name === 'TimeoutError') {
        return false;
    }
    let code = err && err.code;
    if (!code) {
        return false;
    }
    return [
        grpc.status.UNAVAILABLE,
        grpc.status.DEADLINE_EXCEEDED,
        grpc.status.ABORTED,
        grpc.status.INTERNAL,
        grpc.status.UNKNOWN,
    ].includes(code);
}
async function retryWithExponentialBackoff(operation, maxRetries) {
    if (maxRetries < 0) {
        throw new Error('maxRetries must be greater than or equal to 0');
    }
    return new Promise((resolve, reject) => {
        const operationRetry = retry.operation({
            retries: maxRetries,
            // the exponential factor that will be used
            factor: 1.5,
        });
        operationRetry.attempt(() => {
            operation()
                .then(resolve)
                .catch((err) => {
                let shouldRetry = shouldRetryOperationForError(err);
                if (shouldRetry && operationRetry.retry(err)) {
                    return;
                }
                // in case we didn't try to retry the operation then mainError will be null
                // so we need to pass err for this scenario as an alternative
                reject(operationRetry.mainError() || err);
            });
        });
    });
}
//# sourceMappingURL=retry.node.js.map