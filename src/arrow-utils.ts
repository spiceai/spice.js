import { Table, tableFromArrays, tableFromJSON } from 'apache-arrow';
import { SqlV1JsonResponse } from './interfaces';

/**
 * Infers the Arrow data type from a JavaScript value
 */
export function inferDataType(value: any): string {
  if (value === null || value === undefined) return 'utf8';
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'int64' : 'float64';
  }
  if (typeof value === 'bigint') return 'int64';
  if (value instanceof Date) return 'timestamp';
  if (typeof value === 'string') return 'utf8';
  return 'utf8';
}

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
export function convertToSqlV1Format(
  jsonData: any,
  _isSpiceAI: boolean = false,
): SqlV1JsonResponse {
  // Handle Spice Cloud application/json format with schema as array
  if (
    jsonData.schema &&
    Array.isArray(jsonData.schema) &&
    (jsonData.rows || jsonData.data)
  ) {
    // Convert schema array to fields format
    const fields = jsonData.schema.map((field: any) => ({
      name: field.name,
      data_type: field.type?.name || 'utf8',
      nullable: true,
      dict_id: 0,
      dict_is_ordered: false,
      metadata: {},
    }));

    return {
      schema: { fields },
      data: jsonData.data || jsonData.rows, // Prefer 'data' (SQL v1), fallback to 'rows' (legacy)
      row_count: (jsonData.data || jsonData.rows).length,
      execution_time_ms: jsonData.execution_time_ms || 0,
    };
  }

  // If already in SQL v1 format with explicit schema object
  if (
    jsonData.schema &&
    jsonData.schema.fields &&
    (jsonData.rows || jsonData.data)
  ) {
    const data = jsonData.data || jsonData.rows;
    return {
      schema: jsonData.schema,
      data: data, // Prefer 'data' (SQL v1), fallback to 'rows' (legacy)
      row_count: jsonData.row_count || data.length,
      execution_time_ms: jsonData.execution_time_ms || 0,
    };
  }

  // If it's a plain array (data.spiceai.io with application/json)
  if (Array.isArray(jsonData)) {
    if (jsonData.length === 0) {
      return {
        schema: { fields: [] },
        data: [],
        row_count: 0,
        execution_time_ms: 0,
      };
    }

    // Infer schema from first row
    const firstRow = jsonData[0];
    const schema = {
      fields: Object.keys(firstRow).map((key) => ({
        name: key,
        data_type: inferDataType(firstRow[key]),
        nullable: true,
        dict_id: 0,
        dict_is_ordered: false,
        metadata: {},
      })),
    };

    return {
      schema,
      data: jsonData,
      row_count: jsonData.length,
      execution_time_ms: 0,
    };
  }

  // Return empty result for any other format
  return {
    schema: { fields: [] },
    data: [],
    row_count: 0,
    execution_time_ms: 0,
  };
}

/**
 * Converts JSON data to Arrow Table using native Arrow conversion
 */
export function jsonToArrowTable(schema: any[], rows: any[]): Table {
  // Handle empty results
  if (rows.length === 0) {
    const columns: { [key: string]: any[] } = {};
    schema.forEach((col: any) => {
      columns[col.name] = [];
    });
    return tableFromArrays(columns);
  }

  // Convert array-based rows to objects if needed
  const rowObjects = rows.map((row: any) => {
    if (Array.isArray(row)) {
      const obj: any = {};
      schema.forEach((col: any, idx: number) => {
        obj[col.name] = row[idx];
      });
      return obj;
    }
    return row;
  });

  // Use Arrow's native JSON to Table conversion
  return tableFromJSON(rowObjects);
}

/**
 * Normalizes schema format to ensure consistent field structure
 */
export function normalizeSchema(schema: any): any[] {
  if (!schema) return [];

  // If schema has a fields property, use that
  if (schema.fields && Array.isArray(schema.fields)) {
    return schema.fields;
  }

  // If schema is already an array, return it
  if (Array.isArray(schema)) {
    return schema;
  }

  return [];
}

/**
 * Converts Arrow type to JSON format matching Cloud API schema
 */
function serializeArrowType(type: any): any {
  // Use toString() to reliably identify types across minified/non-minified builds
  const typeStr = type.toString();
  const typeName = type.constructor.name;

  // Handle Timestamp types: { Timestamp: ['Millisecond', null] }
  // Check for Timestamp in string representation since constructor.name may vary
  if (typeStr.startsWith('Timestamp<') || typeName === 'Timestamp_' || typeName === 'Timestamp') {
    const unit = type.unit; // 0=Second, 1=Millisecond, 2=Microsecond, 3=Nanosecond
    const unitNames = ['Second', 'Millisecond', 'Microsecond', 'Nanosecond'];
    const unitName = unitNames[unit] || 'Millisecond';
    return { Timestamp: [unitName, type.timezone || null] };
  }

  // Handle List types: { List: { name: 'item', data_type: ..., nullable: true } }
  // Check for List in string representation and presence of children
  if ((typeStr.startsWith('List<') || typeName === 'List') && type.children && type.children.length > 0) {
    const childField = type.children[0];
    return {
      List: {
        name: childField.name || 'item',
        data_type: serializeArrowType(childField.type),
        nullable: childField.nullable !== false,
      },
    };
  }

  // Handle Struct types: { Struct: [...fields...] }
  // Check for Struct in string representation and presence of children
  if ((typeStr.startsWith('Struct<') || typeName === 'Struct') && type.children && type.children.length > 0) {
    return {
      Struct: type.children.map((child: any) => ({
        name: child.name,
        data_type: serializeArrowType(child.type),
        nullable: child.nullable !== false,
      })),
    };
  }

  // Handle Map types
  // Check for Map in string representation and presence of children
  if ((typeStr.startsWith('Map<') || typeName === 'Map') && type.children && type.children.length > 0) {
    const entries = type.children[0]; // Map has a single child 'entries' struct
    if (entries.type.children && entries.type.children.length === 2) {
      return {
        Map: {
          keys: serializeArrowType(entries.type.children[0].type),
          values: serializeArrowType(entries.type.children[1].type),
          sorted: type.keysSorted || false,
        },
      };
    }
  }

  // For simple types, return the string representation
  // (e.g., "Int64", "Float64", "Utf8", "Bool", etc.)
  return type.toString();
}

/**
 * Serializes an Arrow Field to JSON format matching Cloud API schema
 * Handles complex types like List, Struct, Map, Timestamp recursively
 */
export function serializeArrowField(field: any): any {
  return {
    name: field.name,
    data_type: serializeArrowType(field.type),
    nullable: field.nullable,
    dict_id: 0,
    dict_is_ordered: false,
    metadata: {},
  };
}
