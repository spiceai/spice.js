/**
 * Platform abstraction types for cross-environment support
 */

export interface PlatformAdapter {
  /**
   * Perform an HTTP fetch request
   */
  fetch(url: string, options: FetchOptions): Promise<FetchResponse>;

  /**
   * Get the user agent string for this platform
   */
  getUserAgent(): string;

  /**
   * Check if gRPC is supported on this platform
   */
  supportsGrpc(): boolean;

  /**
   * Get the platform name (e.g., "Node.js", "Browser")
   */
  getPlatformName(): string;
}

export interface FetchOptions {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  /**
   * PEM file paths for a private CA and an mTLS client certificate.
   * Honored by the Node.js adapter; browsers manage TLS themselves.
   */
  tls?: HttpTlsFiles;
}

export interface HttpTlsFiles {
  rootCertFile?: string;
  clientCertFile?: string;
  clientKeyFile?: string;
}

export interface FetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: {
    get(name: string): string | null;
  };
  text(): Promise<string>;
  json(): Promise<any>;
}
