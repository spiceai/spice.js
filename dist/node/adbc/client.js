"use strict";
/**
 * ADBC-style client implementation for parameterized queries
 * Implements Flight SQL prepared statement protocol for server-side parameter binding
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlightSqlActions = void 0;
exports.normalizeParam = normalizeParam;
exports.arrowTypeFor = arrowTypeFor;
exports.newParam = newParam;
exports.newTypedParam = newTypedParam;
exports.int8Param = int8Param;
exports.int16Param = int16Param;
exports.int32Param = int32Param;
exports.int64Param = int64Param;
exports.uint8Param = uint8Param;
exports.uint16Param = uint16Param;
exports.uint32Param = uint32Param;
exports.uint64Param = uint64Param;
exports.float32Param = float32Param;
exports.float64Param = float64Param;
exports.stringParam = stringParam;
exports.boolParam = boolParam;
exports.binaryParam = binaryParam;
exports.dateParam = dateParam;
exports.timestampParam = timestampParam;
exports.nullParam = nullParam;
exports.inferArrowType = inferArrowType;
exports.buildParameterColumns = buildParameterColumns;
exports.serializeParametersToIPC = serializeParametersToIPC;
exports.buildNamedParameterColumns = buildNamedParameterColumns;
exports.serializeNamedParametersToIPC = serializeNamedParametersToIPC;
exports.encodeCommandStatementQuery = encodeCommandStatementQuery;
exports.encodeCreatePreparedStatementRequest = encodeCreatePreparedStatementRequest;
exports.encodeCreatePreparedStatementRequestRaw = encodeCreatePreparedStatementRequestRaw;
exports.encodeCreatePreparedStatementRequestJson = encodeCreatePreparedStatementRequestJson;
exports.encodeClosePreparedStatementRequest = encodeClosePreparedStatementRequest;
exports.encodeCommandPreparedStatementQuery = encodeCommandPreparedStatementQuery;
exports.decodeCreatePreparedStatementResult = decodeCreatePreparedStatementResult;
const apache_arrow_1 = require("apache-arrow");
/**
 * Maps the public {@link Param} type identifiers (`src/param.ts`, PascalCase)
 * onto the lowercase names used internally by {@link buildParameterColumns}.
 *
 * Without this, a `Param.int32(5)` reaches the serializer looking like an
 * untyped `{ value }` wrapper and its explicit type is silently inferred away.
 */
const PARAM_TYPE_IDS = {
    Int8: 'int8',
    Int16: 'int16',
    Int32: 'int32',
    Int64: 'int64',
    UInt8: 'uint8',
    UInt16: 'uint16',
    UInt32: 'uint32',
    UInt64: 'uint64',
    Float16: 'float16',
    Float32: 'float32',
    Float64: 'float64',
    String: 'utf8',
    LargeString: 'large_utf8',
    Binary: 'binary',
    LargeBinary: 'large_binary',
    FixedSizeBinary: 'fixed_size_binary',
    Boolean: 'bool',
    Date32: 'date32',
    Date64: 'date64',
    Time32: 'time32',
    Time64: 'time64',
    Timestamp: 'timestamp',
    Duration: 'duration',
    Decimal128: 'decimal128',
    Decimal256: 'decimal256',
    Null: 'null',
};
/**
 * Normalizes a parameter into the `{ value, dataType }` shape the column
 * builder expects, whatever form the caller supplied.
 *
 * Accepts a raw value, a {@link Param} (`{ value, type, options }`), or an
 * already-internal `{ value, dataType }` object.
 */
function normalizeParam(param) {
    if (param === null || param === undefined || typeof param !== 'object') {
        return { value: param };
    }
    if (!('value' in param)) {
        return { value: param };
    }
    // Internal shape already.
    if (typeof param.dataType === 'string') {
        return { value: param.value, dataType: param.dataType, options: param.options };
    }
    // Public Param: { value, type: ArrowTypeId, options }.
    if (typeof param.type === 'string') {
        const mapped = PARAM_TYPE_IDS[param.type];
        if (mapped) {
            return { value: param.value, dataType: mapped, options: param.options };
        }
    }
    return { value: param.value, options: param.options };
}
/**
 * Resolves an internal type name to an Arrow type, so an explicitly typed
 * parameter is bound as that type instead of whatever Arrow infers from the
 * JavaScript value.
 *
 * Returns undefined when the type needs options that were not supplied, in
 * which case the caller falls back to inference rather than guessing.
 */
