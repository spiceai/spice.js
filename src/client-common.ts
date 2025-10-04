/**
 * Common SpiceClient implementation supporting both Node.js and Browser environments
 */

import { Table, tableFromIPC, tableFromArrays } from 'apache-arrow';
import type { PlatformAdapter } from './platform/types';
import { FlightData, FlightStatus, getIpcMessage } from './flight';
import {
  type SpiceClientConfig,
  type SqlJsonResponse,
  type RefreshAccelerationOptions,
  type RefreshAccelerationResponse,
  type NsqlOptions,
  type NsqlResponse,
} from './interfaces';
import type { GrpcFlightClient } from './grpc/client.node';

// Retry will be imported by the platform-specific entry point
export interface RetryModule {
  FLIGHT_QUERY_MAX_RETRIES: number;
  dontRetry(err: any): void;
  retryWithExponentialBackoff<T>(
    operation: any,
    maxRetries: number,
  ): Promise<T>;
}

export class SpiceClient {
  private _apiKey?: string;
  private _flightUrl: string;
  private _httpUrl: string;
  private _userAgent: string;
  private _flightTlsEnabled: boolean = true;
  private _maxRetries: number;
  private _customHeaders?: { [key: string]: string };
  private _platform: PlatformAdapter;
  private _grpcClient: GrpcFlightClient | null = null;
  private _retry: RetryModule;

  public constructor(
    params: string | SpiceClientConfig = {},
    platform: PlatformAdapter,
    retry: RetryModule,
    GrpcClientClass?: typeof GrpcFlightClient,
  ) {
    this._retry = retry;
    this._maxRetries = retry.FLIGHT_QUERY_MAX_RETRIES;
    this._platform = platform;

    // support legacy constructor with api_key as first argument
    if (typeof params === 'string') {
      this._apiKey = params;
      this._httpUrl = 'https://data.spiceai.io';
      this._flightUrl = 'flight.spiceai.io:443';
      this._userAgent = platform.getUserAgent();
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

      this._flightTlsEnabled =
        flightTlsEnabled !== undefined ? flightTlsEnabled : !isLocalhost;

      // Prepend the user-supplied user agent (if any) with the default user agent
      this._userAgent = userAgent
        ? `${userAgent} ${platform.getUserAgent()}`
        : platform.getUserAgent();
      this._customHeaders = customHeaders;
    }

    // Initialize gRPC client if platform supports it
    if (platform.supportsGrpc() && GrpcClientClass) {
      this._grpcClient = new GrpcClientClass(
        this._apiKey,
        this._flightUrl,
        this._userAgent,
        this._flightTlsEnabled,
      );
    }
  }

  private async doQueryRequest(
    queryText: string,
    onData: ((data: Table) => void) | undefined = undefined,
  ): Promise<Table> {
    // Try gRPC if available
    if (this._grpcClient) {
      const useGrpc = await this._grpcClient.ensureInitialized();
      if (useGrpc) {
        return this.doGrpcQueryRequest(queryText, onData);
      }
    }

    // Fallback to HTTP
    return this.doHttpQueryRequest(queryText, onData);
  }

  private async doGrpcQueryRequest(
    queryText: string,
    onData: ((data: Table) => void) | undefined = undefined,
  ): Promise<Table> {
    if (!this._grpcClient) {
      throw new Error('gRPC client not initialized');
    }

    try {
      const resultStream = await this._grpcClient.executeQuery(queryText);

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
          resolve(table);
        });

