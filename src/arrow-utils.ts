import {
  Int64,
  Table,
  Uint64,
  Vector,
  tableFromArrays,
  Utf8,
  vectorFromArray,
} from 'apache-arrow';
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
      // Bare-array schemas may declare `data_type` directly or legacy `type.name`.
      data_type: fieldDataType(field) ?? 'utf8',
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

const INT64_MIN = -(BigInt(1) << BigInt(63));
const INT64_MAX = (BigInt(1) << BigInt(63)) - BigInt(1);
const UINT64_MAX = (BigInt(1) << BigInt(64)) - BigInt(1);

function containsBigInt(value: any): boolean {
  if (typeof value === 'bigint') return true;
  if (Array.isArray(value)) return value.some(containsBigInt);
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    return Object.values(value).some(containsBigInt);
  }
  return false;
}

/** JSON.stringify that writes `bigint`s as exact (unquoted) integer literals. */
export function stringifyValue(value: any): string {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) {
    return (
      '[' +
      value
        .map((v) =>
          v === undefined || typeof v === 'function'
            ? 'null'
            : stringifyValue(v),
        )
        .join(',') +
      ']'
    );
  }
  if (
    value !== null &&
    typeof value === 'object' &&
    typeof value.toJSON !== 'function'
  ) {
    const parts: string[] = [];
    for (const key of Object.keys(value)) {
      const v = value[key];
      if (v === undefined || typeof v === 'function') continue;
      parts.push(JSON.stringify(key) + ':' + stringifyValue(v));
    }
    return '{' + parts.join(',') + '}';
  }
  return JSON.stringify(value);
}

/**
 * How a column of an HTTP result holding integers outside ±(2^53 - 1) (parsed
 * as `bigint` by {@link parseJsonLossless}) is built:
 * - `int64` / `uint64`: a scalar integer column, typed Int64/UInt64 with every
 *   value widened to `bigint`, the same values the Arrow Flight path returns
 * - `json`: nested (List/Struct) values, kept as exact JSON text
 * - `number`: a column the server declares as a non-integer type (e.g.
 *   Float64), where the value is a double anyway; converted as before
 */
export type Int64ColumnPlan = 'int64' | 'uint64' | 'json' | 'number';

/** Declared non-integer numeric types, where values are doubles anyway. */
export function isNonIntegerNumericDeclared(dataType: string): boolean {
  return /^(?:float|double|decimal|numeric|real)/i.test(dataType.trim());
}

/**
 * Decides, once per result, how each column holding unsafe integers is built,
 * so streamed chunks of one result all share one schema. Columns without such
 * values get no plan and are inferred exactly as before.
 */
export function planInt64Columns(
  schema: any[],
  rows: any[],
): Map<string, Int64ColumnPlan> {
  const plan = new Map<string, Int64ColumnPlan>();
  schema.forEach((col: any, idx: number) => {
    const values = rows.map((row: any) =>
      Array.isArray(row) ? row[idx] : row?.[col.name],
    );
    if (!values.some(containsBigInt)) return;

    const declared = typeof col.data_type === 'string' ? col.data_type : '';
    const scalarIntegers = values.every(
      (v) =>
        v === null ||
        v === undefined ||
        typeof v === 'bigint' ||
        (typeof v === 'number' && Number.isInteger(v)),
    );
    if (!scalarIntegers) {
      // Only unsafe integer leaves the schema does not declare as a
      // non-integer type (Float64, Decimal, ...) need exact JSON text; e.g. a
      // declared List<Float64> or Struct of Float64 stays a number column.
      const nested = values.some(
        (v) =>
          v !== null &&
          typeof v === 'object' &&
          hasUnsafeIntegerLeaf(v, col.data_type),
      );
      plan.set(col.name, nested ? 'json' : 'number');
      return;
    }
    if (isNonIntegerNumericDeclared(declared)) {
      // e.g. Float64 / Decimal: not an Int64 column, keep prior behavior.
      plan.set(col.name, 'number');
      return;
    }
    // Range-check every value, not just the unsafe ones, so e.g. -1 next to
    // UInt64 max is not silently wrapped.
    const bigints = values
      .filter((v) => v !== null && v !== undefined)
      .map((v) => BigInt(v as number | bigint));
    const fitsInt64 = bigints.every((v) => v >= INT64_MIN && v <= INT64_MAX);
    const fitsUint64 = bigints.every((v) => v >= 0 && v <= UINT64_MAX);
    const unsignedDeclared = /^u(?:int|big)/i.test(declared.trim());
    if (unsignedDeclared ? fitsUint64 : fitsInt64) {
      plan.set(col.name, unsignedDeclared ? 'uint64' : 'int64');
    } else if (fitsUint64) {
      plan.set(col.name, 'uint64');
    } else {
      // Outside every 64-bit range: keep the exact digits as text.
      plan.set(col.name, 'json');
    }
  });
  return plan;
}

