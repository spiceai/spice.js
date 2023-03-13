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

export interface HistoricalPrices {
  pair: string;
  prices: {
    timestamp: string;
    price: number;
  }[];
}

export interface LatestPrice {
  pair: string;
  minPrice: string;
  maxPrice: string;
  avePrice: string;
}