function arrowTypeFor(dataType, options) {
    switch (dataType) {
        case 'int8':
            return new apache_arrow_1.Int8();
        case 'int16':
            return new apache_arrow_1.Int16();
        case 'int32':
            return new apache_arrow_1.Int32();
        case 'int64':
            return new apache_arrow_1.Int64();
        case 'uint8':
            return new apache_arrow_1.Uint8();
        case 'uint16':
            return new apache_arrow_1.Uint16();
        case 'uint32':
            return new apache_arrow_1.Uint32();
        case 'uint64':
            return new apache_arrow_1.Uint64();
        case 'float16':
            return new apache_arrow_1.Float16();
        case 'float32':
            return new apache_arrow_1.Float32();
        case 'float64':
            return new apache_arrow_1.Float64();
        case 'utf8':
            return new apache_arrow_1.Utf8();
        case 'large_utf8':
            return new apache_arrow_1.LargeUtf8();
        case 'binary':
            return new apache_arrow_1.Binary();
        case 'large_binary':
            return new apache_arrow_1.LargeBinary();
        case 'bool':
            return new apache_arrow_1.Bool();
        case 'date32':
            return new apache_arrow_1.DateDay();
        case 'date64':
            return new apache_arrow_1.DateMillisecond();
        case 'fixed_size_binary': {
            const width = options?.byteWidth;
            return typeof width === 'number' ? new apache_arrow_1.FixedSizeBinary(width) : undefined;
        }
        case 'decimal128':
        case 'decimal256': {
            const { precision, scale } = options ?? {};
            return typeof precision === 'number' && typeof scale === 'number'
                ? new apache_arrow_1.Decimal(scale, precision)
                : undefined;
        }
        case 'timestamp':
            switch (options?.unit) {
                case 'Second':
                    return new apache_arrow_1.TimestampSecond();
                case 'Millisecond':
                    return new apache_arrow_1.TimestampMillisecond();
                case 'Nanosecond':
                    return new apache_arrow_1.TimestampNanosecond();
                default:
                    // The value converter emits microseconds.
                    return new apache_arrow_1.TimestampMicrosecond();
            }
        case 'time32':
        case 'time64':
            switch (options?.unit) {
                case 'Second':
                    return new apache_arrow_1.TimeSecond();
                case 'Millisecond':
                    return new apache_arrow_1.TimeMillisecond();
                case 'Nanosecond':
                    return new apache_arrow_1.TimeNanosecond();
                case 'Microsecond':
                    return new apache_arrow_1.TimeMicrosecond();
                default:
                    return undefined;
            }
        case 'duration':
            switch (options?.unit) {
                case 'Second':
                    return new apache_arrow_1.DurationSecond();
                case 'Millisecond':
                    return new apache_arrow_1.DurationMillisecond();
                case 'Nanosecond':
                    return new apache_arrow_1.DurationNanosecond();
                case 'Microsecond':
                    return new apache_arrow_1.DurationMicrosecond();
                default:
                    return undefined;
            }
        default:
            return undefined;
    }
}
/**
 * Builds a single-row Arrow table, honouring explicit types where they resolve
 * and leaving the rest to Arrow's inference.
 */
function buildParameterTable(columns, types, optionsByField) {
    const explicit = {};
    const inferred = {};
    for (const [name, values] of Object.entries(columns)) {
        const arrowType = arrowTypeFor(types[name], optionsByField[name]);
        if (arrowType) {
            explicit[name] = (0, apache_arrow_1.vectorFromArray)(values, arrowType);
        }
        else {
            inferred[name] = values;
        }
    }
    if (Object.keys(explicit).length === 0) {
        return (0, apache_arrow_1.tableFromArrays)(inferred);
    }
    // tableFromArrays infers from raw arrays; explicitly typed vectors go
    // through the Table constructor. Merge so field order follows `columns`.
    const merged = {};
    const inferredTable = Object.keys(inferred).length > 0 ? (0, apache_arrow_1.tableFromArrays)(inferred) : null;
    for (const name of Object.keys(columns)) {
        merged[name] = explicit[name] ?? inferredTable?.getChild(name);
    }
    return new apache_arrow_1.Table(merged);
}
/**
 * Creates a new parameter with inferred type
 */
