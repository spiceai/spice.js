/**
 * A handle for a query submitted for asynchronous execution via
 * SpiceClient.query()/queryWithParams().
 *
 * Backed by the runtime's /v1/queries HTTP API, which requires the runtime
 * to be running in distributed/scheduler mode. Use sql()/sqlJson() for the
 * normal synchronous, streaming path.
 */

import { Table } from 'apache-arrow';
import { jsonToArrowTable } from './arrow-utils';

export type QueryStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'CLOSED';

function isTerminal(status: QueryStatus): boolean {
  return (
    status === 'SUCCEEDED' ||
    status === 'FAILED' ||
    status === 'CANCELLED' ||
    status === 'CLOSED'
  );
}

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
  schema: { column_count: number; columns: QueryResultColumnSchema[] };
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

export class AsyncQuery {
  /** The runtime-assigned id for this query. */
  public readonly queryId: string;

  private _status: QueryStatus;
  private readonly deps: AsyncQueryDeps;

  /** @internal Constructed by SpiceClient.query()/queryWithParams(). */
  constructor(queryId: string, status: QueryStatus, deps: AsyncQueryDeps) {
    this.queryId = queryId;
    this._status = status;
    this.deps = deps;
  }

  /** The most recently observed status, without polling the runtime. */
  get lastKnownStatus(): QueryStatus {
    return this._status;
  }

  /**
   * Polls the runtime once and returns the current status.
   */
  async status(): Promise<QueryStatus> {
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
  async waitForCompletion(
    options?: WaitForCompletionOptions,
  ): Promise<QueryStatus> {
    const pollIntervalMs = options?.pollIntervalMs ?? 500;
    const deadline =
      options?.timeoutMs !== undefined
        ? Date.now() + options.timeoutMs
        : undefined;

    for (;;) {
      const status = await this.status();
      if (isTerminal(status)) {
        return status;
      }
      if (deadline !== undefined && Date.now() >= deadline) {
        throw new Error(
          `Timed out waiting for query ${this.queryId} to complete (last status: ${status})`,
        );
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
  async results(): Promise<Table> {
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

    const rows: any[] = [];
    // queryResponse.result is the first chunk (0), already fetched by
    // getQuery() to save a round trip. Absent entirely means a genuinely
    // empty result (no chunks were ever written) rather than an error.
    let chunk: QueryResultChunk | undefined = queryResponse.result;
    while (chunk) {
      if (chunk.data_array) {
        rows.push(...chunk.data_array);
      }
      if (chunk.next_chunk_index === undefined) {
        break;
      }
      chunk = await this.deps.getChunk(this.queryId, chunk.next_chunk_index);
    }

    return jsonToArrowTable(schema, rows);
  }

  /**
   * Requests cancellation of the query. Best-effort: a query that has
   * already reached a terminal status is not an error. Call {@link status}
   * to observe the outcome.
   */
  async cancel(): Promise<void> {
    this._status = await this.deps.cancel(this.queryId);
  }
}
