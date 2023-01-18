import path from 'path';
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
  QueryResultsResponse as QueryStatusResponse,
} from './interfaces';

const HTTP_DATA_PATH = 'https://data.spiceai.io/v0.1/sql';
const FLIGHT_PATH = 'flight.spiceai.io:443';

const PROTO_PATH = './proto/Flight.proto';
const fullProtoPath = path.join(__dirname, PROTO_PATH);

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
  private _url: string;
  public constructor(apiKey: string, url: string = FLIGHT_PATH) {
    this._apiKey = apiKey;
    this._url = url;
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
    return new flight_proto.FlightService(this._url, combCreds);
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

    const resp = await fetch(HTTP_DATA_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this._apiKey,
      },
      body: JSON.stringify(asyncQueryRequest),
    });

    if (!resp.ok) {
      throw new Error(
        `Failed to execute query: ${resp.status} ${
          resp.statusText
        } ${await resp.text()}`
      );
    }

    return resp.json();
  }

  public async getQueryResults(queryId: string): Promise<QueryResultsResponse> {
    if (!queryId) {
      throw new Error('queryId is required');
    }

    const resp = await fetch(`${HTTP_DATA_PATH}/${queryId}`, {
      method: 'GET',
      headers: {
        'Accept-Encoding': 'br, gzip, deflate',
        'X-API-Key': this._apiKey,
      },
    });

    if (!resp.ok) {
      throw new Error(
        `Failed to get query results: ${resp.status} ${
          resp.statusText
        } ${await resp.text()}`
      );
    }

    return resp.json();
  }

  public async getQueryResultsFromNotification(
    notificationBody: string
  ): Promise<QueryResultsResponse> {
    if (!notificationBody) {
      throw new Error('notificationBody is required');
    }

    const notification: QueryCompleteNotification =
      JSON.parse(notificationBody);

    if (!notification.queryId || notification.queryId.length != 36) {
      throw new Error('Invalid notification. queryId is missing or invalid.');
    }

    return this.getQueryResults(notification.queryId);
  }
}

export { SpiceClient };
