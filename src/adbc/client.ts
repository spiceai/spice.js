/**
 * ADBC-style client implementation for parameterized queries
 * Implements Flight SQL prepared statement protocol for server-side parameter binding
 */

import { tableFromArrays, tableToIPC } from 'apache-arrow';

/**
 * Param represents a query parameter with an optional explicit Arrow type.
 * If dataType is undefined, the type will be inferred from the value.
 */
export interface Param {
  value: any;
  dataType?: string;
}

/**
 * Creates a new parameter with inferred type
 */
export function newParam(value: any): Param {
  return { value };
}

/**
 * Creates a new parameter with explicit type
 */
export function newTypedParam(value: any, dataType: string): Param {
  return { value, dataType };
}

// Common type constructors for convenience

export function int8Param(value: number): Param {
  return { value, dataType: 'int8' };
}

export function int16Param(value: number): Param {
  return { value, dataType: 'int16' };
}

export function int32Param(value: number): Param {
  return { value, dataType: 'int32' };
}

export function int64Param(value: bigint | number): Param {
  return {
    value: typeof value === 'bigint' ? value : BigInt(value),
    dataType: 'int64',
  };
}

export function uint8Param(value: number): Param {
  return { value, dataType: 'uint8' };
}

export function uint16Param(value: number): Param {
  return { value, dataType: 'uint16' };
}

export function uint32Param(value: number): Param {
  return { value, dataType: 'uint32' };
}

export function uint64Param(value: bigint | number): Param {
  return {
    value: typeof value === 'bigint' ? value : BigInt(value),
    dataType: 'uint64',
  };
}

export function float32Param(value: number): Param {
  return { value, dataType: 'float32' };
}

export function float64Param(value: number): Param {
  return { value, dataType: 'float64' };
}

export function stringParam(value: string): Param {
  return { value, dataType: 'utf8' };
}

export function boolParam(value: boolean): Param {
  return { value, dataType: 'bool' };
}

export function binaryParam(value: Uint8Array): Param {
  return { value, dataType: 'binary' };
}

export function dateParam(value: Date | number): Param {
  const numValue =
    value instanceof Date ? Math.floor(value.getTime() / 86400000) : value;
  return { value: numValue, dataType: 'date32' };
}

export function timestampParam(value: Date | bigint | number): Param {
  let numValue: bigint;
  if (value instanceof Date) {
    numValue = BigInt(value.getTime()) * BigInt(1000); // Convert ms to microseconds
  } else if (typeof value === 'bigint') {
    numValue = value;
  } else {
    numValue = BigInt(value);
  }
  return { value: numValue, dataType: 'timestamp' };
}

export function nullParam(): Param {
  return { value: null, dataType: 'utf8' };
}

/**
 * Infers the Arrow data type string from a JavaScript value
 */
export function inferArrowType(value: any): string {
  if (value === null || value === undefined) {
    return 'utf8'; // Use string for null values
  }

  if (typeof value === 'boolean') {
    return 'bool';
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return 'int64';
    }
    return 'float64';
  }

  if (typeof value === 'bigint') {
    return 'int64';
  }

  if (typeof value === 'string') {
    return 'utf8';
  }

  if (value instanceof Date) {
    return 'timestamp';
  }

  if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
    return 'binary';
  }

  // Default to string
  return 'utf8';
}

/**
 * Converts a JavaScript value to the appropriate Arrow-compatible format
 */
function convertValue(value: any, dataType: string): any {
  if (value === null || value === undefined) {
    return null;
  }

  // Handle Date conversion to timestamp (microseconds)
  if (value instanceof Date) {
    return BigInt(value.getTime()) * BigInt(1000);
  }

  // Handle number to bigint conversion for int64/uint64
  if (
    (dataType === 'int64' || dataType === 'uint64') &&
    typeof value === 'number'
  ) {
    return BigInt(Math.round(value));
  }

  return value;
}

/**
 * Builds column data for Arrow table from parameters
 */
export function buildParameterColumns(params: any[]): {
  columns: { [key: string]: any[] };
  types: { [key: string]: string };
} {
  if (params.length === 0) {
    return { columns: {}, types: {} };
  }

  const columns: { [key: string]: any[] } = {};
  const types: { [key: string]: string } = {};

  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    const fieldName = `$${i + 1}`;

    let value: any;
    let dataType: string;

    if (
      param &&
      typeof param === 'object' &&
      'value' in param &&
      'dataType' in param
    ) {
      // It's a Param object with explicit type
      value = param.value;
      dataType = param.dataType || inferArrowType(param.value);
    } else if (param && typeof param === 'object' && 'value' in param) {
      // It's a Param object without explicit type
      value = param.value;
      dataType = inferArrowType(param.value);
    } else {
      // Regular value, infer type
      value = param;
      dataType = inferArrowType(param);
    }

    const convertedValue = convertValue(value, dataType);
    columns[fieldName] = [convertedValue];
    types[fieldName] = dataType;
  }

  return { columns, types };
}

