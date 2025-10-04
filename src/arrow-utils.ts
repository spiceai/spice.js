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
 */
export function convertToSqlV1Format(jsonData: any): {
  schema: { fields: any[] };
  rows: any[];
} {
  // If already in SQL v1 format, return as-is
  if (jsonData.schema && (jsonData.rows || jsonData.data)) {
    return {
      schema: jsonData.schema,
      rows: jsonData.rows || jsonData.data,
    };
  }

  // If it's an array of objects, infer schema from first row
  if (Array.isArray(jsonData) && jsonData.length > 0) {
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

  // Return empty result
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
