/**
 * No-op gRPC client for browser environments
 */
export declare class GrpcFlightClient {
    constructor(_apiKey: string | undefined, _flightUrl: string, _userAgent: string, _flightTlsEnabled: boolean);
    ensureInitialized(): Promise<boolean>;
    executeQuery(_queryText: string, _headers?: {
        [key: string]: string;
    }): Promise<any>;
}
