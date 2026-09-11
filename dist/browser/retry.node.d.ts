/**
 * Retry logic for Node.js with gRPC error codes
 */
declare const FLIGHT_QUERY_MAX_RETRIES = 3;
declare function dontRetry(err: any): void;
declare function retryWithExponentialBackoff<Type>(operation: any, maxRetries: number): Promise<Type>;
export { FLIGHT_QUERY_MAX_RETRIES, dontRetry, retryWithExponentialBackoff };
