/**
 * Common SpiceClient implementation supporting both Node.js and Browser environments
 */

import { Table, tableFromIPC } from 'apache-arrow';
import type { PlatformAdapter } from './platform/types';
import { FlightData, FlightStatus, getIpcMessage } from './flight';
import {
  type SpiceClientConfig,
  type SqlV1JsonResponse,
  type RefreshAccelerationOptions,
  type RefreshAccelerationResponse,
  type NsqlOptions,
  type NsqlResponse,
} from './interfaces';
import type { GrpcFlightClient } from './grpc/client.node';
import {
  jsonToArrowTable,
  convertToSqlV1Format,
  normalizeSchema,
  serializeArrowField,
} from './arrow-utils';

// Retry will be imported by the platform-specific entry point
export interface RetryModule {
  FLIGHT_QUERY_MAX_RETRIES: number;
  dontRetry(err: any): void;
  retryWithExponentialBackoff<T>(
    operation: any,
    maxRetries: number,
  ): Promise<T>;
}

/**
 * Helper function to recursively convert Arrow structures to plain JavaScript
 */
function convertArrowValue(value: any, field?: any): any {
  if (value === null || value === undefined) {
    return value;
  }

  // Handle Date objects - check if field has timezone info
  if (value instanceof Date) {
    const hasTimezone = field?.type?.timezone != null;
    let isoString = value.toISOString();
    // Remove .000 milliseconds if present (before removing Z)
    isoString = isoString.replace(/\.000Z$/, 'Z');
    // Only remove 'Z' suffix if no timezone specified
    if (!hasTimezone) {
      isoString = isoString.replace(/Z$/, '');
    }
    return isoString;
  }

  // Check if it's an Arrow Vector (has toArray method and length property)
  // Arrow Vectors have specific characteristics that distinguish them from regular objects
  if (
    typeof value === 'object' &&
    typeof value.toArray === 'function' &&
    typeof value.length === 'number' &&
    typeof value.get === 'function'
  ) {
    // Convert Arrow Vector to JavaScript array
    const arr = value.toArray();
    // Pass field.type.children[0] for list element types
    const childField = field?.type?.children?.[0];
    return arr.map((item: any) => convertArrowValue(item, childField));
  }

  // Handle plain objects recursively (for Struct types)
  // Only convert if it's a plain object, not Date or other built-in types
  if (
    typeof value === 'object' &&
    value.constructor === Object &&
    !Array.isArray(value)
  ) {
    const converted: any = {};
    // Get field mapping for struct children
    const fieldMap = field?.type?.children
      ? new Map(field.type.children.map((f: any) => [f.name, f]))
      : null;

    for (const key in value) {
      const childField = fieldMap?.get(key);
      converted[key] = convertArrowValue(value[key], childField);
    }
    return converted;
  }

  return value;
}

/**
 * Wraps an Arrow Table to handle type conversions in toArray()
 * - Decimal types: Converts DecimalBigNum objects to numbers
 * - Timestamp types: Converts Date objects to ISO 8601 strings (without Z for timestamps without timezone)
 * - List types: Converts Arrow Vector objects to JavaScript arrays
 */