        resultStream.on('error', (err: any) => {
          if (isDataAlreadySent) {
            this._retry.dontRetry(err);
          }
          reject(err);
        });
      });
    } catch (error) {
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
      queryText,
      {
        'Content-Type': 'text/plain',
        Accept: 'application/vnd.spiceai.sql.v1+json',
      },
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

      if (lines.length > 1) {
        // Multiple lines = streaming response
        const allRows: any[] = [];
        let schema: any = null;

        for (const line of lines) {
          try {
            const jsonData = JSON.parse(line);

            // Extract schema from first response
            if (!schema && jsonData.schema) {
              // Handle schema - it may be an object with fields property or an array
              schema = jsonData.schema.fields || jsonData.schema;
            }

            // Accumulate rows (support both 'rows' and 'data' field names)
            const rowsData = jsonData.rows || jsonData.data;
            if (rowsData && Array.isArray(rowsData)) {
              allRows.push(...rowsData);

              // If onData callback is provided, send partial results
              if (onData && rowsData.length > 0) {
                const partialTable = this.jsonToArrowTable(
                  schema || [],
                  rowsData,
                );
                onData(partialTable);
              }
            }
          } catch (parseError) {
            console.warn(`[spice.js] Failed to parse JSON line: ${parseError}`);
          }
        }

        // Return final table with all rows
        console.log('[DEBUG] Streaming response:', {
          hasSchema: !!schema,
          schemaLength: Array.isArray(schema) ? schema.length : 'not array',
          totalRows: allRows.length,
          linesProcessed: lines.length,
        });
        return this.jsonToArrowTable(schema || [], allRows);
      }

      // Single line or entire response = parse as single JSON object
      // Note: body was already read with response.text() above
      try {
        const jsonData: any = JSON.parse(body);

        if (!jsonData) {
          throw new Error('Empty response body');
        }

        // Handle schema - it may be an object with fields property or an array
        const schema = jsonData.schema?.fields || jsonData.schema || [];
        // Support both 'rows' and 'data' field names (sqlJson format uses 'data')
        const rows = jsonData.rows || jsonData.data || [];

        console.log('[DEBUG] Non-streaming response:', {
          hasSchema: !!jsonData.schema,
          schemaType: typeof jsonData.schema,
          schemaLength: Array.isArray(schema) ? schema.length : 'not array',
          hasRows: !!(jsonData.rows || jsonData.data),
          rowsLength: Array.isArray(rows) ? rows.length : 'not array',
          jsonDataKeys: Object.keys(jsonData),
        });

        return this.jsonToArrowTable(schema, rows);
      } catch (error) {
        throw new Error(
          `Failed to parse query response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    // Should not reach here
    throw new Error('Unexpected response format');
  }

  private jsonToArrowTable(schema: any[], rows: any[]): Table {
    // Convert JSON response to Arrow Table format
    const columns: { [key: string]: any[] } = {};

    // Ensure schema is an array
    if (!Array.isArray(schema)) {
      throw new Error('Invalid schema: expected an array');
    }

    // Initialize columns
    schema.forEach((col: any) => {
      columns[col.name] = [];
    });

    // Ensure rows is an array
    if (!Array.isArray(rows)) {
      throw new Error('Invalid rows: expected an array');
    }

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
    return this._retry.retryWithExponentialBackoff<Table>(
      () => this.doQueryRequest(queryText, onData),
      this._maxRetries,
    );
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
  async nsql(query: string, options?: NsqlOptions): Promise<NsqlResponse> {
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

  /**
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

  /**
   * Checks if the Spice runtime is ready to accept requests.
   * This endpoint is authenticated and requires an API key.
   * @returns Promise resolving to true if ready, false otherwise
   */
  async isSpiceReady(): Promise<boolean> {
    if (!this._httpUrl) {
      throw new Error('HTTP URL is required for ready check');
    }

    try {
      const response = await this.fetchInternal('GET', '/v1/ready');
      if (!response.ok) {
        return false;
      }
      const text = await response.text();
      return text.trim().toLowerCase() === 'ready';
    } catch (error) {
      return false;
    }
  }

  /**
   * Checks the health status of the Spice runtime.
   * This endpoint is unauthenticated and does not require an API key.
   * @returns Promise resolving to true if healthy, false otherwise
   */
  async isSpiceHealthy(): Promise<boolean> {
    if (!this._httpUrl) {
      throw new Error('HTTP URL is required for health check');
    }

    try {
      // Don't include API key for health check
      const url = `${this._httpUrl}/health`;
      const headers: { [key: string]: string } = {
        'User-Agent': this._userAgent,
      };

      // Include custom headers if they exist
      if (this._customHeaders) {
        Object.assign(headers, this._customHeaders);
      }

      const response = await this._platform.fetch(url, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        return false;
      }
      const text = await response.text();
      return text.trim().toLowerCase() === 'ok';
    } catch (error) {
      return false;
    }
  }

  private async fetchInternal(
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

    const headers: { [key: string]: string } = {
      'Content-Type': 'application/json',
      'Accept-Encoding': 'zstd, br, gzip, deflate',
      'User-Agent': this._userAgent,
    };

    // Add instance-level custom headers
    if (this._customHeaders) {
      Object.entries(this._customHeaders).forEach(([key, value]) => {
        headers[key] = value;
      });
    }

    // Add custom headers (will override instance-level headers if same key)
    if (customHeaders) {
      Object.entries(customHeaders).forEach(([key, value]) => {
        headers[key] = value;
      });
    }

    if (this._apiKey) {
      headers['X-API-Key'] = this._apiKey;
    }

    return this._platform.fetch(url, {
      method,
      headers,
      body,
    });
  }
}
