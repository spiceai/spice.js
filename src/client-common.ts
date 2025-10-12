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
 * Helper function to recursively convert timestamps in nested structures
 */
function convertTimestampsInValue(value: any, field?: any): any {
  if (value === null || value === undefined) {
    return value;
  }

  // Handle arrays (Lists)
  if (Array.isArray(value) && field?.children?.[0]) {
    const childField = field.children[0];
    const childType =
      typeof childField.data_type === 'string' ? childField.data_type : '';

    if (childType.startsWith('Timestamp') || childType.startsWith('Date')) {
      // Parse timezone from data_type string like "Timestamp(Nanosecond, Some("UTC"))"
      const match = childType.match(/Some\("([^"]+)"\)/);
      const hasTimezone = match !== null;

      return value.map((item: any) => {
        if (typeof item === 'string') {
          let isoString = item;
          // Remove milliseconds if .000
          isoString = isoString.replace(/\.000Z$/, '');
          isoString = isoString.replace(/\.000$/, '');
          // Add Z back if has timezone, otherwise leave without Z
          if (hasTimezone && !isoString.endsWith('Z')) {
            isoString += 'Z';
          }
          return isoString;
        }
        return item;
      });
    }
  }

  // Handle objects (Structs)
  if (typeof value === 'object' && !Array.isArray(value) && field?.children) {
    const converted: any = {};
    let hasChanges = false;

    for (const key in value) {
      const childField = field.children.find((f: any) => f.name === key);
      if (childField) {
        const childType =
          typeof childField.data_type === 'string' ? childField.data_type : '';

        if (
          (childType.startsWith('Timestamp') || childType.startsWith('Date')) &&
          typeof value[key] === 'string'
        ) {
          // Parse timezone from data_type string
          const match = childType.match(/Some\("([^"]+)"\)/);
          const hasTimezone = match !== null;

          let isoString = value[key];
          // Remove milliseconds if .000
          isoString = isoString.replace(/\.000Z$/, '');
          isoString = isoString.replace(/\.000$/, '');
          // Add Z back if has timezone, otherwise leave without Z
          if (hasTimezone && !isoString.endsWith('Z')) {
            isoString += 'Z';
          }
          converted[key] = isoString;
          hasChanges = true;
        } else {
          converted[key] = value[key];
        }
      } else {
        converted[key] = value[key];
      }
    }

    return hasChanges ? converted : value;
  }

  return value;
}

/**
 * Helper function to recursively convert Arrow structures to plain JavaScript
 */