/**
 * Serializes parameters to Arrow IPC format for DoPut
 */
export function serializeParametersToIPC(params: any[]): Uint8Array {
  if (params.length === 0) {
    return new Uint8Array(0);
  }

  const { columns } = buildParameterColumns(params);
  const table = tableFromArrays(columns);
  return tableToIPC(table);
}

/**
 * Flight SQL action types (string identifiers for DoAction)
 */
export const FlightSqlActions = {
  CreatePreparedStatement: 'CreatePreparedStatement',
  ClosePreparedStatement: 'ClosePreparedStatement',
};

/**
 * Flight SQL type URLs for google.protobuf.Any wrapping
 */
const FlightSqlTypeUrls = {
  ActionCreatePreparedStatementRequest:
    'type.googleapis.com/arrow.flight.protocol.sql.ActionCreatePreparedStatementRequest',
  ActionClosePreparedStatementRequest:
    'type.googleapis.com/arrow.flight.protocol.sql.ActionClosePreparedStatementRequest',
  CommandPreparedStatementQuery:
    'type.googleapis.com/arrow.flight.protocol.sql.CommandPreparedStatementQuery',
};

/**
 * Wraps a protobuf message in google.protobuf.Any format
 */
function wrapInAny(typeUrl: string, message: Buffer): Buffer {
  // google.protobuf.Any has:
  // Field 1: type_url (string)
  // Field 2: value (bytes)

  const typeUrlBytes = Buffer.from(typeUrl, 'utf8');
  const typeUrlLengthVarint = encodeVarint(typeUrlBytes.length);
  const typeUrlTag = Buffer.from([0x0a]); // (1 << 3) | 2 = 10

  const valueLengthVarint = encodeVarint(message.length);
  const valueTag = Buffer.from([0x12]); // (2 << 3) | 2 = 18

  return Buffer.concat([
    typeUrlTag,
    typeUrlLengthVarint,
    typeUrlBytes,
    valueTag,
    valueLengthVarint,
    message,
  ]);
}

/**
 * Encodes a Flight SQL CommandStatementQuery message
 * This is a protobuf-encoded message with the SQL query
 */
export function encodeCommandStatementQuery(query: string): Buffer {
  // Simple protobuf encoding for CommandStatementQuery
  // Field 1: query (string)
  const queryBytes = Buffer.from(query, 'utf8');
  const queryLengthVarint = encodeVarint(queryBytes.length);

  // Field tag: field number 1, wire type 2 (length-delimited)
  const fieldTag = Buffer.from([0x0a]); // (1 << 3) | 2 = 10 = 0x0a

  return Buffer.concat([fieldTag, queryLengthVarint, queryBytes]);
}

/**
 * Encodes an ActionCreatePreparedStatementRequest message wrapped in Any
 * Per Flight SQL spec, the action body should be a serialized google.protobuf.Any
 * containing the actual request message
 */
export function encodeCreatePreparedStatementRequest(query: string): Buffer {
  // ActionCreatePreparedStatementRequest has:
  // Field 1: query (string)
  const queryBytes = Buffer.from(query, 'utf8');
  const queryLengthVarint = encodeVarint(queryBytes.length);

  // Field tag: field number 1, wire type 2 (length-delimited)
  const fieldTag = Buffer.from([0x0a]); // (1 << 3) | 2 = 10 = 0x0a

  const innerMessage = Buffer.concat([fieldTag, queryLengthVarint, queryBytes]);

  // Wrap in google.protobuf.Any
  return wrapInAny(
    FlightSqlTypeUrls.ActionCreatePreparedStatementRequest,
    innerMessage,
  );
}

/**
 * Encodes an ActionCreatePreparedStatementRequest message WITHOUT Any wrapper
 * Some servers may expect the raw message without Any wrapping
 */
export function encodeCreatePreparedStatementRequestRaw(query: string): Buffer {
  // ActionCreatePreparedStatementRequest has:
  // Field 1: query (string)
  const queryBytes = Buffer.from(query, 'utf8');
  const queryLengthVarint = encodeVarint(queryBytes.length);

  // Field tag: field number 1, wire type 2 (length-delimited)
  const fieldTag = Buffer.from([0x0a]); // (1 << 3) | 2 = 10 = 0x0a

  return Buffer.concat([fieldTag, queryLengthVarint, queryBytes]);
}

/**
 * Encodes an ActionCreatePreparedStatementRequest as JSON
 * For servers that expect JSON format instead of protobuf
 */
export function encodeCreatePreparedStatementRequestJson(
  query: string,
): Buffer {
  return Buffer.from(JSON.stringify({ query }), 'utf8');
}

/**
 * Encodes an ActionClosePreparedStatementRequest message wrapped in Any
 */
