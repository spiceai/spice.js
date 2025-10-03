import path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as protobuf from 'protobufjs';
import fetch, {
  Headers,
  RequestInit as NodeFetchRequestInit,
} from 'node-fetch';
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
  type SpiceClientConfig,
  type SqlJsonResponse,
  type RefreshAccelerationOptions,
  type RefreshAccelerationResponse,
  type NsqlOptions,
  type NsqlResponse,
} from './interfaces';

import * as retry from './retry';
import { getUserAgent } from './user-agent';

const httpsAgent = new https.Agent({ keepAlive: true });

const PROTO_PATH = './proto/Flight.proto';
const PROTO_DOWNLOAD_URL =
  process.env.SPICE_PROTO_URL || 'https://data.spiceai.io/v1/proto/flight';

// If we're running in a Next.js environment, we need to adjust the path to the proto file
const PACKAGE_PATH = __dirname.includes('.next')
  ? path.join(
      __dirname.substring(0, __dirname.indexOf('.next')),
      './node_modules/@spiceai/spice/',
    )
  : __dirname;
const fullProtoPath = path.join(PACKAGE_PATH, PROTO_PATH);

// In-memory proto content cache
let protoContent: string | null = null;

/**
 * Downloads the Flight.proto file from the remote URL and keeps it in memory
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

    const content = await response.text();
    console.log('[spice.js] Flight.proto downloaded successfully');

    return content;
  } catch (error: any) {
    console.warn(`[spice.js] Failed to download proto file: ${error.message}`);
    throw error;
  }
}

/**
 * Loads proto content from local file or downloads it
 * Returns the proto content as a string
 */
