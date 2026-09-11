/**
 * No-op gRPC client for browser environments
 */
export class GrpcFlightClient {
    constructor(_apiKey, _flightUrl, _userAgent, _flightTlsEnabled) {
        // No-op constructor
    }
    async ensureInitialized() {
        return false;
    }
    async executeQuery(_queryText, _headers) {
        throw new Error('gRPC is not supported in browser environments');
    }
}
//# sourceMappingURL=client.browser.js.map