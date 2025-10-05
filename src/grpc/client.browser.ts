/**
 * No-op gRPC client for browser environments
 */

export class GrpcFlightClient {
  constructor(
    _apiKey: string | undefined,
    _flightUrl: string,
    _userAgent: string,
    _flightTlsEnabled: boolean
  ) {
    // No-op constructor
  }

  async ensureInitialized(): Promise<boolean> {
    return false;
  }

  async executeQuery(_queryText: string): Promise<any> {
    throw new Error('gRPC is not supported in browser environments');
  }
}
