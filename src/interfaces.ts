export interface SpiceClientConfig {
  apiKey?: string;
  httpUrl?: string;
  flightUrl?: string;
  flightTlsEnabled?: boolean;
  userAgent?: string;
  customHeaders?: { [key: string]: string };
  /**
   * If true, only use gRPC Arrow Flight without HTTP fallback.
   * Will throw an error if gRPC is not available.
   * @default false
   */
  flightOnly?: boolean;
  /**
   * If true, only use HTTP transport without attempting gRPC Arrow Flight.
   * Useful for environments that only support HTTP (e.g., Vercel serverless).
   * @default false
   */
  httpOnly?: boolean;
  /**
   * Enable or disable logging output from the library.
   * When false, all console output is suppressed.
   * @default true
   */
  logging?: boolean;
  /**
   * Path to a PEM-encoded CA certificate file for server verification.
   * When set, this CA is used instead of the system certificate store.
   */
  tlsRootCertFile?: string;
  /**
   * Path to a PEM-encoded client certificate file for mTLS.
   * Must be used together with `tlsClientKeyFile`.
   */
  tlsClientCertFile?: string;
  /**
   * Path to a PEM-encoded client private key file for mTLS.
   * Must be used together with `tlsClientCertFile`.
   */
  tlsClientKeyFile?: string;
}

export interface SchemaField {
  name: string;
  data_type: string;
  nullable: boolean;
  dict_id: number;
  dict_is_ordered: boolean;
}

export interface SqlV1JsonResponse {
  row_count: number;
  schema: {
    fields: SchemaField[];
  };
  data: any[];
  execution_time_ms: number;
}

export interface RefreshAccelerationOptions {
  refresh_sql?: string;
  refresh_mode?: 'disabled' | 'full' | 'append' | 'changes';
  refresh_jitter_max?: string;
}

export interface RefreshAccelerationResponse {
  message: string;
}

export interface NsqlOptions {
  datasets?: string[] | null;
  model?: string;
  sample_data_enabled?: boolean;
}

export interface NsqlResponse {
  row_count: number;
  schema: {
    fields: SchemaField[];
  };
  data: any[];
  sql: string;
}

import type { Param } from './param';

/**
 * Query parameter value types supported by DataFusion
 */
export type QueryParameterValue =
  | string
  | number
  | boolean
  | Date
  | null
  | bigint
  | Buffer
  | Param;

/**
 * Query parameters for parameterized queries
 * Can be an object with named parameters or an array for positional parameters
 */
export type QueryParameters =
  | { [key: string]: QueryParameterValue }
  | QueryParameterValue[];

/**
 * Options for SQL queries
 */
export interface SqlQueryOptions {
  /**
   * Query parameters for parameterized queries
   * Named parameters: { param1: value1, param2: value2 }
   * Positional parameters: [value1, value2, value3]
   */
  parameters?: QueryParameters;
}

export interface SearchOptions {
  /**
   * The datasets to search. If None, search across all datasets.
   * For available datasets, use the list_datasets tool and ensure can_search_documents==true.
   */
  datasets?: string[] | null;
  /**
   * Number of documents to return for each dataset
   */
  limit?: number | null;
  /**
   * Additional columns to return from the dataset. If the column is a primary key,
   * it will be returned within the response under .primary_key, not .data.
   */
  additional_columns?: string[];
  /**
   * An SQL filter predicate to apply. Format: 'WHERE where_cond'.
   */
  where?: string | null;
  /**
   * Keywords to include in the search for keyword/fulltext matching
   */
  keywords?: string[] | null;
}

export interface SearchMatch {
  /**
   * The name of the dataset where the match was found
   */
  dataset: string;
  /**
   * The similarity of the match to the query
   */
  score: number;
  /**
   * The matches for this result
   */
  matches: {
    [key: string]: any;
  };
  /**
   * Primary key(s) identifying the matched item in the dataset
   */
  primary_key: {
    [key: string]: any;
  };
  /**
   * Additional data from the dataset requested by the user
   */
  data: {
    [key: string]: any;
  };
  /**
   * Metadata associated with the match
   */
  metadata: {
    [key: string]: any;
  };
}

/**
 * A single match exactly as the runtime serializes it on the wire.
 *
 * Differs from {@link SearchMatch} in two ways, both of which
 * {@link normalizeSearchResponse} reconciles:
 * - the similarity score is named `_score`
 * - `data`, `primary_key`, `matches` and `metadata` are omitted entirely when empty
 *
 * @internal
 */
export interface WireSearchMatch {
  dataset: string;
  _score: number;
  matches?: Record<string, unknown>;
  primary_key?: Record<string, unknown>;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * A search response exactly as the runtime serializes it on the wire.
 *
 * @internal
 */
export interface WireSearchResponse {
  duration_ms: number;
  results: WireSearchMatch[];
}

export interface SearchResponse {
  /**
   * Total time taken to execute the search, in milliseconds
   */
  duration_ms: number;
  /**
   * List of matches that were found in the datasets
   */
  results: SearchMatch[];
}

export interface QueryHeaders {
  [key: string]: string;
}

// Legacy interface for backward compatibility
/** @deprecated Use RefreshAccelerationOptions instead */
export interface RefreshOverrides extends RefreshAccelerationOptions {}
