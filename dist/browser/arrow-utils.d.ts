import { Table } from 'apache-arrow';
import { SqlV1JsonResponse } from './interfaces';
/**
 * Infers the Arrow data type from a JavaScript value
 */
export declare function inferDataType(value: any): string;
/**
 * Converts a plain JSON response to SQL v1 format
 *
 * Handles different response formats:
 * - data.spiceai.io with application/json: schema array with 'rows' field (legacy)
 * - data.spiceai.io with application/vnd.spiceai.sql.v1+json: schema object with 'data' field
 * - OSS with application/json: plain array of objects
 * - OSS with application/vnd.spiceai.sql.v1+json: schema object with 'data' field
 *
 * @param jsonData - The JSON response data
 * @param _isSpiceAI - Whether this is from data.spiceai.io endpoint (reserved for future use)
 */
export declare function convertToSqlV1Format(jsonData: any, _isSpiceAI?: boolean): SqlV1JsonResponse;
/**
 * Converts JSON data to Arrow Table using schema-aware conversion
 */
export declare function jsonToArrowTable(schema: any[], rows: any[]): Table;
/**
 * Normalizes schema format to ensure consistent field structure
 */
export declare function normalizeSchema(schema: any): any[];
/**
 * Serializes an Arrow Field to JSON format matching Cloud API schema
 * Handles complex types like List, Struct, Map, Timestamp recursively
 */
export declare function serializeArrowField(field: any): any;
