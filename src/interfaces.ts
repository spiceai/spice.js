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
   * The similarity of the match to the query (Spice v1)
   */
  score?: number;
  /**
   * The similarity of the match to the query (Spice v2)
   */
  _score?: number;
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
