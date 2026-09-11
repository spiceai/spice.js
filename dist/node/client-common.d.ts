/**
 * Common SpiceClient implementation supporting both Node.js and Browser environments
 */
import { Table } from 'apache-arrow';
import type { PlatformAdapter } from './platform/types';
import { type SpiceClientConfig, type SqlV1JsonResponse, type RefreshAccelerationOptions, type RefreshAccelerationResponse, type NsqlOptions, type NsqlResponse, type SqlQueryOptions, type SqlJsonOptions, type QueryParameters, type SearchOptions, type SearchResponse, type ActiveQuery, type CancelActiveQueryResponse, type ListQueriesOptions, type AsyncQuerySummary } from './interfaces';
import { AsyncQuery } from './async-query';
import type { GrpcFlightClient } from './grpc/client.node';
export interface RetryModule {
    FLIGHT_QUERY_MAX_RETRIES: number;
    dontRetry(err: any): void;
    retryWithExponentialBackoff<T>(operation: any, maxRetries: number): Promise<T>;
}
export declare class SpiceClient {
    private _apiKey?;
    private _flightUrl;
    private _httpUrl;
    private _userAgent;
    private _flightTlsEnabled;
    private _tlsClientCertFile?;
    private _tlsClientKeyFile?;
    private _tlsRootCertFile?;
    private _maxRetries;
    private _customHeaders?;
    private _platform;
    private _grpcClient;
    private _retry;
    private _isSpiceCloud;
    private _flightOnly;
    private _httpOnly;
    private _logger;
    private static readonly DEFAULT_CLOUD_HTTP;
    private static readonly DEFAULT_CLOUD_FLIGHT;
    constructor(params: (string | SpiceClientConfig) | undefined, platform: PlatformAdapter, retry: RetryModule, GrpcClientClass?: typeof GrpcFlightClient);
    private logConfiguration;
    /**
     * Extracts the value from a Param object or returns the value directly
     */
    private extractParamValue;
    /**
     * Converts parameters for HTTP endpoint format
     */
    private convertParametersForHttp;
    private doQueryRequest;
    private doGrpcQueryRequest;
    /**
     * Ask the runtime to stop a Flight query this client started.
     *
     * Flight hands the caller no query id — the ticket carries a trace id and
     * the SQL, and neither the FlightInfo nor the stream metadata carries the
     * `query_id` that the cancel endpoint takes — so the query has to be found
     * in the active list by its statement. Only an unambiguous match is
     * cancelled: if two running Flight queries could be this one, both are left
     * alone rather than risk stopping the wrong caller's work.
     *
     * Best-effort by design. The caller's promise has already rejected with
     * their abort reason, so nothing here is allowed to throw or delay them.
     */
    private cancelFlightQuery;
    private doHttpQueryRequest;
    private parseStreamingResponse;
    private parseSingleResponse;
    /**
     * Executes a SQL query and returns results as Arrow Tables.
     * Supports parameterized queries when options.parameters is provided.
     *
     * @param queryText - The SQL query to execute. Use $1, $2 for positional parameters or $param_name for named parameters.
     * @param optionsOrCallback - Either SqlQueryOptions with parameters, or a callback function for streaming results
     * @param onData - Optional callback for streaming results (used when second parameter is SqlQueryOptions)
     * @param headers - Optional headers to pass with the request (HTTP headers for HTTP, Flight metadata for gRPC)
     * @returns Promise resolving to the final Arrow Table
     *
     * @example
     * // Simple query
     * await client.sql('SELECT * FROM table LIMIT 10');
     *
     * @example
     * // Parameterized query with positional parameters
     * await client.sql('SELECT * FROM table WHERE id = $1 AND status = $2', { parameters: [123, 'active'] });
     *
     * @example
     * // Parameterized query with named parameters
     * await client.sql('SELECT * FROM table WHERE id = $id AND status = $status', {
     *   parameters: { id: 123, status: 'active' }
     * });
     *
     * @example
     * // With streaming callback
     * await client.sql('SELECT * FROM table', (table) => console.log(table.numRows));
     */
    sql(queryText: string, optionsOrCallback?: SqlQueryOptions | ((data: Table) => void), onData?: (data: Table) => void, headers?: {
        [key: string]: string;
    }): Promise<Table>;
    /**
     * Submits a query for asynchronous execution and returns a handle for
     * polling status and retrieving results. Requires the runtime to be
     * running in distributed/scheduler mode; otherwise the runtime returns an
     * error indicating async queries are only available in cluster mode.
     *
     * Use {@link sql} for the normal synchronous, streaming path.
     *
     * @param queryText - The SQL query to submit
     * @param options - Optional configuration, including positional/named parameters
     * @returns Promise resolving to an AsyncQuery handle
     *
     * @example
     * const job = await client.query('SELECT * FROM large_table');
     * const table = await job.results(); // waits for completion, then fetches results
     *
     * @example
     * // Parameterized
     * const job = await client.query('SELECT * FROM t WHERE id = $1', { parameters: [123] });
     */
    query(queryText: string, options?: SqlQueryOptions): Promise<AsyncQuery>;
    /**
     * Submits a parameterized query for asynchronous execution. Equivalent to
     * {@link query} with `options.parameters` set.
     *
     * Use {@link sql} for the normal synchronous, streaming, parameterized path.
     *
     * @param queryText - The SQL query with positional ($1, $2, ...) or named ($name) placeholders
     * @param parameters - Positional array or named object of parameter values
     * @returns Promise resolving to an AsyncQuery handle
     */
    queryWithParams(queryText: string, parameters: QueryParameters): Promise<AsyncQuery>;
    private submitAsyncQuery;
    private pollAsyncQueryStatus;
    private getAsyncQuery;
    private getAsyncQueryChunk;
    private cancelAsyncQuery;
    /**
     * Lists async query jobs submitted to the runtime.
     *
     * Distinct from {@link listActiveQueries}, which lists synchronous queries
     * (those started by {@link sql}, FlightSQL, NSQL, and search).
     *
     * @param options - Optional status filter and result limit
     */
    listQueries(options?: ListQueriesOptions): Promise<AsyncQuerySummary[]>;
    /**
     * Executes a SQL query and returns results as JSON with schema metadata.
     * Uses gRPC/Arrow if available, otherwise falls back to HTTP.
     * @param queryText - The SQL query to execute
     * @param headers - Optional headers to pass with the request (HTTP headers for HTTP, Flight metadata for gRPC)
     * @param options - Optional configuration; `signal` cancels the query
     * @returns Promise resolving to an object containing row_count, schema, data, and execution_time_ms
     *
     * @example
     * // Give the query five seconds, then cancel it
     * await client.sqlJson('SELECT * FROM big_table', undefined, {
     *   signal: AbortSignal.timeout(5000),
     * });
     */
    sqlJson(queryText: string, options?: SqlJsonOptions): Promise<SqlV1JsonResponse>;
    /**
     * @deprecated Pass `headers` inside the options object:
     * `sqlJson(sql, { headers, signal })`.
     */
    sqlJson(queryText: string, headers: {
        [key: string]: string;
    } | undefined, options?: SqlJsonOptions): Promise<SqlV1JsonResponse>;
    /**
     * Execute a natural language query (NSQL) and return the results with the generated SQL
     * @param query - The natural language query to convert to SQL
     * @param options - Optional configuration for the NSQL request
     * @returns Promise resolving to the query results with the generated SQL
     */
    nsql(query: string, options?: NsqlOptions): Promise<NsqlResponse>;
    /**
     * Translate a natural language query into SQL without running it.
     *
     * Use this to inspect or edit the generated query before running it, or to
     * run it through {@link sql}/{@link sqlJson} for Arrow-typed results
     * instead of the JSON rows `nsql()` returns.
     *
     * @param query - The natural language query to convert to SQL
     * @param options - Optional configuration for the NSQL request
     * @returns Promise resolving to the generated SQL string
     */
    nsqlGenerateSql(query: string, options?: NsqlOptions): Promise<string>;
    /**
     * Perform a hybrid search operation on a dataset.
     *
     * The search combines multiple search techniques:
     * - Vector similarity search (semantic matching via embeddings)
     * - Keyword/fulltext search (exact and fuzzy text matching)
     * - Metadata filtering (SQL WHERE conditions)
     *
     * The datasets queried should have an embedding column, and the
     * appropriate embedding model loaded for vector similarity search.
     *
     * @param query - The search query text for semantic and keyword matching
     * @param options - Optional search parameters including datasets, limit, filters, etc.
     * @returns Promise resolving to the search results with duration and matches
     */
    search(query: string, options?: SearchOptions): Promise<SearchResponse>;
    /**
     * Sets the maximum number of times to retry Query calls. The default is 3
     * @param maxRetries Num of max retries. Setting to 0 will disable retries
     */
    setMaxRetries(maxRetries: number): void;
    /**
     * Triggers an on-demand refresh for an accelerated dataset.
     * @param dataset - The name of the dataset to refresh
     * @param options - Optional refresh configuration
     * @returns Promise resolving to the refresh response message
     */
    refreshAcceleration(dataset: string, options?: RefreshAccelerationOptions): Promise<RefreshAccelerationResponse>;
    /**
     * Lists the synchronous queries this client currently has running.
     *
     * Synchronous queries are the ones started by `sql()`, `query()`, `sqlJson()`,
     * FlightSQL, `nsql()` and `search()` — not async query jobs, which the runtime
     * only serves in cluster mode.
     *
     * The runtime does not return a query's id to the client that submitted it, so
     * this is how to find the id that {@link cancelActiveQuery} needs. Results are
     * scoped to this client, so another caller's in-flight queries are never listed.
     *
     * @returns Promise resolving to the active queries
     */
    listActiveQueries(): Promise<ActiveQuery[]>;
    /**
     * Cancels a running synchronous query by id.
     *
     * `queryId` comes from {@link listActiveQueries}. Cancellation is scoped to this
     * client: an id belonging to another caller is reported as not found rather than
     * cancelled.
     *
     * @param queryId - The id of the query to cancel
     * @returns Promise resolving to the cancellation response
     */
    cancelActiveQuery(queryId: string): Promise<CancelActiveQueryResponse>;
    /**
     * Checks if the Spice runtime is ready to accept requests.
     * This endpoint is authenticated and requires an API key.
     * @returns Promise resolving to true if ready, false otherwise
     */
    isSpiceReady(): Promise<boolean>;
    /**
     * Checks the health status of the Spice runtime.
     * This endpoint is unauthenticated and does not require an API key.
     * @returns Promise resolving to true if healthy, false otherwise
     */
    isSpiceHealthy(): Promise<boolean>;
    private fetchInternal;
}
