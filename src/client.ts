import path from 'path';
import * as https from 'https';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import fetch, { Headers } from 'node-fetch';
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

const httpsAgent = new https.Agent({ keepAlive: true });

const PROTO_PATH = './proto/Flight.proto';
// If we're running in a Next.js environment, we need to adjust the path to the proto file
const PACKAGE_PATH = __dirname.includes('/.next/server/app')
  ? __dirname.replace(/\/\.next\/.*$/, '/node_modules/@spiceai/spice/dist')
  : __dirname;
const fullProtoPath = path.join(PACKAGE_PATH, PROTO_PATH);

const packageDefinition = protoLoader.loadSync(fullProtoPath, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const arrow = grpc.loadPackageDefinition(packageDefinition).arrow as any;
const flightProto = arrow.flight.protocol;

class SpiceClient {
  private _apiKey?: string;
  private _flightUrl: string;
  private _httpUrl: string;
  private _userAgent: string;
  private _flightTlsEnabled: boolean = true;
  private _maxRetries: number = retry.FLIGHT_QUERY_MAX_RETRIES;

  public constructor(params: string | SpiceClientConfig = {}) {
    // support legacy constructor with api_key as first agument
    if (typeof params === 'string') {
      this._apiKey = params;
      this._httpUrl = 'https://data.spiceai.io';
      this._flightUrl = 'flight.spiceai.io:443';
    } else {
      const { apiKey, httpUrl, flightUrl, flightTlsEnabled } = params;

      this._apiKey = apiKey;
      this._httpUrl = httpUrl || 'http://127.0.0.1:8090';
      this._flightUrl = flightUrl || '127.0.0.1:50051';
      this._flightTlsEnabled =
        flightTlsEnabled !== undefined
          ? flightTlsEnabled
          : this._flightUrl.includes('127.0.0.1')
            ? false
            : true;
    }

    this._userAgent = getUserAgent();
  }

  private createClient(meta: any): any {
    if (!this._flightTlsEnabled) {
      return new flightProto.FlightService(
        this._flightUrl,
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
    return new flightProto.FlightService(this._flightUrl, combCreds);
  }

  private async getResultStream(
    queryText: string,
    getFlightClient: ((client: FlightClient) => void) | undefined = undefined
  ): Promise<EventEmitter> {
    const meta = new grpc.Metadata();
    const client: FlightClient = this.createClient(meta);
    meta.set('authorization', 'Bearer ' + this._apiKey);
    meta.set('x-spice-user-agent', this._userAgent);

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

  private async doQueryRequest(
    queryText: string,
    onData: ((data: Table) => void) | undefined = undefined
  ): Promise<Table> {
    let client: FlightClient;

    const resultStream = await this.getResultStream(queryText, (c: FlightClient) => {
      client = c;
    });

    // indicates that data has been partially or fully sent
    let isDataAlreadySent = false;

    let schema: Buffer | undefined;
    let chunks: Buffer[] = [];
    resultStream.on('data', (response: FlightData) => {
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
      resultStream.on('status', (response: FlightStatus) => {
        const table = tableFromIPC(chunks);
        client.close();
        resolve(table);
      });

      resultStream.on('error', (err: any) => {
        client.close();
        if (isDataAlreadySent) retry.dontRetry(err);

        reject(err);
      });
    });
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

  public async refreshDataset(dataset: string) {
    const response = await this.fetchInternal('POST', `/v1/datasets/${dataset}/acceleration/refresh`);
    if (response.status !== 201) {
      const responseText = await response.text();
      throw new Error(`Failed to refresh dataset ${dataset}. Status code: ${response.status}, Response: ${responseText}`);
    }
  }

  private fetchInternal(
    method: string,
    path: string,
    params?: { [key: string]: string }
  ) {
    let url;
    if (params && Object.keys(params).length) {
      url = `${this._httpUrl}${path}?${new URLSearchParams(params)}`;
    } else {
      url = `${this._httpUrl}${path}`;
    }

    const headers = [
      ['Content-Type', 'application/json'],
      ['Accept-Encoding', 'br, gzip, deflate'],
      ['X-Spice-User-Agent', this._userAgent]
    ];

    if (this._apiKey) {
      headers.push(['X-API-Key', this._apiKey || '']);
    }

    if (this._httpUrl.startsWith("https://")) {
      return fetch(url, {
        headers: new Headers(headers),
        agent: httpsAgent,
        method
      });
    } else {
      return fetch(url, {
        headers: new Headers(headers),
        method
      });
    }
  };
}

export { SpiceClient };
