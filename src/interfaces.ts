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
  | Buffer;

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

// Legacy interface for backward compatibility
/** @deprecated Use RefreshAccelerationOptions instead */
export interface RefreshOverrides extends RefreshAccelerationOptions {}