function newParam(value) {
    return { value };
}
/**
 * Creates a new parameter with explicit type
 */
function newTypedParam(value, dataType) {
    return { value, dataType };
}
// Common type constructors for convenience
function int8Param(value) {
    return { value, dataType: 'int8' };
}
function int16Param(value) {
    return { value, dataType: 'int16' };
}
function int32Param(value) {
    return { value, dataType: 'int32' };
}
function int64Param(value) {
    return {
        value: typeof value === 'bigint' ? value : BigInt(value),
        dataType: 'int64',
    };
}
function uint8Param(value) {
    return { value, dataType: 'uint8' };
}
function uint16Param(value) {
    return { value, dataType: 'uint16' };
}
function uint32Param(value) {
    return { value, dataType: 'uint32' };
}
function uint64Param(value) {
    return {
        value: typeof value === 'bigint' ? value : BigInt(value),
        dataType: 'uint64',
    };
}
function float32Param(value) {
    return { value, dataType: 'float32' };
}
function float64Param(value) {
    return { value, dataType: 'float64' };
}
function stringParam(value) {
    return { value, dataType: 'utf8' };
}
function boolParam(value) {
    return { value, dataType: 'bool' };
}
function binaryParam(value) {
    return { value, dataType: 'binary' };
}
function dateParam(value) {
    const numValue = value instanceof Date ? Math.floor(value.getTime() / 86400000) : value;
    return { value: numValue, dataType: 'date32' };
}
function timestampParam(value) {
    let numValue;
    if (value instanceof Date) {
        numValue = BigInt(value.getTime()) * BigInt(1000); // Convert ms to microseconds
    }
    else if (typeof value === 'bigint') {
        numValue = value;
    }
    else {
        numValue = BigInt(value);
    }
    return { value: numValue, dataType: 'timestamp' };
}
function nullParam() {
    return { value: null, dataType: 'utf8' };
}
/**
 * Infers the Arrow data type string from a JavaScript value
 */
