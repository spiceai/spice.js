export interface QueryCompletionNotification {
  name: string;
  type: 'webhook';
  uri: string;
}

export interface AsyncQueryRequest {
  sql: string;
  notifications: QueryCompletionNotification[];
}

export interface AsyncQueryResponse {
  queryId: string;
}

export interface QueryCompleteNotification {
  appId: number;
  queryId: string;
  requestTime: string;
  completionTime: string;
  state: string;
  sql: string;
  rowCount: 3;
}

export interface QueryResultsResponse {
  rowCount: number;
  schema: { name: 'string'; type: { name: string } }[];
  rows: any[];
}

export interface SpiceClientConfig {
  apiKey?: string;
  httpUrl?: string;
  flightUrl?: string;
  flightTlsEnabled?: boolean;
  userAgent?: string;
  customHeaders?: { [key: string]: string };
}

export interface RefreshOverrides {
  refresh_sql?: string;
  refresh_mode?: 'disabled' | 'full' | 'append' | 'changes';
  refresh_jitter_max?: string;
}

export interface NsqlOptions {
  datasets?: string[] | null;
  model?: string;
  sample_data_enabled?: boolean;
}

export interface NsqlResponse {
  row_count: number;
  schema: {
    fields: Array<{
      name: string;
      data_type: string;
      nullable: boolean;
      dict_id: number;
      dict_is_ordered: boolean;
    }>;
  };
  data: any[];
  sql: string;
}
