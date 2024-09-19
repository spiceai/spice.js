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
  QueryCompleteNotification,
  QueryResultsResponse,
  type SpiceClientConfig,
} from './interfaces';

import * as retry from './retry';
import { getUserAgent } from './user-agent';

const fetch = require('node-fetch');
const httpsAgent = new https.Agent({ keepAlive: true });

const PROTO_PATH = './proto/Flight.proto';
// If we're running in a Next.js environment, we need to adjust the path to the proto file
const PACKAGE_PATH = __dirname.includes('/.next/server/app')
  ? __dirname.replace(/\/\.next\/.*$/, '/node_modules/@spiceai/spice/dist')
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
  private _apiKey?: string;
  private _flight_url: string;
  private _http_url: string;
  private _user_agent: string;
  private _flight_tls_enabled: boolean = true;
  private _maxRetries: number = retry.FLIGHT_QUERY_MAX_RETRIES;

  public constructor(params: string | SpiceClientConfig = {}) {
    // support legacy constructor with api_key as first agument
    if (typeof params === 'string') {
      this._apiKey = params;
      this._http_url = 'https://data.spiceai.io';
      this._flight_url = 'flight.spiceai.io:443';
    } else {
      const { api_key, http_url, flight_url, flight_tls_enabled } = params;

      this._apiKey = api_key;
      this._http_url = http_url || 'http://localhost:3000';
      this._flight_url = flight_url || 'localhost:50051';
      this._flight_tls_enabled =
        flight_tls_enabled !== undefined
          ? flight_tls_enabled
          : this._flight_url.includes('localhost')
            ? false
            : true;
    }

    this._user_agent = getUserAgent();
  }

  private createClient(meta: any): any {
    if (!this._flight_tls_enabled) {
      return new flight_proto.FlightService(
        this._flight_url,
        grpc.credentials.createInsecure()
      );
    }

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
    meta.set('x-spice-user-agent', this._user_agent);

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

  public async query(
    queryText: string,
    onData: ((data: Table) => void) | undefined = undefined
  ): Promise<Table> {
    return retry.retryWithExponentialBackoff<Table>(async () => {
      return this.doQueryRequest(queryText, onData);
    }, this._maxRetries);
  }

  public async doQueryRequest(
    queryText: string,
    onData: ((data: Table) => void) | undefined = undefined
  ): Promise<Table> {
    let client: FlightClient;

    const do_get = await this.getResultStream(queryText, (c: FlightClient) => {
      client = c;
    });

    // indicates that data has been partially or fully sent
    let isDataAlreadySent = false;

    let schema: Buffer | undefined;
    let chunks: Buffer[] = [];
    do_get.on('data', (response: FlightData) => {
      let ipcMessage = getIpcMessage(response);
      chunks.push(ipcMessage);
      if (!schema) {
        schema = ipcMessage;
      } else if (onData) {
        isDataAlreadySent = true;
        onData(tableFromIPC([schema, ipcMessage]));
      }
    });

    return new Promise((resolve, reject) => {
      do_get.on('status', (response: FlightStatus) => {
        const table = tableFromIPC(chunks);
        client.close();
        resolve(table);
      });

      do_get.on('error', (err: any) => {
        client.close();
        if (isDataAlreadySent) retry.dontRetry(err);

        reject(err);
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
        "X-Spice-User-Agent": this._user_agent,
      },
      body: JSON.stringify(asyncQueryRequest),
      agent: httpsAgent,
    });

    if (!resp.ok) {
      throw new Error(
        `Failed to execute query: ${resp.status} ${resp.statusText
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
        `Failed to get query results: ${resp.status} ${resp.statusText
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

  /*
   * Sets the maximum number of times to retry Query calls. The default is 3
   * @param maxRetries Num of max retries. Setting to 0 will disable retries
   */
  public setMaxRetries(maxRetries: number) {
    if (maxRetries < 0) {
      throw new Error('maxRetries must be greater than or equal to 0');
    }

    this._maxRetries = maxRetries;
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
        "X-Spice-User-Agent": this._user_agent,
      },
      agent: httpsAgent,
    });
  };
}

export { SpiceClient };
