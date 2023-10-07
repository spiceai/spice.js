import path from 'path';
import * as https from 'https';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { EventEmitter } from 'stream';
import { Table, tableFromIPC } from 'apache-arrow';
import {
  FlightClient,
  FlightData,
  FlightStatus,
  FlightInfo,
  DescriptorType,
  Ticket,
  getIpcMessage,
} from './flight';
import {
  AsyncQueryRequest,
  AsyncQueryResponse,
  AsyncMultiplePricesRequest,
  QueryCompleteNotification,
  QueryResultsResponse,
  HistoricalPrices,
  LatestPrices,
} from './interfaces';

const fetch = require('node-fetch');
const httpsAgent = new https.Agent({ keepAlive: true });

const PROTO_PATH = './proto/Flight.proto';
// If we're running in a Next.js environment, we need to adjust the path to the proto file
const PACKAGE_PATH = __dirname.includes('/.next/server/app')
  ? __dirname.replace(/\/\.next\/.*$/, "/node_modules/@spiceai/spice/dist")
  : __dirname;
const fullProtoPath = path.join(PACKAGE_PATH, PROTO_PATH);

const packageDefinition = protoLoader.loadSync(fullProtoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const arrow = grpc.loadPackageDefinition(packageDefinition).arrow as any;
const flight_proto = arrow.flight.protocol;

class SpiceClient {
  private _apiKey: string;
  private _flight_url: string;
  private _http_url: string;

  public constructor(apiKey: string, http_url: string = 'https://data.spiceai.io', flight_url: string = 'flight.spiceai.io:443') {
    this._apiKey = apiKey;
    this._http_url = http_url;
    this._flight_url = flight_url;
  }

  private createClient(meta: any): any {
    const creds = grpc.credentials.createSsl();
    const metaCallback = (_params: any, callback: any) => {
      callback(null, meta);
    };
    const callCreds =
      grpc.credentials.createFromMetadataGenerator(metaCallback);
    const combCreds = grpc.credentials.combineChannelCredentials(
      creds,
      callCreds
    );
    return new flight_proto.FlightService(this._flight_url, combCreds);
  }

  private async getResultStream(
    queryText: string,
    getFlightClient: ((client: FlightClient) => void) | undefined = undefined
  ): Promise<EventEmitter> {
    const meta = new grpc.Metadata();
    const client: FlightClient = this.createClient(meta);
    meta.set('authorization', 'Bearer ' + this._apiKey);

    let queryBuff = Buffer.from(queryText, 'utf8');

    let flightTicket = await new Promise<Ticket>((resolve, reject) => {
      // GetFlightInfo returns FlightInfo that have endpoints with ticket to call DoGet with
      client.GetFlightInfo(
        { type: DescriptorType.CMD, cmd: queryBuff },
        (err: any, result: FlightInfo) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(result.endpoint[0].ticket);
        }
      );
    });

    if (getFlightClient) {
      getFlightClient(client);
    }
    // DoGet return a stream of FlightData
    return client.DoGet(flightTicket);
  }

  public async getLatestPrices(pairs: string[]): Promise<LatestPrices> {
    if (!pairs || pairs.length === 0) {
      throw new Error('At least one pair is required');
    }

    const resp = await this.fetchInternal(`/v1/prices?pair=` + pairs.join(","));
    if (!resp.ok) {
      throw new Error(
        `Failed to get latest prices V1: ${resp.statusText} (${await resp.text()})`
      );
    }

    let data = await resp.json();
    return data as LatestPrices;
}

public async getPrices(pair: string[], startTime?: number, endTime?: number, granularity?: string): Promise<HistoricalPrices> {
    if (!pair || pair.length == 0) {
      throw new Error('Pair is required');
    }
    var url = `/v1/prices/historical?pair=${pair.join(",")}`
    if (startTime) {
      url += `&start=${startTime}`
    }
    if (endTime) {
      url += `&end=${endTime}`
    }
    if (granularity) {
      url += `&granularity=${granularity}`
    }
    const resp = await this.fetchInternal(url);
    if (!resp.ok) {
      throw new Error(
        `Failed to get V1 prices: ${resp.statusText} (${await resp.text()})`
      );
    }

    return resp.json() as Promise<HistoricalPrices>;
}

  public async query(
    queryText: string,
    onData: ((data: Table) => void) | undefined = undefined
  ): Promise<Table> {
    let client: FlightClient;
    const do_get = await this.getResultStream(queryText, (c: FlightClient) => {
      client = c;
    });

    let schema: Buffer | undefined;
    let chunks: Buffer[] = [];
    do_get.on('data', (response: FlightData) => {
      let ipcMessage = getIpcMessage(response);
      chunks.push(ipcMessage);
      if (!schema) {
        schema = ipcMessage;
      } else if (onData) {
        onData(tableFromIPC([schema, ipcMessage]));
      }
    });

    return new Promise((resolve, reject) => {
      do_get.on('status', (response: FlightStatus) => {
        const table = tableFromIPC(chunks);
        client.close();
        resolve(table);
      });
    });
  }

  public async queryAsync(
    queryName: string,
    queryText: string,
    webhookUri: string
  ): Promise<AsyncQueryResponse> {
    if (!queryName) {
      throw new Error('queryName is required');
    }

    if (!queryText) {
      throw new Error('queryText is required');
    }

    if (!webhookUri) {
      throw new Error('webhookUri is required');
    }

    const asyncQueryRequest: AsyncQueryRequest = {
      sql: queryText,
      notifications: [{ name: queryName, type: 'webhook', uri: webhookUri }],
    };

    const resp = await fetch(`${this._http_url}/v0.1/sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this._apiKey,
      },
      body: JSON.stringify(asyncQueryRequest),
      agent: httpsAgent,
    });

    if (!resp.ok) {
      throw new Error(
        `Failed to execute query: ${resp.status} ${
          resp.statusText
        } ${await resp.text()}`
      );
    }

    return resp.json() as Promise<AsyncQueryResponse>;
  }

  public async getQueryResults(
    queryId: string,
    offset?: number,
    limit?: number
  ): Promise<QueryResultsResponse> {
    if (!queryId) {
      throw new Error('queryId is required');
    }
    if (offset && offset < 0) {
      throw new Error('offset must be greater than or equal to 0');
    }
    if (limit && (limit < 0 || limit > 500)) {
      throw new Error(
        'limit must be greater than or equal to 0 and less than or equal to 500'
      );
    }

    const params: { [key: string]: string } = {};

    if (offset || limit) {
      if (offset) {
        params.offset = String(offset);
      }
      if (limit) {
        params.limit = String(limit);
      }
    }

    const resp = await this.fetchInternal(`/v0.1/sql/${queryId}`, params);
    if (!resp.ok) {
      throw new Error(
        `Failed to get query results: ${resp.status} ${
          resp.statusText
        } ${await resp.text()}`
      );
    }

    return resp.json() as Promise<QueryResultsResponse>;
  }

  /*
   * Get query results.
   * @param queryId The query ID.
   * @param allPages If true, get all pages of results. If false, get only the first page.
   * @returns The query results.
   */
  public async getQueryResultsAll(
    queryId: string
  ): Promise<QueryResultsResponse> {
    let offset = 0;
    let limit = 500;
    const queryResponse = await this.getQueryResults(queryId, offset, limit);

    for (let page = 0; page < 1000; page++) {
      if (queryResponse.rowCount <= limit || queryResponse.rowCount <= offset) {
        break;
      }

      offset += limit;
      const resp = await this.getQueryResults(queryId, offset, limit);
      queryResponse.rows.push(...resp.rows);
    }

    return queryResponse;
  }

  /*
   * Get query results from a notification body.
   * @param notificationBody The notification body.
   * @param allPages If true, get all pages of results. If false, get only the first page.
   * @returns The query results.
   */
  public async getQueryResultsFromNotification(
    notificationBody: string,
    allPages: boolean = false
  ): Promise<QueryResultsResponse> {
    if (!notificationBody) {
      throw new Error('notificationBody is required');
    }

    const notification: QueryCompleteNotification =
      JSON.parse(notificationBody);

    if (!notification.queryId || notification.queryId.length != 36) {
      throw new Error('Invalid notification. queryId is missing or invalid.');
    }

    return await this.getQueryResultsAll(notification.queryId);
  }

  private fetchInternal = async (
    path: string,
    params?: { [key: string]: string }
  ) => {
    let url;
    if (params && Object.keys(params).length) {
      url = `${this._http_url}${path}?${new URLSearchParams(params)}`;
    } else {
      url = `${this._http_url}${path}`;
    }

    return await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'Accept-Encoding': 'br, gzip, deflate',
        'X-API-Key': this._apiKey,
      },
      agent: httpsAgent,
    });
  };
}

export { SpiceClient };
