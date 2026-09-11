"use strict";
/**
 * Node.js entry point with full gRPC support
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
exports.AsyncQuery = exports.Param = exports.SpiceClient = void 0;
const client_common_1 = require("./client-common");
const node_1 = require("./platform/node");
const client_node_1 = require("./grpc/client.node");
const retry = __importStar(require("./retry.node"));
class SpiceClient extends client_common_1.SpiceClient {
    constructor(params = {}) {
        super(params, node_1.platform, retry, client_node_1.GrpcFlightClient);
    }
}
exports.SpiceClient = SpiceClient;
// Export Param class for explicit Arrow type control
var param_1 = require("./param");
Object.defineProperty(exports, "Param", { enumerable: true, get: function () { return param_1.Param; } });
var async_query_1 = require("./async-query");
Object.defineProperty(exports, "AsyncQuery", { enumerable: true, get: function () { return async_query_1.AsyncQuery; } });
//# sourceMappingURL=index.node.js.map