/**
 * Retry logic for browser environments (no gRPC)
 */
//default max retry value
const FLIGHT_QUERY_MAX_RETRIES = 3;
const SPICE_NO_RETRY = '_SPICE_NO_RETRY';
function dontRetry(err) {
    err[SPICE_NO_RETRY] = true;
}
function shouldRetryOperationForError(err) {
    // error marked as permanent so operation should not be retried
    if (err && err[SPICE_NO_RETRY]) {
        return false;
    }
    // the caller cancelled, so retrying would restart the work they just stopped
    const name = err?.name;
    if (name === 'AbortError' || name === 'TimeoutError') {
        return false;
    }
    // For HTTP errors, retry on 5xx server errors and some 4xx
    if (err && err.status) {
        const status = err.status;
        // Retry on 5xx server errors, 408 Request Timeout, and 429 Too Many Requests
        return status >= 500 || status === 408 || status === 429;
    }
    return false;
}
async function retryWithExponentialBackoff(operation, maxRetries) {
    if (maxRetries < 0) {
        throw new Error('maxRetries must be greater than or equal to 0');
    }
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        }
        catch (err) {
            lastError = err;
            const shouldRetry = shouldRetryOperationForError(err);
            if (!shouldRetry || attempt === maxRetries) {
                throw err;
            }
            // Exponential backoff with factor 1.5
            const delay = Math.pow(1.5, attempt) * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
    throw lastError;
}
export { FLIGHT_QUERY_MAX_RETRIES, dontRetry, retryWithExponentialBackoff };
//# sourceMappingURL=retry.browser.js.map