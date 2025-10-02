import path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as https from 'https';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import fetch, { Headers } from 'node-fetch';
import { EventEmitter } from 'stream';
import { Table, tableFromIPC, tableFromArrays } from 'apache-arrow';
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
  RefreshOverrides,
  type SpiceClientConfig,
} from './interfaces';

import * as retry from './retry';
import { getUserAgent } from './user-agent';

const httpsAgent = new https.Agent({ keepAlive: true });

const PROTO_PATH = './proto/Flight.proto';
const PROTO_DOWNLOAD_URL =
  process.env.SPICE_PROTO_URL || 'https://data.spiceai.io/v1/proto/flight';
const PROTO_CACHE_DIR = path.join(os.tmpdir(), 'spiceai-proto-cache');
const PROTO_CACHE_FILE = path.join(PROTO_CACHE_DIR, 'Flight.proto');

// If we're running in a Next.js environment, we need to adjust the path to the proto file
const PACKAGE_PATH = __dirname.includes('.next')
  ? path.join(
      __dirname.substring(0, __dirname.indexOf('.next')),
      './node_modules/@spiceai/spice/',
    )
  : __dirname;
const fullProtoPath = path.join(PACKAGE_PATH, PROTO_PATH);

/**
 * Downloads the Flight.proto file from the remote URL and caches it locally
 */
async function downloadProtoFile(): Promise<string> {
  try {
    console.log('[spice.js] Downloading Flight.proto from remote source...');
    const response = await fetch(PROTO_DOWNLOAD_URL);

    if (!response.ok) {
      throw new Error(
        `Failed to download proto: ${response.status} ${response.statusText}`,
      );
    }

    const protoContent = await response.text();

    // Ensure cache directory exists
    if (!fs.existsSync(PROTO_CACHE_DIR)) {
      fs.mkdirSync(PROTO_CACHE_DIR, { recursive: true });
    }

    // Write to cache
    fs.writeFileSync(PROTO_CACHE_FILE, protoContent);
    console.log('[spice.js] Flight.proto downloaded and cached successfully');

    return PROTO_CACHE_FILE;
  } catch (error: any) {
    console.warn(`[spice.js] Failed to download proto file: ${error.message}`);
    throw error;
  }
}

/**
 * Attempts to load the proto file from multiple sources:
 * 1. Local package path
 * 2. Cached downloaded file
 * 3. Download from remote URL
 */
async function loadProtoFile(): Promise<string | null> {
  // Try local file first
  if (fs.existsSync(fullProtoPath)) {
    return fullProtoPath;
  }

  console.warn(
    '[spice.js] Local Flight.proto not found, attempting to use cached or download...',
  );

  // Try cached file
  if (fs.existsSync(PROTO_CACHE_FILE)) {
    console.log('[spice.js] Using cached Flight.proto');
    return PROTO_CACHE_FILE;
  }

  // Try to download
  try {
    return await downloadProtoFile();
  } catch (error) {
    return null;
  }
}

let flightProto: any = null;
let grpcAvailable = false;

/**
 * Initialize the proto file (sync attempt)
 */
