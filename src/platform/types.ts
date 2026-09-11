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
  /**
   * Aborts the in-flight request when it fires. Without this the transport has
   * no way to end a request early, so a caller-side timeout can only stop
   * awaiting the response while the request itself runs to completion.
   */
  signal?: AbortSignal;
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
