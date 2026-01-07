/**
 * Simple logger with enable/disable support for spice.js
 *
 * When disabled, all logging methods are no-ops.
 * When enabled, logs are forwarded to the appropriate console methods.
 */
export class Logger {
  private readonly enabled: boolean;

  constructor(enabled: boolean = true) {
    this.enabled = enabled;
  }

  /**
   * Log debug messages (uses console.debug)
   */
  debug(...args: unknown[]): void {
    if (this.enabled) {
      console.debug(...args);
    }
  }

  /**
   * Log informational messages (uses console.log)
   */
  info(...args: unknown[]): void {
    if (this.enabled) {
      console.log(...args);
    }
  }

  /**
   * Log warning messages (uses console.warn)
   */
  warn(...args: unknown[]): void {
    if (this.enabled) {
      console.warn(...args);
    }
  }

  /**
   * Log error messages (uses console.error)
   */
  error(...args: unknown[]): void {
    if (this.enabled) {
      console.error(...args);
    }
  }

  /**
   * Log messages (alias for info, uses console.log)
   */
  log(...args: unknown[]): void {
    if (this.enabled) {
      console.log(...args);
    }
  }

  /**
   * Check if logging is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

/**
 * Create a new logger instance
 * @param enabled - Whether logging is enabled (default: true)
 */
export function createLogger(enabled: boolean = true): Logger {
  return new Logger(enabled);
}