function inferArrowType(value) {
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
function convertValue(value, dataType) {
    if (value === null || value === undefined) {
        return null;
    }
    // Handle Date conversion to timestamp (microseconds)
    if (value instanceof Date) {
        return BigInt(value.getTime()) * BigInt(1000);
    }
    // Handle number to bigint conversion for int64/uint64
    if ((dataType === 'int64' || dataType === 'uint64') &&
        typeof value === 'number') {
        return BigInt(Math.round(value));
    }
    return value;
}
/**
 * Builds column data for Arrow table from parameters
 */
function buildParameterColumns(params) {
    if (params.length === 0) {
        return { columns: {}, types: {}, options: {} };
    }
    const columns = {};
    const types = {};
    const options = {};
    for (let i = 0; i < params.length; i++) {
        const fieldName = `$${i + 1}`;
        const { value, dataType, options: opts } = normalizeParam(params[i]);
        const resolved = dataType || inferArrowType(value);
        columns[fieldName] = [convertValue(value, resolved)];
        types[fieldName] = resolved;
        options[fieldName] = opts;
    }
    return { columns, types, options };
}
/**
 * Serializes parameters to Arrow IPC format for DoPut
 */
function serializeParametersToIPC(params) {
    if (params.length === 0) {
        return new Uint8Array(0);
    }
    const { columns, types, options } = buildParameterColumns(params);
    return (0, apache_arrow_1.tableToIPC)(buildParameterTable(columns, types, options));
}
/**
 * Builds column data for named parameters ($name style).
 *
 * The bound batch names each column with the bare placeholder name — `name`, not
 * `$name` — even though the parameter schema the server reports back from
 * CreatePreparedStatement spells the field with the leading `$`. Binding a column
 * named `$name` fails with "No value found for placeholder with name $name".
 *
 * Positional parameters are the other way round: those columns are named `$1`, `$2`
 * (see {@link buildParameterColumns}).
 */
function buildNamedParameterColumns(params) {
    const columns = {};
    const types = {};
    const options = {};
    for (const [name, param] of Object.entries(params)) {
        const fieldName = name.startsWith('$') ? name.slice(1) : name;
        const { value, dataType, options: opts } = normalizeParam(param);
        const resolved = dataType || inferArrowType(value);
        columns[fieldName] = [convertValue(value, resolved)];
        types[fieldName] = resolved;
        options[fieldName] = opts;
    }
    return { columns, types, options };
}
/**
 * Serializes named parameters to Arrow IPC format for DoPut
 */
function serializeNamedParametersToIPC(params) {
    if (Object.keys(params).length === 0) {
        return new Uint8Array(0);
    }
    const { columns, types, options } = buildNamedParameterColumns(params);
    return (0, apache_arrow_1.tableToIPC)(buildParameterTable(columns, types, options));
}
/**
 * Flight SQL action types (string identifiers for DoAction)
 */
exports.FlightSqlActions = {
    CreatePreparedStatement: 'CreatePreparedStatement',
    ClosePreparedStatement: 'ClosePreparedStatement',
};
/**
 * Flight SQL type URLs for google.protobuf.Any wrapping
 */
const FlightSqlTypeUrls = {
    ActionCreatePreparedStatementRequest: 'type.googleapis.com/arrow.flight.protocol.sql.ActionCreatePreparedStatementRequest',
    ActionClosePreparedStatementRequest: 'type.googleapis.com/arrow.flight.protocol.sql.ActionClosePreparedStatementRequest',
    CommandPreparedStatementQuery: 'type.googleapis.com/arrow.flight.protocol.sql.CommandPreparedStatementQuery',
};
/**
 * Wraps a protobuf message in google.protobuf.Any format
 */
function wrapInAny(typeUrl, message) {
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
function encodeCommandStatementQuery(query) {
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
function encodeCreatePreparedStatementRequest(query) {
    // ActionCreatePreparedStatementRequest has:
    // Field 1: query (string)
    const queryBytes = Buffer.from(query, 'utf8');
    const queryLengthVarint = encodeVarint(queryBytes.length);
    // Field tag: field number 1, wire type 2 (length-delimited)
    const fieldTag = Buffer.from([0x0a]); // (1 << 3) | 2 = 10 = 0x0a
    const innerMessage = Buffer.concat([fieldTag, queryLengthVarint, queryBytes]);
    // Wrap in google.protobuf.Any
    return wrapInAny(FlightSqlTypeUrls.ActionCreatePreparedStatementRequest, innerMessage);
}
/**
 * Encodes an ActionCreatePreparedStatementRequest message WITHOUT Any wrapper
 * Some servers may expect the raw message without Any wrapping
 */
function encodeCreatePreparedStatementRequestRaw(query) {
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
function encodeCreatePreparedStatementRequestJson(query) {
    return Buffer.from(JSON.stringify({ query }), 'utf8');
}
/**
 * Encodes an ActionClosePreparedStatementRequest message wrapped in Any
 */
function encodeClosePreparedStatementRequest(preparedStatementHandle) {
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
    return wrapInAny(FlightSqlTypeUrls.ActionClosePreparedStatementRequest, innerMessage);
}
/**
 * Encodes a CommandPreparedStatementQuery message wrapped in Any
 */
function encodeCommandPreparedStatementQuery(preparedStatementHandle) {
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
    return wrapInAny(FlightSqlTypeUrls.CommandPreparedStatementQuery, innerMessage);
}
/**
 * Unwraps a google.protobuf.Any message and returns the inner value
 */
function unwrapAny(data) {
    let offset = 0;
    let typeUrl;
    let value;
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
function decodeCreatePreparedStatementResult(data) {
    // First, try to unwrap if it's in Any format
    const anyResult = unwrapAny(data);
    const innerData = anyResult ? anyResult.value : data;
    // ActionCreatePreparedStatementResult has:
    // Field 1: prepared_statement_handle (bytes)
    // Field 2: dataset_schema (bytes, optional)
    // Field 3: parameter_schema (bytes, optional)
    let offset = 0;
    let preparedStatementHandle;
    let datasetSchema;
    let parameterSchema;
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
        throw new Error('Invalid ActionCreatePreparedStatementResult: missing prepared_statement_handle');
    }
    return { preparedStatementHandle, datasetSchema, parameterSchema };
}
/**
 * Encodes an integer as a protobuf varint
 */
function encodeVarint(value) {
    const bytes = [];
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
function decodeVarint(buffer, offset) {
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
//# sourceMappingURL=client.js.map