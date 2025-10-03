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
}

export interface FetchOptions {
  method: string;
  headers: Record<string, string>;
  body?: string;
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
