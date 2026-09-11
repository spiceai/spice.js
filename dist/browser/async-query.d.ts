/**
 * A handle for a query submitted for asynchronous execution via
 * SpiceClient.query()/queryWithParams().
 *
 * Backed by the runtime's /v1/queries HTTP API, which requires the runtime
 * to be running in distributed/scheduler mode. Use sql()/sqlJson() for the
 * normal synchronous, streaming path.
 */
import { Table } from 'apache-arrow';
export type QueryStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'CLOSED';
export interface QueryErrorDetails {
    error_code: string;
    message: string;
    sql_state?: string;
}
export interface QueryStatusResponse {
    status: QueryStatus;
    error?: QueryErrorDetails;
}
export interface QueryResultColumnSchema {
    name: string;
    type_name: string;
    nullable: boolean;
    position: number;
}
export interface QueryResultManifest {
    format: string;
    schema: {
        column_count: number;
        columns: QueryResultColumnSchema[];
    };
    total_row_count: number;
    total_chunk_count: number;
}
export interface QueryResultChunk {
    chunk_index: number;
    row_offset: number;
    row_count: number;
    next_chunk_index?: number;
    next_chunk_url?: string;
    data_array?: any[];
}
/** Full status response from `GET /v1/queries/{query_id}`, including the result manifest and first chunk once succeeded. */
export interface QueryResponse extends QueryStatusResponse {
    manifest?: QueryResultManifest;
    result?: QueryResultChunk;
}
export interface WaitForCompletionOptions {
    /** How often to poll the runtime for status, in milliseconds. Default 500. */
    pollIntervalMs?: number;
    /** Maximum time to wait before throwing, in milliseconds. Default: no limit. */
    timeoutMs?: number;
}
/**
 * Functions AsyncQuery needs from the owning SpiceClient.
 * @internal
 */
export interface AsyncQueryDeps {
    pollStatus(queryId: string): Promise<QueryStatusResponse>;
    getQuery(queryId: string): Promise<QueryResponse>;
    getChunk(queryId: string, chunkIndex: number): Promise<QueryResultChunk>;
    cancel(queryId: string): Promise<QueryStatus>;
}
export declare class AsyncQuery {
    /** The runtime-assigned id for this query. */
    readonly queryId: string;
    private _status;
    private readonly deps;
    /** @internal Constructed by SpiceClient.query()/queryWithParams(). */
    constructor(queryId: string, status: QueryStatus, deps: AsyncQueryDeps);
    /** The most recently observed status, without polling the runtime. */
    get lastKnownStatus(): QueryStatus;
    /**
     * Polls the runtime once and returns the current status.
     */
    status(): Promise<QueryStatus>;
    /**
     * Polls the runtime until the query reaches a terminal status
     * (SUCCEEDED, FAILED, CANCELLED, or CLOSED).
     *
     * @throws Error if `timeoutMs` elapses before the query terminates.
     */
    waitForCompletion(options?: WaitForCompletionOptions): Promise<QueryStatus>;
    /**
     * Waits for the query to complete, then returns its results as an Arrow
     * Table. Fetches every result chunk in order and concatenates them.
     *
     * @throws Error if the query does not succeed.
     */
    results(): Promise<Table>;
    /**
     * Requests cancellation of the query. Best-effort: a query that has
     * already reached a terminal status is not an error. Call {@link status}
     * to observe the outcome.
     */
    cancel(): Promise<void>;
}