function initializeProto(): void {
  try {
    // Try synchronous load first (normal case)
    const packageDefinition = protoLoader.loadSync(fullProtoPath, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const arrow = grpc.loadPackageDefinition(packageDefinition).arrow as any;
    flightProto = arrow.flight.protocol;
    grpcAvailable = true;
  } catch (error: any) {
    // Silent failure - will attempt download during client initialization
    grpcAvailable = false;
  }
}

// Initialize on module load
initializeProto();

class SpiceClient {
  private _apiKey?: string;
  private _flightUrl: string;
  private _httpUrl: string;
  private _userAgent: string;
  private _flightTlsEnabled: boolean = true;
  private _maxRetries: number = retry.FLIGHT_QUERY_MAX_RETRIES;
  private _useGrpc: boolean = grpcAvailable;
  private _initPromise: Promise<void>;

  public constructor(params: string | SpiceClientConfig = {}) {
    // support legacy constructor with api_key as first agument
    if (typeof params === 'string') {
      this._apiKey = params;
      this._httpUrl = 'https://data.spiceai.io';
      this._flightUrl = 'flight.spiceai.io:443';
      this._userAgent = getUserAgent();
    } else {
      const { apiKey, httpUrl, flightUrl, flightTlsEnabled, userAgent } =
        params;

      this._apiKey = apiKey;
      this._httpUrl = httpUrl || 'http://127.0.0.1:8090';
      this._flightUrl = flightUrl || '127.0.0.1:50051';
      this._flightTlsEnabled =
        flightTlsEnabled !== undefined
          ? flightTlsEnabled
          : !this._flightUrl.includes('127.0.0.1');
      // Prepend the user-supplied user agent (if any) with the default user agent
      this._userAgent = userAgent
        ? `${userAgent} ${getUserAgent()}`
        : getUserAgent();
    }

    // Initialize gRPC during construction
    this._initPromise = this.initializeGrpc();
  }

  /**
   * Initializes gRPC by downloading the proto file if needed.
   * Called during SpiceClient construction.
   */
  private async initializeGrpc(): Promise<void> {
    // If already available, return immediately
    if (this._useGrpc && grpcAvailable && flightProto) {
      return;
    }

    try {
      // Try to load proto file (download if needed)
      const protoPath = await loadProtoFile();

      if (!protoPath) {
        this._useGrpc = false;
        return;
      }

      // Load the proto file
      const packageDefinition = protoLoader.loadSync(protoPath, {
        keepCase: false,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });

      const arrow = grpc.loadPackageDefinition(packageDefinition).arrow as any;
      
      if (!arrow?.flight?.protocol?.FlightService) {
        throw new Error('Invalid proto file structure');
      }

      flightProto = arrow.flight.protocol;
      grpcAvailable = true;
      this._useGrpc = true;
    } catch (error: any) {
      console.warn(
        `[spice.js] gRPC initialization failed: ${error.message}. Using HTTP endpoint.`,
      );
      this._useGrpc = false;
    }
  }

  /**
   * Ensures the client is fully initialized before use.
   * @returns true if gRPC is available, false otherwise.
   */
  private async ensureInitialized(): Promise<boolean> {
    await this._initPromise;
    return this._useGrpc && grpcAvailable && flightProto !== null;
  }

  private createClient(meta: grpc.Metadata): FlightClient {
    if (!flightProto?.FlightService) {
      throw new Error('gRPC Flight protocol not initialized');
    }

    // gRPC channel options
    // Compression support is advertised via metadata (grpc-accept-encoding header)
    // The server will use compression if it supports it
    const channelOptions = {};

    if (!this._flightTlsEnabled) {
      return new flightProto.FlightService(
        this._flightUrl,
        grpc.credentials.createInsecure(),
        channelOptions,
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
      callCreds,
    );
    return new flightProto.FlightService(
      this._flightUrl,
      combCreds,
      channelOptions,
    );
  }

  private async getResultStream(
    queryText: string,
    getFlightClient: ((client: FlightClient) => void) | undefined = undefined,
  ): Promise<EventEmitter> {
    const meta = new grpc.Metadata();
    meta.set('authorization', `Bearer ${this._apiKey || ''}`);
    meta.set('User-Agent', this._userAgent);
    // Advertise that we accept compressed responses
    // The server can choose to compress if it supports it
    meta.set('grpc-accept-encoding', 'gzip,deflate');

    const client: FlightClient = this.createClient(meta);

    const queryBuff = Buffer.from(queryText, 'utf8');

    const flightTicket = await new Promise<Ticket>((resolve, reject) => {
      // GetFlightInfo returns FlightInfo that have endpoints with ticket to call DoGet with
      client.GetFlightInfo(
        { type: DescriptorType.CMD, cmd: queryBuff },
        (err: any, result: FlightInfo) => {
          if (err) {
            reject(err);
            return;
          }
          if (!result?.endpoint?.[0]?.ticket) {
            reject(new Error('Invalid FlightInfo response: missing ticket'));
            return;
          }
          resolve(result.endpoint[0].ticket);
        },
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
    onData: ((data: Table) => void) | undefined = undefined,
  ): Promise<Table> {
    return retry.retryWithExponentialBackoff<Table>(async () => {
      return this.doQueryRequest(queryText, onData);
    }, this._maxRetries);
  }

  private async doQueryRequest(
    queryText: string,
    onData: ((data: Table) => void) | undefined = undefined,
  ): Promise<Table> {
    // Wait for initialization to complete
    const useGrpc = await this.ensureInitialized();

    if (!useGrpc) {
      return this.doHttpQueryRequest(queryText, onData);
    }

    let client: FlightClient | undefined;

    try {
      const resultStream = await this.getResultStream(
        queryText,
        (c: FlightClient) => {
          client = c;
        },
      );

      // indicates that data has been partially or fully sent
      let isDataAlreadySent = false;

      let schema: Buffer | undefined;
      const chunks: Buffer[] = [];
      
      resultStream.on('data', (response: FlightData) => {
        const ipcMessage = getIpcMessage(response);
        chunks.push(ipcMessage);
        if (!schema) {
          schema = ipcMessage;
        } else if (onData) {
          isDataAlreadySent = true;
          onData(tableFromIPC([schema, ipcMessage]));
        }
      });

      return new Promise((resolve, reject) => {
        resultStream.on('status', (_response: FlightStatus) => {
          const table = tableFromIPC(chunks);
          client?.close();
          resolve(table);
        });

        resultStream.on('error', (err: any) => {
          client?.close();
          if (isDataAlreadySent) {
            retry.dontRetry(err);
          }
          reject(err);
        });
      });
    } catch (error) {
      client?.close();
      throw error;
    }
  }

  private async doHttpQueryRequest(
    queryText: string,
    onData: ((data: Table) => void) | undefined = undefined,
  ): Promise<Table> {
    const response = await this.fetchInternal(
      'POST',
      '/v1/sql',
      undefined,
      JSON.stringify({ sql: queryText, parameters: [] }),
      { Accept: 'application/vnd.spiceai.sql.v1+json' },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `HTTP query failed with status ${response.status}: ${errorText}`,
      );
    }

    const contentType = response.headers.get('content-type') || '';

    // Handle streaming JSON responses
    if (contentType.includes('application/json')) {
      const body = await response.text();

      // Try to parse as newline-delimited JSON (streaming)
      const lines = body
        .trim()
        .split('\n')
        .filter((line: string) => line.trim());

      if (lines.length > 0) {
        const allRows: any[] = [];
        let schema: any = null;

        for (const line of lines) {
          try {
            const jsonData = JSON.parse(line);

            // Extract schema from first response
            if (!schema && jsonData.schema) {
              schema = jsonData.schema;
            }

            // Accumulate rows
            if (jsonData.rows && Array.isArray(jsonData.rows)) {
              allRows.push(...jsonData.rows);

              // If onData callback is provided, send partial results
              if (onData && jsonData.rows.length > 0) {
                const partialTable = this.jsonToArrowTable(
                  schema || [],
                  jsonData.rows,
                );
                onData(partialTable);
              }
            }
          } catch (parseError) {
            console.warn(`[spice.js] Failed to parse JSON line: ${parseError}`);
          }
        }

        // Return final table with all rows
        return this.jsonToArrowTable(schema || [], allRows);
      }
    }

    // Fallback: try to parse entire body as single JSON
    const jsonData: any = await response.json();
    const schema = jsonData.schema || [];
    const rows = jsonData.rows || [];

    return this.jsonToArrowTable(schema, rows);
  }

  private jsonToArrowTable(schema: any[], rows: any[]): Table {
    // Convert JSON response to Arrow Table format
    const columns: { [key: string]: any[] } = {};

    // Initialize columns
    schema.forEach((col: any) => {
      columns[col.name] = [];
    });

    // Populate columns with row data
    rows.forEach((row: any) => {
      schema.forEach((col: any, idx: number) => {
        // Handle both array-based and object-based rows
        const value = Array.isArray(row) ? row[idx] : row[col.name];
        columns[col.name].push(value);
      });
    });

    // Use Apache Arrow's tableFromArrays to create the table
    return tableFromArrays(columns);
  }

  /*
   * Sets the maximum number of times to retry Query calls. The default is 3
   * @param maxRetries Num of max retries. Setting to 0 will disable retries
   */
  public setMaxRetries(maxRetries: number): void {
    if (maxRetries < 0) {
      throw new Error('maxRetries must be greater than or equal to 0');
    }

    this._maxRetries = maxRetries;
  }

  public async refreshDataset(
    dataset: string,
    refresh_overrides?: RefreshOverrides,
  ): Promise<void> {
    const overrides: RefreshOverrides = {
      refresh_sql: refresh_overrides?.refresh_sql || null,
      refresh_mode: refresh_overrides?.refresh_mode || null,
      refresh_jitter_max: refresh_overrides?.refresh_jitter_max || null,
    };

    const body = JSON.stringify(overrides);

    const response = await this.fetchInternal(
      'POST',
      `/v1/datasets/${dataset}/acceleration/refresh`,
      undefined,
      body,
    );
    
    if (response.status !== 201) {
      const responseText = await response.text();
      throw new Error(
        `Failed to refresh dataset ${dataset}. Status code: ${response.status}, Response: ${responseText}`,
      );
    }
  }

  private fetchInternal(
    method: string,
    path: string,
    params?: { [key: string]: string },
    body?: string,
    customHeaders?: { [key: string]: string },
  ) {
    const url = params && Object.keys(params).length
      ? `${this._httpUrl}${path}?${new URLSearchParams(params)}`
      : `${this._httpUrl}${path}`;

    const headers = new Headers([
      ['Content-Type', 'application/json'],
      ['Accept-Encoding', 'zstd, br, gzip, deflate'],
      ['User-Agent', this._userAgent],
    ]);

    // Add custom headers
    if (customHeaders) {
      Object.entries(customHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });
    }

    if (this._apiKey) {
      headers.set('X-API-Key', this._apiKey);
    }

    const fetchOptions: RequestInit = {
      headers,
      method,
      body,
    };

    if (this._httpUrl.startsWith('https://')) {
      fetchOptions.agent = httpsAgent;
    }

    return fetch(url, fetchOptions);
  }
}

export { SpiceClient };
        body,
      });
    } else {
      return fetch(url, {
        headers: new Headers(headers),
        method,
        body,
      });
    }
  }
}

export { SpiceClient };