function wrapTableForDecimalConversion(table: Table): Table {
  const originalToArray = table.toArray.bind(table);

  // Override toArray to convert special types
  (table as any).toArray = function () {
    const rows = originalToArray();

    // Check which fields need conversion
    const decimalFields = table.schema.fields.filter((f) =>
      f.type.toString().startsWith('Decimal'),
    );
    const timestampFields = table.schema.fields.filter(
      (f) =>
        f.type.toString().startsWith('Timestamp') ||
        f.type.toString().startsWith('Date'),
    );
    const listFields = table.schema.fields.filter(
      (f) =>
        f.type.toString().startsWith('List<') || f.type.toString() === 'List',
    );
    const structFields = table.schema.fields.filter(
      (f) =>
        f.type.toString().startsWith('Struct<') ||
        f.type.toString() === 'Struct',
    );

    // If no special fields, return rows as-is to avoid unnecessary processing
    if (
      decimalFields.length === 0 &&
      timestampFields.length === 0 &&
      listFields.length === 0 &&
      structFields.length === 0
    ) {
      return rows;
    }

    // Process rows only if we have fields that need conversion
    return rows.map((row: any) => {
      let hasConversions = false;
      let convertedRow = row;

      // Only create a new row object if we actually need to convert something
      const ensureConvertedRow = () => {
        if (!hasConversions) {
          convertedRow = { ...row };
          hasConversions = true;
        }
      };

      // Convert decimal values
      for (const field of decimalFields) {
        const value = row[field.name];
        if (
          value !== null &&
          value !== undefined &&
          value.constructor?.name === 'DecimalBigNum'
        ) {
          ensureConvertedRow();
          try {
            const decimalStr = value.toString();
            const scale = field.type.scale || 0;
            convertedRow[field.name] =
              scale > 0
                ? parseFloat(decimalStr) / Math.pow(10, scale)
                : parseFloat(decimalStr);
          } catch (error) {
            convertedRow[field.name] = value.toString();
          }
        }
      }

      // Convert timestamp/date values to ISO 8601 strings
      for (const field of timestampFields) {
        const value = row[field.name];
        if (value !== null && value !== undefined) {
          const hasTimezone = field.type.timezone != null;
          if (value instanceof Date) {
            ensureConvertedRow();
            let isoString = value.toISOString();
            // Remove .000 milliseconds if present (before removing Z)
            isoString = isoString.replace(/\.000Z$/, 'Z');
            // Remove 'Z' suffix for timestamps without timezone
            if (!hasTimezone) {
              isoString = isoString.replace(/Z$/, '');
            }
            convertedRow[field.name] = isoString;
          } else if (typeof value === 'number') {
            ensureConvertedRow();
            // Handle numeric timestamps
            const date = new Date(value);
            let isoString = date.toISOString();
            // Remove .000 milliseconds if present (before removing Z)
            isoString = isoString.replace(/\.000Z$/, 'Z');
            if (!hasTimezone) {
              isoString = isoString.replace(/Z$/, '');
            }
            convertedRow[field.name] = isoString;
          }
        }
      }

      // Convert List/Struct fields (Arrow Vectors to JavaScript arrays/objects)
      for (const field of listFields.concat(structFields)) {
        const value = row[field.name];
        if (value !== null && value !== undefined) {
          const converted = convertArrowValue(value, field);
          // Only update if conversion actually changed the value
          if (converted !== value) {
            ensureConvertedRow();
            convertedRow[field.name] = converted;
          }
        }
      }

      return convertedRow;
    });
  };

  return table;
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
  private _isSpiceCloud: boolean = false;
  private _flightOnly: boolean = false;

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
      this._flightOnly = false;
    } else {
      const {
        apiKey,
        httpUrl,
        flightUrl,
        flightTlsEnabled,
        userAgent,
        customHeaders,
        flightOnly,
      } = params;

      this._apiKey = apiKey;
      this._httpUrl = httpUrl || 'http://127.0.0.1:8090';
      this._flightUrl = flightUrl || '127.0.0.1:50051';
      this._flightOnly = flightOnly || false;

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

    // Determine if this is Spice Cloud endpoint (compute once)
    try {
      const url = new URL(this._httpUrl);
      const hostname = url.hostname.toLowerCase();
      this._isSpiceCloud = hostname.endsWith('.spiceai.io');
    } catch {
      this._isSpiceCloud = false;
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

    // Log runtime configuration
    this.logConfiguration();
  }

  private logConfiguration(): void {
    const platformName = this._platform.getPlatformName();
    const supportsGrpc = this._platform.supportsGrpc();

    // Determine transport mode
    let transportMode: string;
    if (supportsGrpc && this._grpcClient) {
      transportMode = this._flightOnly
        ? `Arrow Flight (gRPC) only`
        : `Arrow Flight (gRPC) with HTTP fallback`;
    } else if (supportsGrpc && !this._grpcClient) {
      transportMode = 'HTTP only (gRPC client not initialized)';
    } else {
      transportMode = 'HTTP only';
    }

    // Determine endpoint (use cached value)
    const endpoint = this._isSpiceCloud
      ? 'Spice Cloud (data.spiceai.io)'
      : this._httpUrl;

    // Build configuration message
    const configLines = [
      `🌶️  Spice.js initialized`,
      `   Platform: ${platformName}`,
      `   Transport: ${transportMode}`,
      `   Endpoint: ${endpoint}`,
    ];

    if (this._grpcClient && this._flightUrl) {
      configLines.push(
        `   Flight URL: ${this._flightUrl}${this._flightTlsEnabled ? ' (TLS)' : ''}`,
      );
    }

    if (this._apiKey) {
      configLines.push(`   Auth: API Key configured`);
    }

    if (this._customHeaders && Object.keys(this._customHeaders).length > 0) {
      configLines.push(
        `   Custom Headers: ${Object.keys(this._customHeaders).length} header(s)`,
      );
    }

    console.debug(configLines.join('\n'));
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

      // If flightOnly mode is enabled and gRPC failed, throw error
      if (this._flightOnly) {
        throw new Error(
          'gRPC Arrow Flight connection failed and flightOnly mode is enabled. Cannot fallback to HTTP.',
        );
      }
    }

    // If flightOnly mode is enabled but no gRPC client, throw error
    if (this._flightOnly) {
      throw new Error(
        'flightOnly mode is enabled but gRPC client is not available on this platform',
      );
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
          const chunkTable = wrapTableForDecimalConversion(
            tableFromIPC([schema, ipcMessage]),
          );
          onData(chunkTable);
        }
      });

      return new Promise((resolve, reject) => {
        resultStream.on('status', (_response: FlightStatus) => {
          const table = wrapTableForDecimalConversion(tableFromIPC(chunks));
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
    // Use appropriate Accept header based on endpoint (use cached value)
    const acceptHeader = this._isSpiceCloud
      ? 'application/vnd.spiceai.sql.v1+json' // data.spiceai.io returns schema with 'data' field
      : 'application/json'; // OSS returns plain JSON array

    const response = await this.fetchInternal(
      'POST',
      '/v1/sql',
      undefined,
      queryText,
      {
        'Content-Type': 'text/plain',
        Accept: acceptHeader,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `HTTP query failed with status ${response.status}: ${errorText}`,
      );
    }

    const body = await response.text();

    // Try to parse as newline-delimited JSON (streaming)
    const lines = body
      .trim()
      .split('\n')
      .filter((line: string) => line.trim());

    // Handle streaming responses (multiple JSON objects)
    if (lines.length > 1) {
      return this.parseStreamingResponse(lines, onData, this._isSpiceCloud);
    }

    // Handle single response
    return this.parseSingleResponse(body, onData, this._isSpiceCloud);
  }

  private parseStreamingResponse(
    lines: string[],
    onData: ((data: Table) => void) | undefined,
    isSpiceAI: boolean,
  ): Table {
    const allRows: any[] = [];
    let schema: any[] = [];

    for (const line of lines) {
      try {
        const jsonData = JSON.parse(line);
        const sqlV1 = convertToSqlV1Format(jsonData, isSpiceAI);

        // Extract schema from first response
        if (schema.length === 0) {
          schema = normalizeSchema(sqlV1.schema);
        }

        // Accumulate rows
        if (sqlV1.data.length > 0) {
          allRows.push(...sqlV1.data);

          // Send partial results if callback provided
          if (onData) {
            const partialTable = wrapTableForDecimalConversion(
              jsonToArrowTable(schema, sqlV1.data),
            );
            onData(partialTable);
          }
        }
      } catch (parseError) {
        console.warn(`[spice.js] Failed to parse JSON line: ${parseError}`);
      }
    }

    return wrapTableForDecimalConversion(jsonToArrowTable(schema, allRows));
  }

  private parseSingleResponse(
    body: string,
    onData: ((data: Table) => void) | undefined,
    isSpiceAI: boolean,
  ): Table {
    try {
      const jsonData = JSON.parse(body);
      const sqlV1 = convertToSqlV1Format(jsonData, isSpiceAI);
      const schema = normalizeSchema(sqlV1.schema);
      const rows = sqlV1.data;

      // Send results via callback if provided
      if (onData && rows.length > 0) {
        const table = jsonToArrowTable(schema, rows);
        onData(table);
      }

      return wrapTableForDecimalConversion(jsonToArrowTable(schema, rows));
    } catch (error) {
      throw new Error(
        `Failed to parse query response: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
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
   * Uses gRPC/Arrow if available, otherwise falls back to HTTP.
   * @param queryText - The SQL query to execute
   * @returns Promise resolving to an object containing row_count, schema, data, and execution_time_ms
   */
  async sqlJson(queryText: string): Promise<SqlV1JsonResponse> {
    const startTime = Date.now();

    // Check if we should use gRPC/Arrow
    let useGrpc = false;
    if (this._grpcClient) {
      useGrpc = await this._grpcClient.ensureInitialized();

      // If flightOnly mode is enabled and gRPC failed, throw error
      if (!useGrpc && this._flightOnly) {
        throw new Error(
          'gRPC Arrow Flight connection failed and flightOnly mode is enabled. Cannot fallback to HTTP.',
        );
      }
    }

    // If flightOnly mode is enabled but no gRPC client, throw error
    if (this._flightOnly && !useGrpc) {
      throw new Error(
        'flightOnly mode is enabled but gRPC client is not available on this platform',
      );
    }

    if (useGrpc) {
      // gRPC/Arrow mode: Use Arrow and convert to JSON
      const allRows: any[] = [];
      let schema: any = null;
      let fields: any[] = [];

      await this.sql(queryText, (table) => {
        // Capture schema from first chunk
        if (!schema) {
          schema = {
            fields: table.schema.fields.map((field) =>
              serializeArrowField(field),
            ),
          };
          fields = table.schema.fields;
        }

        // Helper function to recursively convert values, handling nested structures
        const convertValue = (value: any, field: any): any => {
          // Handle null/undefined
          if (value === null || value === undefined) {
            return value;
          }

          // Get type information
          const typeStr = field.type.toString();
          const hasTimezone = field.type.timezone != null;

          // Handle Apache Arrow Decimal types (DecimalBigNum)
          // These need to be converted using their scale factor
          if (
            typeStr.startsWith('Decimal') &&
            value.constructor?.name === 'DecimalBigNum'
          ) {
            try {
              // Get the string representation and scale
              const decimalStr = value.toString();
              const scale = field.type.scale || 0;

              // Apply the scale to get the actual decimal value
              if (scale > 0) {
                const scaled = parseFloat(decimalStr) / Math.pow(10, scale);
                return scaled;
              }
              return parseFloat(decimalStr);
            } catch (error) {
              // If conversion fails, return as string
              return value.toString();
            }
          }

          // Convert Date objects to ISO 8601 strings
          if (value instanceof Date) {
            const isoString = value.toISOString();
            // Remove timezone suffix (Z) if the original type doesn't have timezone
            return hasTimezone ? isoString : isoString.replace(/Z$/, '');
          }

          // Convert numeric timestamps/dates to ISO 8601 strings
          if (typeof value === 'number') {
            if (
              typeStr.startsWith('Timestamp') ||
              typeStr.startsWith('Date32') ||
              typeStr.startsWith('Date64')
            ) {
              const date = new Date(value);
              const isoString = date.toISOString();
              // Remove timezone suffix (Z) if the original type doesn't have timezone
              return hasTimezone ? isoString : isoString.replace(/Z$/, '');
            }
            return value;
          }

          // Convert BigInt to number if within safe range, otherwise to string
          if (typeof value === 'bigint') {
            if (
              value >= BigInt(Number.MIN_SAFE_INTEGER) &&
              value <= BigInt(Number.MAX_SAFE_INTEGER)
            ) {
              return Number(value);
            }
            return value.toString();
          }

          // Handle arrays (from List types) - recursively process elements
          if (
            Array.isArray(value) &&
            field.type.children &&
            field.type.children.length > 0
          ) {
            const childField = field.type.children[0];
            return value.map((item) => convertValue(item, childField));
          }

          // Handle objects (from Struct types) - recursively process fields
          if (typeof value === 'object' && field.type.children) {
            const result: any = {};
            for (const childField of field.type.children) {
              if (childField.name in value) {
                result[childField.name] = convertValue(
                  value[childField.name],
                  childField,
                );
              }
            }
            return result;
          }

          // Return value as-is for primitive types
          return value;
        };

        // Use toArray() to properly convert Arrow values to JavaScript objects
        // This handles Decimal types and other special Arrow representations correctly
        const rows = table.toArray();

        // Optimize: Create a field map once per chunk instead of per row
        const fieldMap = new Map(fields.map((field) => [field.name, field]));

        for (const row of rows) {
          const convertedRow: any = {};

          // Apply conversions based on schema information
          for (const columnName in row) {
            if (Object.prototype.hasOwnProperty.call(row, columnName)) {
              const field = fieldMap.get(columnName);
              if (field) {
                convertedRow[columnName] = convertValue(row[columnName], field);
              } else {
                // Field not in schema, keep as-is
                convertedRow[columnName] = row[columnName];
              }
            }
          }

          allRows.push(convertedRow);
        }
      });

      const executionTime = Date.now() - startTime;
      return {
        row_count: allRows.length,
        schema: schema || { fields: [] },
        data: allRows,
        execution_time_ms: executionTime,
      };
    } else {
      // HTTP mode: Get JSON directly without Arrow conversion to preserve types
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

      const jsonData = await response.json();
      const executionTime = Date.now() - startTime;

      // Response is already in V1 format, just ensure proper structure
      return {
        row_count:
          jsonData.row_count || (jsonData.data || jsonData.rows || []).length,
        schema: jsonData.schema || { fields: [] },
        data: jsonData.data || jsonData.rows || [],
        execution_time_ms: executionTime,
      };
    }
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
      'Accept-Encoding': 'gzip, deflate',
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