/** Child data type of a declared List / LargeList / FixedSizeList type. */
function listChildType(dataType: any): any {
  if (!dataType || typeof dataType !== 'object') return undefined;
  const list = dataType.List ?? dataType.LargeList;
  if (list) return fieldDataType(list);
  if (Array.isArray(dataType.FixedSizeList)) {
    return fieldDataType(dataType.FixedSizeList[0]);
  }
  return undefined;
}

/** Child fields of a declared Struct type, by name (first match wins). */
function structChildTypes(dataType: any): Map<string, any> | null {
  if (!dataType || typeof dataType !== 'object') return null;
  if (!Array.isArray(dataType.Struct)) return null;
  const byName = new Map<string, any>();
  for (const f of dataType.Struct) {
    if (f?.name != null && !byName.has(f.name)) {
      byName.set(f.name, fieldDataType(f));
    }
  }
  return byName;
}

/**
 * Whether a value holds a `bigint` leaf that is not declared as a
 * non-integer numeric type, i.e. a real unsafe integer.
 */
function hasUnsafeIntegerLeaf(value: any, dataType: any): boolean {
  if (typeof value === 'bigint') {
    return !(
      typeof dataType === 'string' && isNonIntegerNumericDeclared(dataType)
    );
  }
  if (Array.isArray(value)) {
    const childType = listChildType(dataType);
    return value.some((item) => hasUnsafeIntegerLeaf(item, childType));
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const children = structChildTypes(dataType);
    return Object.keys(value).some((key) =>
      hasUnsafeIntegerLeaf(value[key], children?.get(key)),
    );
  }
  return false;
}

