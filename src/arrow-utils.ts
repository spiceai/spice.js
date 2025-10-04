import { Table, tableFromArrays, tableFromJSON } from 'apache-arrow';

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
 * - data.spiceai.io with application/json: schema array with 'rows' field
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
): {
  schema: { fields: any[] };
  rows: any[];
} {
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
    }));

    return {
      schema: { fields },
      rows: jsonData.rows || jsonData.data,
    };
  }

  // If already in SQL v1 format with explicit schema object
  if (
    jsonData.schema &&
    jsonData.schema.fields &&
    (jsonData.rows || jsonData.data)
  ) {
    return {
      schema: jsonData.schema,
      rows: jsonData.rows || jsonData.data,
    };
  }

  // If it's a plain array (data.spiceai.io with application/json)
  if (Array.isArray(jsonData)) {
    if (jsonData.length === 0) {
      return {
        schema: { fields: [] },
        rows: [],
      };
    }

    // Infer schema from first row
    const firstRow = jsonData[0];
    const schema = {
      fields: Object.keys(firstRow).map((key) => ({
        name: key,
        data_type: inferDataType(firstRow[key]),
        nullable: true,
      })),
    };

    return {
      schema,
      rows: jsonData,
    };
  }

  // Return empty result for any other format
  return {
    schema: { fields: [] },
    rows: [],
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
 * Serializes an Arrow Field to JSON format matching Cloud API schema
 * Handles complex types like List, Struct, Map recursively
 */
export function serializeArrowField(field: any): any {
  const type = field.type;
  const typeName = type.constructor.name;

  // For simple types, use string representation
  if (!type.children || type.children.length === 0) {
    return {
      name: field.name,
      data_type: type.toString(),
      nullable: field.nullable,
      dict_id: 0,
      dict_is_ordered: false,
      metadata: {},
    };
  }

  // For complex types (List, Struct, Map, etc.), create nested structure
  // Match Cloud API format
  const dataType: any = {};
  dataType[typeName] = serializeArrowField(type.children[0]);

  return {
    name: field.name,
    data_type: dataType,
    nullable: field.nullable,
    dict_id: 0,
    dict_is_ordered: false,
    metadata: {},
  };
}
