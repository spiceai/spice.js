import { tableFromArrays } from 'apache-arrow';
/**
 * Infers the Arrow data type from a JavaScript value
 */
export function inferDataType(value) {
    if (value === null || value === undefined)
        return 'utf8';
    if (typeof value === 'boolean')
        return 'bool';
    if (typeof value === 'number') {
        return Number.isInteger(value) ? 'int64' : 'float64';
    }
    if (typeof value === 'bigint')
        return 'int64';
    if (value instanceof Date)
        return 'timestamp';
    if (typeof value === 'string')
        return 'utf8';
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
export function convertToSqlV1Format(jsonData, _isSpiceAI = false) {
    // Handle Spice Cloud application/json format with schema as array
    if (jsonData.schema &&
        Array.isArray(jsonData.schema) &&
        (jsonData.rows || jsonData.data)) {
        // Convert schema array to fields format
        const fields = jsonData.schema.map((field) => ({
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
    if (jsonData.schema &&
        jsonData.schema.fields &&
        (jsonData.rows || jsonData.data)) {
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
 * Converts JSON data to Arrow Table using schema-aware conversion
 */
export function jsonToArrowTable(schema, rows) {
    // Handle empty results
    if (rows.length === 0) {
        const columns = {};
        schema.forEach((col) => {
            columns[col.name] = [];
        });
        const table = tableFromArrays(columns);
        // Attach original schema metadata for type conversion
        table._originalSchema = schema;
        return table;
    }
    // Build columns from rows using schema information
    const columns = {};
    // Initialize empty arrays for each column
    schema.forEach((col) => {
        columns[col.name] = [];
    });
    // Populate column arrays from rows
    rows.forEach((row) => {
        if (Array.isArray(row)) {
            // Handle array-based rows
            schema.forEach((col, idx) => {
                columns[col.name].push(row[idx]);
            });
        }
        else {
            // Handle object-based rows
            schema.forEach((col) => {
                const value = row[col.name];
                // Convert undefined to null for Arrow compatibility
                columns[col.name].push(value === undefined ? null : value);
            });
        }
    });
    // Use tableFromArrays - it will infer types from the data
    // Arrow's tableFromArrays can handle most types, but may struggle with:
    // - Empty arrays (can't infer element type)
    // - Mixed-type arrays
    // - Complex nested structures
    try {
        const table = tableFromArrays(columns);
        // Attach original schema metadata for type conversion
        table._originalSchema = schema;
        return table;
    }
    catch (error) {
        // If tableFromArrays fails, try converting problematic values
        const simpleColumns = {};
        schema.forEach((col) => {
            simpleColumns[col.name] = columns[col.name].map((val) => {
                if (val === null || val === undefined)
                    return null;
                // Handle arrays - keep as-is, Arrow will try to infer the type
                if (Array.isArray(val)) {
                    return val;
                }
                // Stringify objects that aren't Dates
                if (typeof val === 'object' && !(val instanceof Date)) {
                    return JSON.stringify(val);
                }
                return val;
            });
        });
        // Try again with simplified columns
        try {
            const table = tableFromArrays(simpleColumns);
            // Attach original schema metadata for type conversion
            table._originalSchema = schema;
            return table;
        }
        catch (secondError) {
            // Last resort: convert everything to strings
            const stringColumns = {};
            schema.forEach((col) => {
                stringColumns[col.name] = simpleColumns[col.name].map((val) => {
                    if (val === null || val === undefined)
                        return null;
                    if (typeof val === 'string')
                        return val;
                    return JSON.stringify(val);
                });
            });
            const table = tableFromArrays(stringColumns);
            // Attach original schema metadata for type conversion
            table._originalSchema = schema;
            return table;
        }
    }
}
/**
 * Normalizes schema format to ensure consistent field structure
 */
export function normalizeSchema(schema) {
    if (!schema)
        return [];
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
function serializeArrowType(type) {
    // Use toString() to reliably identify types across minified/non-minified builds
    const typeStr = type.toString();
    const typeName = type.constructor.name;
    // Handle Timestamp types: { Timestamp: ['Millisecond', null] }
    // Check for Timestamp in string representation since constructor.name may vary
    if (typeStr.startsWith('Timestamp<') ||
        typeName === 'Timestamp_' ||
        typeName === 'Timestamp') {
        const unit = type.unit; // 0=Second, 1=Millisecond, 2=Microsecond, 3=Nanosecond
        const unitNames = ['Second', 'Millisecond', 'Microsecond', 'Nanosecond'];
        const unitName = unitNames[unit] || 'Millisecond';
        return { Timestamp: [unitName, type.timezone || null] };
    }
    // Handle List types: { List: { name: 'item', data_type: ..., nullable: true, dict_id: 0, dict_is_ordered: false, metadata: {} } }
    // Check for List in string representation and presence of children
    if ((typeStr.startsWith('List<') || typeName === 'List') &&
        type.children &&
        type.children.length > 0) {
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
    if ((typeStr.startsWith('Struct<') || typeName === 'Struct') &&
        type.children &&
        type.children.length > 0) {
        return {
            Struct: type.children.map((child) => ({
                name: child.name,
                data_type: serializeArrowType(child.type),
                nullable: child.nullable !== false,
            })),
        };
    }
    // Handle Map types
    // Check for Map in string representation and presence of children
    if ((typeStr.startsWith('Map<') || typeName === 'Map') &&
        type.children &&
        type.children.length > 0) {
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
export function serializeArrowField(field) {
    return {
        name: field.name,
        data_type: serializeArrowType(field.type),
        nullable: field.nullable,
        dict_id: 0,
        dict_is_ordered: false,
        metadata: {},
    };
}
//# sourceMappingURL=arrow-utils.js.map