function convertArrowValue(value: any, field?: any): any {
  if (value === null || value === undefined) {
    return value;
  }

  // Handle string timestamps (from JSON responses)
  if (typeof value === 'string' && field?.type) {
    const typeStr = field.type.toString();
    if (typeStr.startsWith('Timestamp') || typeStr.startsWith('Date')) {
      const hasTimezone = field.type.timezone != null;
      let isoString = value;
      // Remove milliseconds if .000
      isoString = isoString.replace(/\.000Z$/, '');
      isoString = isoString.replace(/\.000$/, '');
      // Add Z back if has timezone, otherwise leave without Z
      if (hasTimezone && !isoString.endsWith('Z')) {
        isoString += 'Z';
      }
      return isoString;
    }
  }

  // Handle Date objects - check if field has timezone info
  if (value instanceof Date) {
    const hasTimezone = field?.type?.timezone != null;
    let isoString = value.toISOString();
    // Remove milliseconds if .000
    isoString = isoString.replace(/\.000Z$/, '');
    // Add Z back if has timezone, otherwise leave without Z
    if (hasTimezone) {
      isoString += 'Z';
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

    // Use original schema if available (from jsonToArrowTable)
    const originalSchema = (table as any)._originalSchema;

    // Check which fields need conversion
    const decimalFields = table.schema.fields.filter((f) =>
      f.type.toString().startsWith('Decimal'),
    );

    // For timestamp fields, use original schema metadata if available
    let timestampFields: any[];
    if (originalSchema && Array.isArray(originalSchema)) {
      timestampFields = originalSchema
        .filter((f: any) => {
          const dataType = typeof f.data_type === 'string' ? f.data_type : '';
          return (
            dataType.startsWith('Timestamp') || dataType.startsWith('Date')
          );
        })
        .map((f: any) => {
          // Parse timezone from data_type string like "Timestamp(Nanosecond, Some("UTC"))"
          const dataType = f.data_type;
          let timezone = null;
          if (typeof dataType === 'string') {
            const match = dataType.match(/Some\("([^"]+)"\)/);
            if (match) {
              timezone = match[1];
            }
          }
          return {
            name: f.name,
            type: {
              toString: () => f.data_type,
              timezone: timezone,
            },
          };
        });
    } else {
      timestampFields = table.schema.fields.filter(
        (f) =>
          f.type.toString().startsWith('Timestamp') ||
          f.type.toString().startsWith('Date'),
      );
    }

    // For list/struct fields, use original schema if available
    let listFields: any[];
    let structFields: any[];

    if (originalSchema && Array.isArray(originalSchema)) {
      listFields = originalSchema.filter((f: any) => {
        const dataType = typeof f.data_type === 'string' ? f.data_type : '';
        return dataType === 'List' || dataType.startsWith('List<');
      });
      structFields = originalSchema.filter((f: any) => {
        const dataType = typeof f.data_type === 'string' ? f.data_type : '';
        return dataType === 'Struct' || dataType.startsWith('Struct<');
      });
    } else {
      listFields = table.schema.fields.filter(
        (f) =>
          f.type.toString().startsWith('List<') || f.type.toString() === 'List',
      );
      structFields = table.schema.fields.filter(
        (f) =>
          f.type.toString().startsWith('Struct<') ||
          f.type.toString() === 'Struct',
      );
    }

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
            // Remove milliseconds if .000
            isoString = isoString.replace(/\.000Z$/, '');
            // Add Z back if has timezone and doesn't already have it
            if (hasTimezone && !isoString.endsWith('Z')) {
              isoString += 'Z';
            }
            convertedRow[field.name] = isoString;
          } else if (typeof value === 'number') {
            ensureConvertedRow();
            // Handle numeric timestamps
            const date = new Date(value);
            let isoString = date.toISOString();
            // Remove milliseconds if .000
            isoString = isoString.replace(/\.000Z$/, '');
            // Add Z back if has timezone and doesn't already have it
            if (hasTimezone && !isoString.endsWith('Z')) {
              isoString += 'Z';
            }
            convertedRow[field.name] = isoString;
          } else if (typeof value === 'string') {
            ensureConvertedRow();
            // Handle string timestamps (from JSON responses)
            let isoString = value;
            // Remove milliseconds if .000
            isoString = isoString.replace(/\.000Z$/, '');
            isoString = isoString.replace(/\.000$/, '');
            // Add Z back if has timezone, otherwise leave without Z
            if (hasTimezone && !isoString.endsWith('Z')) {
              isoString += 'Z';
            }
            convertedRow[field.name] = isoString;
          }
        }
      }

      // Convert List/Struct fields (Arrow Vectors to JavaScript arrays/objects)
      for (const field of listFields.concat(structFields)) {
        const value = row[field.name];
        if (value !== null && value !== undefined) {
          // Find corresponding field in original schema
          const originalField = originalSchema?.find(
            (f: any) => f.name === field.name,
          );

          // If value is a JSON string, parse it first, convert timestamps, then stringify back
          if (typeof value === 'string') {
            try {
              const parsed = JSON.parse(value);
              const converted = convertTimestampsInValue(parsed, originalField);
              // Always update if we successfully parsed and converted
              const shouldUpdate =
                JSON.stringify(converted) !== JSON.stringify(parsed);
              if (shouldUpdate) {
                ensureConvertedRow();
                convertedRow[field.name] = JSON.stringify(converted);
              }
            } catch (e) {
              // Not valid JSON, keep as-is
            }
          } else if (
            typeof value === 'object' &&
            (Array.isArray(value) ||
              value.constructor === Object ||
              value.constructor?.name === 'StructRow')
          ) {
            // If value is already an object/array (not stringified), convert it directly
            const converted = convertTimestampsInValue(value, originalField);
            const shouldUpdate =
              JSON.stringify(converted) !== JSON.stringify(value);
            if (shouldUpdate) {
              ensureConvertedRow();
              convertedRow[field.name] = converted;
            }
          } else {
            const converted = convertArrowValue(value, field);
            // Only update if conversion actually changed the value
            if (converted !== value) {
              ensureConvertedRow();
              convertedRow[field.name] = converted;
            }
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
        `   Flight URL: ${this._flightUrl}${
          this._flightTlsEnabled ? ' (TLS)' : ''
        }`,
      );
    }

    if (this._apiKey) {
      configLines.push(`   Auth: API Key configured`);
    }

    if (this._customHeaders && Object.keys(this._customHeaders).length > 0) {
      configLines.push(
        `   Custom Headers: ${
          Object.keys(this._customHeaders).length
        } header(s)`,
      );
    }

    console.debug(configLines.join('\n'));
  }

  private async doQueryRequest(
    queryText: string,
    onData: ((data: Table) => void) | undefined = undefined,
    headers?: { [key: string]: string },
  ): Promise<Table> {
    // Try gRPC if available
    if (this._grpcClient) {
      const useGrpc = await this._grpcClient.ensureInitialized();
      if (useGrpc) {
        return this.doGrpcQueryRequest(queryText, onData, headers);
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
    return this.doHttpQueryRequest(queryText, onData, headers);
  }

  private async doGrpcQueryRequest(
    queryText: string,
    onData: ((data: Table) => void) | undefined = undefined,
    headers?: { [key: string]: string },
  ): Promise<Table> {
    if (!this._grpcClient) {
      throw new Error('gRPC client not initialized');
    }

    try {
      const resultStream = await this._grpcClient.executeQuery(
        queryText,
        headers,
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
    headers?: { [key: string]: string },
  ): Promise<Table> {
    // Use appropriate Accept header based on endpoint (use cached value)
    const acceptHeader = this._isSpiceCloud
      ? 'application/vnd.spiceai.sql.v1+json' // data.spiceai.io returns schema with 'data' field
      : 'application/json'; // OSS returns plain JSON array

    const requestHeaders: { [key: string]: string } = {
      'Content-Type': 'text/plain',
      Accept: acceptHeader,
    };

    // Merge custom headers if provided
    if (headers) {
      Object.assign(requestHeaders, headers);
    }

    const response = await this.fetchInternal(
      'POST',
      '/v1/sql',
      undefined,
      queryText,
      requestHeaders,
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
        `Failed to parse query response: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  /**
   * Executes a SQL query and returns results as Arrow Tables.
   * @param queryText - The SQL query to execute
   * @param onData - Optional callback for streaming results
   * @param headers - Optional headers to pass with the request (HTTP headers for HTTP, Flight metadata for gRPC)
   * @returns Promise resolving to the final Arrow Table
   */
  async sql(
    queryText: string,
    onData?: ((data: Table) => void) | undefined,
    headers?: { [key: string]: string },
  ): Promise<Table> {
    return this._retry.retryWithExponentialBackoff<Table>(
      () => this.doQueryRequest(queryText, onData, headers),
      this._maxRetries,
    );
  }

  /**
   * @deprecated Use sql() instead. This method will be removed in a future version.
   */
  async query(
    queryText: string,
    onData?: ((data: Table) => void) | undefined,
    headers?: { [key: string]: string },
  ): Promise<Table> {
    return this.sql(queryText, onData, headers);
  }

  /**
   * Executes a SQL query and returns results as JSON with schema metadata.
   * Uses gRPC/Arrow if available, otherwise falls back to HTTP.
   * @param queryText - The SQL query to execute
   * @param headers - Optional headers to pass with the request (HTTP headers for HTTP, Flight metadata for gRPC)
   * @returns Promise resolving to an object containing row_count, schema, data, and execution_time_ms
   */
  async sqlJson(
    queryText: string,
    headers?: { [key: string]: string },
  ): Promise<SqlV1JsonResponse> {
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

      await this.sql(
        queryText,
        (table) => {
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
              let isoString = value.toISOString();
              // Remove milliseconds if .000
              isoString = isoString.replace(/\.000Z$/, '');
              // Add Z back if has timezone and doesn't already have it
              if (hasTimezone && !isoString.endsWith('Z')) {
                isoString += 'Z';
              }
              return isoString;
            }

            // Convert numeric timestamps/dates to ISO 8601 strings
            if (typeof value === 'number') {
              if (
                typeStr.startsWith('Timestamp') ||
                typeStr.startsWith('Date32') ||
                typeStr.startsWith('Date64')
              ) {
                const date = new Date(value);
                let isoString = date.toISOString();
                // Remove milliseconds if .000
                isoString = isoString.replace(/\.000Z$/, '');
                // Add Z back if has timezone and doesn't already have it
                if (hasTimezone && !isoString.endsWith('Z')) {
                  isoString += 'Z';
                }
                return isoString;
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
                  convertedRow[columnName] = convertValue(
                    row[columnName],
                    field,
                  );
                } else {
                  // Field not in schema, keep as-is
                  convertedRow[columnName] = row[columnName];
                }
              }
            }

            allRows.push(convertedRow);
          }
        },
        headers,
      );

      const executionTime = Date.now() - startTime;
      return {
        row_count: allRows.length,
        schema: schema || { fields: [] },
        data: allRows,
        execution_time_ms: executionTime,
      };
    } else {
      // HTTP mode: Get JSON directly without Arrow conversion to preserve types
      const requestHeaders: { [key: string]: string } = {
        'Content-Type': 'text/plain',
        Accept: 'application/vnd.spiceai.sql.v1+json',
      };

      // Merge custom headers if provided
      if (headers) {
        Object.assign(requestHeaders, headers);
      }

      const response = await this.fetchInternal(
        'POST',
        '/v1/sql',
        undefined,
        queryText,
        requestHeaders,
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `HTTP query failed with status ${response.status}: ${errorText}`,
        );
      }

      const jsonData = await response.json();
      const executionTime = Date.now() - startTime;

      // Process timestamps in the data to match sql() behavior
      const schema = jsonData.schema || { fields: [] };
      const data = jsonData.data || jsonData.rows || []; // Find timestamp and date fields in the schema
      const timestampFields = (schema.fields || []).filter((f: any) => {
        const dataType = f.data_type;
        if (typeof dataType === 'string') {
          return (
            dataType.startsWith('Timestamp') || dataType.startsWith('Date')
          );
        } else if (dataType && typeof dataType === 'object') {
          return 'Timestamp' in dataType;
        }
        return false;
      });

      // Process each row to convert timestamps
      const processedData = data.map((row: any) => {
        // Handle array-based rows (preserve array format)
        if (Array.isArray(row)) {
          // For array-based rows, create a map of field index to field metadata
          const fieldByIndex = new Map<number, any>();
          (schema.fields || []).forEach((field: any, index: number) => {
            fieldByIndex.set(index, field);
          });

          return row.map((value: any, index: number) => {
            const field = fieldByIndex.get(index);
            if (
              field &&
              value !== null &&
              value !== undefined &&
              typeof value === 'string'
            ) {
              const dataType = field.data_type;
              // Check if this is a timestamp/date field
              let isTimestamp = false;
              if (typeof dataType === 'string') {
                isTimestamp =
                  dataType.startsWith('Timestamp') ||
                  dataType.startsWith('Date');
              } else if (dataType && typeof dataType === 'object') {
                isTimestamp = 'Timestamp' in dataType;
              }

              if (isTimestamp) {
                // Determine if field has timezone
                let hasTimezone = false;
                if (typeof dataType === 'string') {
                  hasTimezone = dataType.includes('Some(');
                } else if (
                  dataType &&
                  typeof dataType === 'object' &&
                  'Timestamp' in dataType
                ) {
                  hasTimezone = dataType.Timestamp[1] !== null;
                }

                // Process the timestamp string
                let isoString = value;
                // Remove .000 milliseconds and any Z suffix
                isoString = isoString.replace(/\.000Z?$/, '');
                // Remove any remaining Z if no timezone
                if (!hasTimezone && isoString.endsWith('Z')) {
                  isoString = isoString.slice(0, -1);
                }
                // Add Z if has timezone and doesn't already have it
                if (hasTimezone && !isoString.endsWith('Z')) {
                  isoString += 'Z';
                }
                return isoString;
              }
            }
            return value;
          });
        }

        // Handle object-based rows
        const processedRow: any = { ...row };

        for (const field of timestampFields) {
          const value = row[field.name];
          if (
            value !== null &&
            value !== undefined &&
            typeof value === 'string'
          ) {
            // Determine if field has timezone
            let hasTimezone = false;
            const dataType = field.data_type;

            if (typeof dataType === 'string') {
              // Parse timezone from string like "Timestamp(Nanosecond, Some("UTC"))"
              hasTimezone = dataType.includes('Some(');
            } else if (
              dataType &&
              typeof dataType === 'object' &&
              'Timestamp' in dataType
            ) {
              // Parse from object format like { Timestamp: ['Millisecond', 'UTC'] }
              hasTimezone = dataType.Timestamp[1] !== null;
            }

            // Process the timestamp string
            let isoString = value;
            // Remove .000 milliseconds and any Z suffix
            isoString = isoString.replace(/\.000Z?$/, '');
            // Remove any remaining Z if no timezone
            if (!hasTimezone && isoString.endsWith('Z')) {
              isoString = isoString.slice(0, -1);
            }
            // Add Z if has timezone and doesn't already have it
            if (hasTimezone && !isoString.endsWith('Z')) {
              isoString += 'Z';
            }
            processedRow[field.name] = isoString;
          }
        }

        return processedRow;
      });

      // Response is already in V1 format, just ensure proper structure
      return {
        row_count: jsonData.row_count || processedData.length,
        schema: schema,
        data: processedData,
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
