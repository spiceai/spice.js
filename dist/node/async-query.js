"use strict";
/**
 * A handle for a query submitted for asynchronous execution via
 * SpiceClient.query()/queryWithParams().
 *
 * Backed by the runtime's /v1/queries HTTP API, which requires the runtime
 * to be running in distributed/scheduler mode. Use sql()/sqlJson() for the
 * normal synchronous, streaming path.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AsyncQuery = void 0;
const arrow_utils_1 = require("./arrow-utils");
function isTerminal(status) {
    return (status === 'SUCCEEDED' ||
        status === 'FAILED' ||
        status === 'CANCELLED' ||
        status === 'CLOSED');
}
class AsyncQuery {
    /** The runtime-assigned id for this query. */
    queryId;
    _status;
    deps;
    /** @internal Constructed by SpiceClient.query()/queryWithParams(). */
    constructor(queryId, status, deps) {
        this.queryId = queryId;
        this._status = status;
        this.deps = deps;
    }
    /** The most recently observed status, without polling the runtime. */
    get lastKnownStatus() {
        return this._status;
    }
    /**
     * Polls the runtime once and returns the current status.
     */
    async status() {
        const response = await this.deps.pollStatus(this.queryId);
        this._status = response.status;
        return this._status;
    }
    /**
     * Polls the runtime until the query reaches a terminal status
     * (SUCCEEDED, FAILED, CANCELLED, or CLOSED).
     *
     * @throws Error if `timeoutMs` elapses before the query terminates.
     */
    async waitForCompletion(options) {
        const pollIntervalMs = options?.pollIntervalMs ?? 500;
        const deadline = options?.timeoutMs !== undefined
            ? Date.now() + options.timeoutMs
            : undefined;
        for (;;) {
            const status = await this.status();
            if (isTerminal(status)) {
                return status;
            }
            if (deadline !== undefined && Date.now() >= deadline) {
                throw new Error(`Timed out waiting for query ${this.queryId} to complete (last status: ${status})`);
            }
            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }
    }
    /**
     * Waits for the query to complete, then returns its results as an Arrow
     * Table. Fetches every result chunk in order and concatenates them.
     *
     * @throws Error if the query does not succeed.
     */
    async results() {
        await this.waitForCompletion();
        const queryResponse = await this.deps.getQuery(this.queryId);
        if (queryResponse.status !== 'SUCCEEDED') {
            const detail = queryResponse.error
                ? `${queryResponse.error.error_code}: ${queryResponse.error.message}`
                : `query did not succeed (status: ${queryResponse.status})`;
            throw new Error(`Async query ${this.queryId} failed: ${detail}`);
        }
        const columns = queryResponse.manifest?.schema.columns ?? [];
        const schema = columns.map((col) => ({
            name: col.name,
            data_type: col.type_name,
            nullable: col.nullable,
        }));
        const rows = [];
        // queryResponse.result is the first chunk (0), already fetched by
        // getQuery() to save a round trip. Absent entirely means a genuinely
        // empty result (no chunks were ever written) rather than an error.
        let chunk = queryResponse.result;
        while (chunk) {
            if (chunk.data_array) {
                rows.push(...chunk.data_array);
            }
            if (chunk.next_chunk_index === undefined) {
                break;
            }
            chunk = await this.deps.getChunk(this.queryId, chunk.next_chunk_index);
        }
        return (0, arrow_utils_1.jsonToArrowTable)(schema, rows);
    }
    /**
     * Requests cancellation of the query. Best-effort: a query that has
     * already reached a terminal status is not an error. Call {@link status}
     * to observe the outcome.
     */
    async cancel() {
        this._status = await this.deps.cancel(this.queryId);
    }
}
exports.AsyncQuery = AsyncQuery;
//# sourceMappingURL=async-query.js.map