async function loadProtoContent(): Promise<string | null> {
  // Try local file first
  if (fs.existsSync(fullProtoPath)) {
    return fs.readFileSync(fullProtoPath, 'utf-8');
  }

  console.warn(
    '[spice.js] Local Flight.proto not found, attempting to download...',
  );

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
 * Loads proto definition from content in memory using protobufjs
 */
function loadProtoFromContent(content: string): any {
  try {
    // Parse the proto content directly in memory using protobufjs
    const root = protobuf.parse(content, { keepCase: false }).root;

    // Convert to JSON descriptor
    const json = root.toJSON();

    // Load from JSON
    const packageDefinition = protoLoader.fromJSON(json, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const arrow = grpc.loadPackageDefinition(packageDefinition).arrow as any;
    return arrow.flight.protocol;
  } catch (error: any) {
    console.error(
      '[spice.js] Failed to load proto from content:',
      error.message,
    );
    throw error;
  }
} /**
 * Initialize the proto file (sync attempt)
 */
function initializeProto(): void {
  try {
    // Try synchronous load from local file first (normal case)
    if (fs.existsSync(fullProtoPath)) {
      const content = fs.readFileSync(fullProtoPath, 'utf-8');
      flightProto = loadProtoFromContent(content);
      protoContent = content;
      grpcAvailable = true;
    }
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
  private _customHeaders?: { [key: string]: string };

  public constructor(params: string | SpiceClientConfig = {}) {
    // support legacy constructor with api_key as first agument
    if (typeof params === 'string') {
      this._apiKey = params;
      this._httpUrl = 'https://data.spiceai.io';
      this._flightUrl = 'flight.spiceai.io:443';
      this._userAgent = getUserAgent();
    } else {
      const {
        apiKey,
        httpUrl,
        flightUrl,
        flightTlsEnabled,
        userAgent,
        customHeaders,
      } = params;

      this._apiKey = apiKey;
      this._httpUrl = httpUrl || 'http://127.0.0.1:8090';
      this._flightUrl = flightUrl || '127.0.0.1:50051';

      // More explicit TLS check to avoid false positives
      const isLocalhost =
        this._flightUrl.startsWith('127.0.0.1:') ||
        this._flightUrl === '127.0.0.1' ||
        this._flightUrl.startsWith('localhost:') ||
        this._flightUrl === 'localhost';

      this._flightTlsEnabled = !isLocalhost;

      // Prepend the user-supplied user agent (if any) with the default user agent
      this._userAgent = userAgent
        ? `${userAgent} ${getUserAgent()}`
        : getUserAgent();
      this._customHeaders = customHeaders;
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
      // Check if we already have proto content in memory
      if (!protoContent) {
        protoContent = await loadProtoContent();
      }

      if (!protoContent) {
        this._useGrpc = false;
        return;
      }

      // Load the proto from content
      const proto = loadProtoFromContent(protoContent);

      if (!proto?.FlightService) {
        throw new Error('Invalid proto file structure');
      }

      flightProto = proto;
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

  /**
   * Executes a SQL query and returns results as Arrow Tables.
   * @param queryText - The SQL query to execute
   * @param onData - Optional callback for streaming results
   * @returns Promise resolving to the final Arrow Table
   */
  async sql(
    queryText: string,
    onData?: ((data: Table) => void) | undefined,
  ): Promise<Table> {
    return this.doQueryRequest(queryText, onData);
  }

  /**
   * @deprecated Use sql() instead. This method will be removed in a future version.
   */
  async query(
    queryText: string,
    onData?: ((data: Table) => void) | undefined,
  ): Promise<Table> {
    return this.sql(queryText, onData);
  }

  /**
   * Executes a SQL query and returns results as JSON with schema metadata.
   * @param queryText - The SQL query to execute
   * @returns Promise resolving to an object containing row_count, schema, data, and execution_time_ms
   */
  async sqlJson(queryText: string): Promise<SqlJsonResponse> {
    const startTime = Date.now();
    const allRows: any[] = [];
    let schema: any = null;

    await this.sql(queryText, (table) => {
      // Capture schema from first chunk
      if (!schema) {
        schema = {
          fields: table.schema.fields.map((field) => ({
            name: field.name,
            data_type: field.type.toString(),
            nullable: field.nullable,
            dict_id: 0,
            dict_is_ordered: false,
          })),
        };
      }

      // Convert each chunk's rows
      const resultArray = table.toArray();
      resultArray.forEach((row: any) => {
        const plainRow: any = {};
        for (const key in row) {
          const value = row[key];
          // Convert BigInt to string for JSON serialization
          plainRow[key] = typeof value === 'bigint' ? value.toString() : value;
        }
        allRows.push(plainRow);
      });
    });

    const executionTime = Date.now() - startTime;

    return {
      row_count: allRows.length,
      schema: schema || { fields: [] },
      data: allRows,
      execution_time_ms: executionTime,
    };
  }

  /**
   * Execute a natural language query (NSQL) and return the results with the generated SQL
   * @param query - The natural language query to convert to SQL
   * @param options - Optional configuration for the NSQL request
   * @returns Promise resolving to the query results with the generated SQL
   */
  async nsql(
    query: string,
    options?: NsqlOptions,
  ): Promise<NsqlResponse> {
    if (!this._httpUrl) {
      throw new Error('HTTP URL is required for NSQL operation');
    }

    const request = {
      query,
      ...options,
    };

    const response = await this.fetchInternal(
      'POST',
      '/v1/nsql',
      undefined,
      JSON.stringify(request),
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `NSQL request failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const result = await response.json();
    return result as NsqlResponse;
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

  /**
   * Triggers an on-demand refresh for an accelerated dataset.
   * @param dataset - The name of the dataset to refresh
   * @param options - Optional refresh configuration
   * @returns Promise resolving to the refresh response message
   */
  async refreshAcceleration(
    dataset: string,
    options?: RefreshAccelerationOptions,
  ): Promise<RefreshAccelerationResponse> {
    if (!this._httpUrl) {
      throw new Error('HTTP URL is required for refresh operation');
    }

    const url = `${this._httpUrl}/v1/datasets/${encodeURIComponent(dataset)}/acceleration/refresh`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': this._userAgent,
    };

    if (this._apiKey) {
      headers['X-API-Key'] = this._apiKey;
    }

    if (this._customHeaders) {
      Object.assign(headers, this._customHeaders);
    }

    const body = JSON.stringify(options || {});

    const response = await this.fetchInternal(
      'POST',
      `/v1/datasets/${encodeURIComponent(dataset)}/acceleration/refresh`,
      undefined,
      body,
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to refresh dataset '${dataset}': ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    return await response.json();
  }

  private fetchInternal(
    method: string,
    path: string,
    params?: { [key: string]: string },
    body?: string,
    customHeaders?: { [key: string]: string },
  ) {
    const url =
      params && Object.keys(params).length
        ? `${this._httpUrl}${path}?${new URLSearchParams(params)}`
        : `${this._httpUrl}${path}`;

    const headers = new Headers([
      ['Content-Type', 'application/json'],
      ['Accept-Encoding', 'zstd, br, gzip, deflate'],
      ['User-Agent', this._userAgent],
    ]);

    // Add instance-level custom headers
    if (this._customHeaders) {
      Object.entries(this._customHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });
    }

    // Add custom headers (will override instance-level headers if same key)
    if (customHeaders) {
      Object.entries(customHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });
    }

    if (this._apiKey) {
      headers.set('X-API-Key', this._apiKey);
    }

    const fetchOptions: NodeFetchRequestInit = {
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