export function encodeClosePreparedStatementRequest(
  preparedStatementHandle: Buffer,
): Buffer {
  // ActionClosePreparedStatementRequest has:
  // Field 1: prepared_statement_handle (bytes)
  const handleLengthVarint = encodeVarint(preparedStatementHandle.length);

  // Field tag: field number 1, wire type 2 (length-delimited)
  const fieldTag = Buffer.from([0x0a]); // (1 << 3) | 2 = 10 = 0x0a

  const innerMessage = Buffer.concat([
    fieldTag,
    handleLengthVarint,
    preparedStatementHandle,
  ]);

  // Wrap in google.protobuf.Any
  return wrapInAny(
    FlightSqlTypeUrls.ActionClosePreparedStatementRequest,
    innerMessage,
  );
}

/**
 * Encodes a CommandPreparedStatementQuery message wrapped in Any
 */
export function encodeCommandPreparedStatementQuery(
  preparedStatementHandle: Buffer,
): Buffer {
  // CommandPreparedStatementQuery has:
  // Field 1: prepared_statement_handle (bytes)
  const handleLengthVarint = encodeVarint(preparedStatementHandle.length);

  // Field tag: field number 1, wire type 2 (length-delimited)
  const fieldTag = Buffer.from([0x0a]); // (1 << 3) | 2 = 10 = 0x0a

  const innerMessage = Buffer.concat([
    fieldTag,
    handleLengthVarint,
    preparedStatementHandle,
  ]);

  // Wrap in google.protobuf.Any
  return wrapInAny(
    FlightSqlTypeUrls.CommandPreparedStatementQuery,
    innerMessage,
  );
}

/**
 * Unwraps a google.protobuf.Any message and returns the inner value
 */
function unwrapAny(data: Buffer): { typeUrl: string; value: Buffer } | null {
  let offset = 0;
  let typeUrl: string | undefined;
  let value: Buffer | undefined;

  while (offset < data.length) {
    const tag = data[offset];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;
    offset++;

    if (wireType !== 2) {
      // Skip non-length-delimited fields
      if (wireType === 0) {
        while (offset < data.length && data[offset] & 0x80) {
          offset++;
        }
        offset++;
      }
      continue;
    }

    const { value: length, bytesRead } = decodeVarint(data, offset);
    offset += bytesRead;

    const fieldValue = data.slice(offset, offset + length);
    offset += length;

    switch (fieldNumber) {
      case 1:
        typeUrl = fieldValue.toString('utf8');
        break;
      case 2:
        value = fieldValue;
        break;
    }
  }

  if (typeUrl && value) {
    return { typeUrl, value };
  }
  return null;
}

/**
 * Decodes an ActionCreatePreparedStatementResult message
 * Returns the prepared_statement_handle
 * Handles both Any-wrapped and raw messages
 */
export function decodeCreatePreparedStatementResult(data: Buffer): {
  preparedStatementHandle: Buffer;
  datasetSchema?: Buffer;
  parameterSchema?: Buffer;
} {
  // First, try to unwrap if it's in Any format
  const anyResult = unwrapAny(data);
  const innerData = anyResult ? anyResult.value : data;

  // ActionCreatePreparedStatementResult has:
  // Field 1: prepared_statement_handle (bytes)
  // Field 2: dataset_schema (bytes, optional)
  // Field 3: parameter_schema (bytes, optional)

  let offset = 0;
  let preparedStatementHandle: Buffer | undefined;
  let datasetSchema: Buffer | undefined;
  let parameterSchema: Buffer | undefined;

  while (offset < innerData.length) {
    const tag = innerData[offset];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;
    offset++;

    if (wireType !== 2) {
      // Skip non-length-delimited fields
      if (wireType === 0) {
        // Varint - skip
        while (offset < innerData.length && innerData[offset] & 0x80) {
          offset++;
        }
        offset++;
      }
      continue;
    }

    // Read length
    const { value: length, bytesRead } = decodeVarint(innerData, offset);
    offset += bytesRead;

    // Read value
    const value = innerData.slice(offset, offset + length);
    offset += length;

    switch (fieldNumber) {
      case 1:
        preparedStatementHandle = value;
        break;
      case 2:
        datasetSchema = value;
        break;
      case 3:
        parameterSchema = value;
        break;
    }
  }

  if (!preparedStatementHandle) {
    throw new Error(
      'Invalid ActionCreatePreparedStatementResult: missing prepared_statement_handle',
    );
  }

  return { preparedStatementHandle, datasetSchema, parameterSchema };
}

/**
 * Encodes an integer as a protobuf varint
 */
function encodeVarint(value: number): Buffer {
  const bytes: number[] = [];
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value);
  return Buffer.from(bytes);
}

/**
 * Decodes a protobuf varint from a buffer
 */
function decodeVarint(
  buffer: Buffer,
  offset: number,
): { value: number; bytesRead: number } {
  let value = 0;
  let shift = 0;
  let bytesRead = 0;

  while (offset + bytesRead < buffer.length) {
    const byte = buffer[offset + bytesRead];
    value |= (byte & 0x7f) << shift;
    bytesRead++;

    if ((byte & 0x80) === 0) {
      break;
    }
    shift += 7;
  }

  return { value, bytesRead };
}
