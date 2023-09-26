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

export interface AsyncMultiplePricesRequest {
  symbols: string[];
  convert: string;
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

export interface HLOCPrice {
  timestamp: string;
  price: number;
  high?: number;
  low?: number;
  open?: number;
  close?: number;
}

interface LatestExchangePrices {
  prices?: { [key: string]: string };
  minPrice?: string;
  maxPrice?: string;
  avePrice?: string;
}

export interface LatestPrices {
  [key: string]: LatestExchangePrices;
}

export interface HistoricalPrices {
  [key: string]: HLOCPrice[];
}