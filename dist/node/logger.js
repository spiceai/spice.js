"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
exports.createLogger = createLogger;
/**
 * Simple logger with enable/disable support for spice.js
 *
 * When disabled, all logging methods are no-ops.
 * When enabled, logs are forwarded to the appropriate console methods.
 */
class Logger {
    enabled;
    constructor(enabled = true) {
        this.enabled = enabled;
    }
    /**
     * Log debug messages (uses console.debug)
     */
    debug(...args) {
        if (this.enabled) {
            console.debug(...args);
        }
    }
    /**
     * Log informational messages (uses console.log)
     */
    info(...args) {
        if (this.enabled) {
            console.log(...args);
        }
    }
    /**
     * Log warning messages (uses console.warn)
     */
    warn(...args) {
        if (this.enabled) {
            console.warn(...args);
        }
    }
    /**
     * Log error messages (uses console.error)
     */
    error(...args) {
        if (this.enabled) {
            console.error(...args);
        }
    }
    /**
     * Log messages (alias for info, uses console.log)
     */
    log(...args) {
        if (this.enabled) {
            console.log(...args);
        }
    }
    /**
     * Check if logging is enabled
     */
    isEnabled() {
        return this.enabled;
    }
}
exports.Logger = Logger;
/**
 * Create a new logger instance
 * @param enabled - Whether logging is enabled (default: true)
 */
function createLogger(enabled = true) {
    return new Logger(enabled);
}
//# sourceMappingURL=logger.js.map