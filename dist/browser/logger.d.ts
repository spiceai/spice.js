/**
 * Simple logger with enable/disable support for spice.js
 *
 * When disabled, all logging methods are no-ops.
 * When enabled, logs are forwarded to the appropriate console methods.
 */
export declare class Logger {
    private readonly enabled;
    constructor(enabled?: boolean);
    /**
     * Log debug messages (uses console.debug)
     */
    debug(...args: unknown[]): void;
    /**
     * Log informational messages (uses console.log)
     */
    info(...args: unknown[]): void;
    /**
     * Log warning messages (uses console.warn)
     */
    warn(...args: unknown[]): void;
    /**
     * Log error messages (uses console.error)
     */
    error(...args: unknown[]): void;
    /**
     * Log messages (alias for info, uses console.log)
     */
    log(...args: unknown[]): void;
    /**
     * Check if logging is enabled
     */
    isEnabled(): boolean;
}
/**
 * Create a new logger instance
 * @param enabled - Whether logging is enabled (default: true)
 */
export declare function createLogger(enabled?: boolean): Logger;