/** Deep copy with every `bigint` turned back into a number. */
function bigintsToNumbers(value: any): any {
  if (typeof value === 'bigint') return Number(value);
  if (!containsBigInt(value)) return value;
  if (Array.isArray(value)) return value.map(bigintsToNumbers);
  const out: any = {};
  for (const key of Object.keys(value)) {
    // Own property even for "__proto__", matching parseJsonLossless.
    Object.defineProperty(out, key, {
      value: bigintsToNumbers(value[key]),
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return out;
}

function buildPlannedColumn(
  plan: Int64ColumnPlan | undefined,
  values: any[],
): any {
  switch (plan) {
    case undefined:
      return values;
    case 'number':
      // Every bigint left here is a double anyway (declared non-integer leaf,
      // or a scalar column mixing them with floats): restore plain numbers.
      return values.map(bigintsToNumbers);
    case 'json':
      // Explicitly Utf8, so every chunk of a result (all-null ones included)
      // has the same schema. Strings are quoted JSON so Flight→HTTP sqlJson()
      // can parseJsonLossless every non-null cell.
      return vectorFromArray(
        values.map((v) =>
          v === null || v === undefined ? null : stringifyValue(v),
        ),
        new Utf8(),
      );
    default:
      return vectorFromArray(
        values.map((v) =>
          v === null || v === undefined ? null : BigInt(v as number | bigint),
        ),
        plan === 'uint64' ? new Uint64() : new Int64(),
      );
  }
}

/** tableFromArrays that also accepts already-typed Vector columns. */
function tableFromColumns(columns: { [key: string]: any }): Table {
  const vectors: { [key: string]: any } = {};
  for (const name of Object.keys(columns)) {
    const column = columns[name];
    vectors[name] = column instanceof Vector ? column : vectorFromArray(column);
  }
  return new Table(vectors);
}

/**
 * Converts JSON data to Arrow Table using schema-aware conversion
 */
export function jsonToArrowTable(
  schema: any[],
  rows: any[],
  int64Plan: Map<string, Int64ColumnPlan> = planInt64Columns(schema, rows),
): Table {
  const table = buildJsonArrowTable(schema, rows, int64Plan);
  // Columns holding exact JSON text (see Int64ColumnPlan), so consumers such
  // as sqlJson() can restore their nested values.
  (table as any)[JSON_TEXT_COLUMNS] = new Set(
    [...int64Plan].filter(([, p]) => p === 'json').map(([name]) => name),
  );
  return table;
}

/** Table property listing the column names kept as exact JSON text. */
export const JSON_TEXT_COLUMNS = '_jsonTextColumns';

/** Names of the columns of a table from jsonToArrowTable kept as JSON text. */
export function jsonTextColumnsOf(table: Table): Set<string> {
  return (table as any)?.[JSON_TEXT_COLUMNS] ?? new Set<string>();
}

/**
 * JSON-response schema fields for a table from jsonToArrowTable: columns kept
 * as exact JSON text only for sql() (temporarily Utf8) advertise the server's
 * declared List/Struct/... field again, since sqlJson() restores their nested
 * values. Other fields use `serialize` on the Arrow field.
 */
export function jsonResponseFields(
  table: Table,
  serialize: (field: any) => any,
): any[] {
  const jsonText = jsonTextColumnsOf(table);
  const original = normalizeSchema((table as any)?._originalSchema);
  return table.schema.fields.map((field) => {
    if (jsonText.has(field.name)) {
      const declared = original.find((f: any) => f?.name === field.name);
      const dataType = fieldDataType(declared);
      if (dataType && typeof dataType === 'object') {
        return {
          name: field.name,
          data_type: dataType,
          nullable: declared.nullable ?? true,
          dict_id: declared.dict_id ?? 0,
          dict_is_ordered: declared.dict_is_ordered ?? false,
          metadata: declared.metadata ?? {},
        };
      }
    }
    return serialize(field);
  });
}

/** Declared data type of a schema field (object or legacy array form). */
function fieldDataType(field: any): any {
  if (!field) return undefined;
  if (field.data_type !== undefined) return field.data_type;
  // Legacy array-schema fields: { name, type: { name: 'Float64' } }
  if (field.type && typeof field.type === 'object' && field.type.name) {
    return field.type.name;
  }
  if (typeof field.type === 'string') return field.type;
  return undefined;
}

function convertUnsafeInteger(value: any, dataType: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') {
    if (typeof dataType === 'string' && isNonIntegerNumericDeclared(dataType)) {
      return Number(value);
    }
    return value.toString();
  }
  if (Array.isArray(value)) {
    const childType = listChildType(dataType);
    return value.map((item) => convertUnsafeInteger(item, childType));
  }
  if (typeof value === 'object') {
    const byName = structChildTypes(dataType);
    const out: any = {};
    for (const key of Object.keys(value)) {
      // Own property even for "__proto__", matching parseJsonLossless.
      Object.defineProperty(out, key, {
        value: convertUnsafeInteger(value[key], byName?.get(key)),
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
    return out;
  }
  return value;
}

/**
 * Schema-aware normalization of a losslessly parsed HTTP JSON result (unsafe
 * integers as `bigint`): a leaf the server declares as a non-integer type
 * (Float64, Decimal, ...), including nested List/Struct children, keeps a
 * number; any other unsafe integer becomes its exact decimal string. Rows may
 * be arrays or objects; they are updated in place. `fields` may come from a
 * `{fields:[...]}` schema or a bare array schema, and may declare types via
 * `data_type` or legacy `type.name`.
 */
export function normalizeUnsafeIntegers(fields: any[], rows: any[]): any[] {
  const normalized = (fields || []).map((f: any) => ({
    name: f?.name,
    data_type: fieldDataType(f),
  }));
  // O(1) name lookup; set-once so duplicate names keep first-match (.find) behavior.
  const byName = new Map<string, any>();
  for (const f of normalized) {
    if (f.name != null && !byName.has(f.name)) {
      byName.set(f.name, f.data_type);
    }
  }
  rows.forEach((row: any, i: number) => {
    if (Array.isArray(row)) {
      rows[i] = row.map((v: any, idx: number) =>
        convertUnsafeInteger(v, normalized[idx]?.data_type),
      );
    } else if (row !== null && typeof row === 'object') {
      for (const k of Object.keys(row)) {
        // Own property write so a "__proto__" column name cannot invoke the setter.
        Object.defineProperty(row, k, {
          value: convertUnsafeInteger(row[k], byName.get(k)),
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
    }
  });
  return rows;
}

function buildJsonArrowTable(
  schema: any[],
  rows: any[],
  int64Plan: Map<string, Int64ColumnPlan>,
): Table {
  // Handle empty results
  if (rows.length === 0) {
    const columns: { [key: string]: any[] } = {};
    schema.forEach((col: any) => {
      columns[col.name] = [];
    });
    const table = tableFromArrays(columns);
    // Attach original schema metadata for type conversion
    (table as any)._originalSchema = schema;
    return table;
  }

  // Build columns from rows using schema information
  const columns: { [key: string]: any[] } = {};

  // Initialize empty arrays for each column
  schema.forEach((col: any) => {
    columns[col.name] = [];
  });

  // Populate column arrays from rows
  rows.forEach((row: any) => {
    if (Array.isArray(row)) {
      // Handle array-based rows
      schema.forEach((col: any, idx: number) => {
        columns[col.name].push(row[idx]);
      });
    } else {
      // Handle object-based rows
      schema.forEach((col: any) => {
        const value = row[col.name];
        // Convert undefined to null for Arrow compatibility
        columns[col.name].push(value === undefined ? null : value);
      });
    }
  });

  // Keep 64-bit integers exact; other columns are inferred as before.
  schema.forEach((col: any) => {
    columns[col.name] = buildPlannedColumn(
      int64Plan.get(col.name),
      columns[col.name],
    );
  });

  // Use tableFromArrays - it will infer types from the data
  // Arrow's tableFromArrays can handle most types, but may struggle with:
  // - Empty arrays (can't infer element type)
  // - Mixed-type arrays
  // - Complex nested structures
  try {
    const table = tableFromColumns(columns);
    // Attach original schema metadata for type conversion
    (table as any)._originalSchema = schema;
    return table;
  } catch (error) {
    // If tableFromArrays fails, try converting problematic values
    // Typed 64-bit integer vectors already built are kept as they are.
    const simpleColumns: { [key: string]: any } = {};

    schema.forEach((col: any) => {
      if (columns[col.name] instanceof Vector) {
        simpleColumns[col.name] = columns[col.name];
        return;
      }
      simpleColumns[col.name] = columns[col.name].map((val: any) => {
        if (val === null || val === undefined) return null;

        // Handle arrays - keep as-is, Arrow will try to infer the type
        if (Array.isArray(val)) {
          return val;
        }

        // Stringify objects that aren't Dates
        if (typeof val === 'object' && !(val instanceof Date)) {
          return stringifyValue(val);
        }

        return val;
      });
    });

    // Try again with simplified columns
    try {
      const table = tableFromColumns(simpleColumns);
      // Attach original schema metadata for type conversion
      (table as any)._originalSchema = schema;
      return table;
    } catch (secondError) {
      // Last resort: convert everything to strings
      const stringColumns: { [key: string]: any } = {};
      schema.forEach((col: any) => {
        if (simpleColumns[col.name] instanceof Vector) {
          stringColumns[col.name] = simpleColumns[col.name];
          return;
        }
        stringColumns[col.name] = simpleColumns[col.name].map((val: any) => {
          if (val === null || val === undefined) return null;
          if (typeof val === 'string') return val;
          return stringifyValue(val);
        });
      });
      const table = tableFromColumns(stringColumns);
      // Attach original schema metadata for type conversion
      (table as any)._originalSchema = schema;
      return table;
    }
  }
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
  if (
    typeStr.startsWith('Timestamp<') ||
    typeName === 'Timestamp_' ||
    typeName === 'Timestamp'
  ) {
    const unit = type.unit; // 0=Second, 1=Millisecond, 2=Microsecond, 3=Nanosecond
    const unitNames = ['Second', 'Millisecond', 'Microsecond', 'Nanosecond'];
    const unitName = unitNames[unit] || 'Millisecond';
    return { Timestamp: [unitName, type.timezone || null] };
  }

  // Handle List types: { List: { name: 'item', data_type: ..., nullable: true, dict_id: 0, dict_is_ordered: false, metadata: {} } }
  // Check for List in string representation and presence of children
  if (
    (typeStr.startsWith('List<') || typeName === 'List') &&
    type.children &&
    type.children.length > 0
  ) {
    const childField = type.children[0];
    return {
      List: {
        name: childField.name || 'item',
        data_type: serializeArrowType(childField.type),
        nullable: childField.nullable !== false,
        dict_id: 0,
        dict_is_ordered: false,
        metadata: {},
      },
    };
  }

  // Handle Struct types: { Struct: [...fields...] }
  // Check for Struct in string representation and presence of children
  if (
    (typeStr.startsWith('Struct<') || typeName === 'Struct') &&
    type.children &&
    type.children.length > 0
  ) {
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
  if (
    (typeStr.startsWith('Map<') || typeName === 'Map') &&
    type.children &&
    type.children.length > 0
  ) {
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
