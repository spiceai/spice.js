/**
 * ADBC-style client implementation for parameterized queries
 * Implements Flight SQL prepared statement protocol for server-side parameter binding
 */
import { DataType } from 'apache-arrow';
/**
 * Normalizes a parameter into the `{ value, dataType }` shape the column
 * builder expects, whatever form the caller supplied.
 *
 * Accepts a raw value, a {@link Param} (`{ value, type, options }`), or an
 * already-internal `{ value, dataType }` object.
 */
export declare function normalizeParam(param: any): {
    value: any;
    dataType?: string;
    options?: any;
};
/**
 * Resolves an internal type name to an Arrow type, so an explicitly typed
 * parameter is bound as that type instead of whatever Arrow infers from the
 * JavaScript value.
 *
 * Returns undefined when the type needs options that were not supplied, in
 * which case the caller falls back to inference rather than guessing.
 */
export declare function arrowTypeFor(dataType: string | undefined, options?: any): DataType | undefined;
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
export declare function newParam(value: any): Param;
/**
 * Creates a new parameter with explicit type
 */
export declare function newTypedParam(value: any, dataType: string): Param;
export declare function int8Param(value: number): Param;
export declare function int16Param(value: number): Param;
export declare function int32Param(value: number): Param;
export declare function int64Param(value: bigint | number): Param;
export declare function uint8Param(value: number): Param;
export declare function uint16Param(value: number): Param;
export declare function uint32Param(value: number): Param;
export declare function uint64Param(value: bigint | number): Param;
export declare function float32Param(value: number): Param;
export declare function float64Param(value: number): Param;
export declare function stringParam(value: string): Param;
export declare function boolParam(value: boolean): Param;
export declare function binaryParam(value: Uint8Array): Param;
export declare function dateParam(value: Date | number): Param;
export declare function timestampParam(value: Date | bigint | number): Param;
export declare function nullParam(): Param;
/**
 * Infers the Arrow data type string from a JavaScript value
 */
export declare function inferArrowType(value: any): string;
/**
 * Builds column data for Arrow table from parameters
 */
export declare function buildParameterColumns(params: any[]): {
    columns: {
        [key: string]: any[];
    };
    types: {
        [key: string]: string;
    };
    options: {
        [key: string]: any;
    };
};
/**
 * Serializes parameters to Arrow IPC format for DoPut
 */
export declare function serializeParametersToIPC(params: any[]): Uint8Array;
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
export declare function buildNamedParameterColumns(params: Record<string, any>): {
    columns: {
        [key: string]: any[];
    };
    types: {
        [key: string]: string;
    };
    options: {
        [key: string]: any;
    };
};
/**
 * Serializes named parameters to Arrow IPC format for DoPut
 */
export declare function serializeNamedParametersToIPC(params: Record<string, any>): Uint8Array;
/**
 * Flight SQL action types (string identifiers for DoAction)
 */
export declare const FlightSqlActions: {
    CreatePreparedStatement: string;
    ClosePreparedStatement: string;
};
/**
 * Encodes a Flight SQL CommandStatementQuery message
 * This is a protobuf-encoded message with the SQL query
 */
export declare function encodeCommandStatementQuery(query: string): Buffer;
/**
 * Encodes an ActionCreatePreparedStatementRequest message wrapped in Any
 * Per Flight SQL spec, the action body should be a serialized google.protobuf.Any
 * containing the actual request message
 */
export declare function encodeCreatePreparedStatementRequest(query: string): Buffer;
/**
 * Encodes an ActionCreatePreparedStatementRequest message WITHOUT Any wrapper
 * Some servers may expect the raw message without Any wrapping
 */
export declare function encodeCreatePreparedStatementRequestRaw(query: string): Buffer;
/**
 * Encodes an ActionCreatePreparedStatementRequest as JSON
 * For servers that expect JSON format instead of protobuf
 */
export declare function encodeCreatePreparedStatementRequestJson(query: string): Buffer;
/**
 * Encodes an ActionClosePreparedStatementRequest message wrapped in Any
 */
export declare function encodeClosePreparedStatementRequest(preparedStatementHandle: Buffer): Buffer;
/**
 * Encodes a CommandPreparedStatementQuery message wrapped in Any
 */
export declare function encodeCommandPreparedStatementQuery(preparedStatementHandle: Buffer): Buffer;
/**
 * Decodes an ActionCreatePreparedStatementResult message
 * Returns the prepared_statement_handle
 * Handles both Any-wrapped and raw messages
 */
export declare function decodeCreatePreparedStatementResult(data: Buffer): {
    preparedStatementHandle: Buffer;
    datasetSchema?: Buffer;
    parameterSchema?: Buffer;
};
