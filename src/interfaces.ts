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
  api_key?: string;
  http_url?: string;
  flight_url?: string;
  flight_tls_enabled?: boolean;
}
