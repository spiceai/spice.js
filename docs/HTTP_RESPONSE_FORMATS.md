# HTTP Response Format Handling

This document explains how Spice.js handles different HTTP response formats from various endpoints.

## Response Format Overview

Spice.js supports different JSON response formats depending on the endpoint and the `Accept` header used:

### 1. data.spiceai.io Endpoint

#### With `Accept: application/json`

Returns **structured format** with schema and `rows` field:

```json
{
  "rowCount": 3,
  "schema": [
    {
      "name": "repo",
      "type": { "name": "VARCHAR" }
    },
    {
      "name": "number",
      "type": { "name": "BIGINT" }
    },
    {
      "name": "state",
      "type": { "name": "VARCHAR" }
    },
    {
      "name": "created_at",
      "type": { "name": "TIMESTAMP" }
    }
  ],
  "rows": [
    {
      "repo": "spiceai/spiceai",
      "number": 1,
      "state": "MERGED",
      "created_at": "2021-08-09 09:30:10Z"
    },
    {
      "repo": "spiceai/spiceai",
      "number": 2,
      "state": "MERGED",
      "created_at": "2021-08-09 10:35:05Z"
    },
    {
      "repo": "spiceai/spiceai",
      "number": 3,
      "state": "MERGED",
      "created_at": "2021-08-10 09:27:21Z"
    }
  ]
}
```

**Note**: This format uses a simpler schema structure where:

- Schema is an array (not an object with `fields`)
- Types are nested objects: `{ "type": { "name": "VARCHAR" } }`
- Row count is in `rowCount` (camelCase)

#### With `Accept: application/vnd.spiceai.sql.v1+json` (Preferred)

Returns **structured format** with full schema metadata and `data` field:

```json
{
  "row_count": 2,
  "schema": {
    "fields": [
      {
        "name": "VendorID",
        "data_type": "Int32",
        "nullable": true,
        "dict_id": 0,
        "dict_is_ordered": false,
        "metadata": {}
      },
      {
        "name": "trip_distance",
        "data_type": "Float64",
        "nullable": true,
        "dict_id": 0,
        "dict_is_ordered": false,
        "metadata": {}
      },
      {
        "name": "total_amount",
        "data_type": "Float64",
        "nullable": true,
        "dict_id": 0,
        "dict_is_ordered": false,
        "metadata": {}
      }
    ],
    "metadata": {}
  },
  "data": [
    {
      "VendorID": 2,
      "trip_distance": 5.48,
      "total_amount": 36.96
    },
    {
      "VendorID": 1,
      "trip_distance": 3.0,
      "total_amount": 21.6
    }
  ]
}
```

This format includes:

- **`row_count`**: Total number of rows returned
- **`schema`**: Detailed schema with full Arrow type information including:
  - Exact data types (Int32, Float64, Timestamp, etc.)
  - Nullability information
  - Dictionary encoding metadata
  - Custom metadata fields
- **`data`**: Array of row objects

### 2. OSS/Self-Hosted Spice Runtime

#### With `Accept: application/json`

Returns a **plain JSON array** of objects:

```json
[
  { "id": 1, "name": "Alice" },
  { "id": 2, "name": "Bob" }
]
```

#### With `Accept: application/vnd.spiceai.sql.v1+json`

Returns **structured format** with schema and `data` field:

```json
{
  "schema": {
    "fields": [
      { "name": "id", "data_type": "int64", "nullable": true },
      { "name": "name", "data_type": "utf8", "nullable": true }
    ]
  },
  "data": [
    { "id": 1, "name": "Alice" },
    { "id": 2, "name": "Bob" }
  ]
}
```

## Implementation Details

### Automatic Endpoint Detection

The `SpiceClient` automatically detects whether it's connecting to `data.spiceai.io` (Spice Cloud) or a self-hosted runtime and uses the appropriate `Accept` header:

```typescript
// Determine if this is data.spiceai.io endpoint
const isSpiceCloud = this._httpUrl.includes('data.spiceai.io');

// Use appropriate Accept header based on endpoint
const acceptHeader = isSpiceCloud
  ? 'application/vnd.spiceai.sql.v1+json' // Spice Cloud: returns schema with 'data' field (preferred)
  : 'application/json'; // OSS: returns plain JSON array
```

**Note:** For Spice Cloud (data.spiceai.io), we favor using `application/vnd.spiceai.sql.v1+json` which returns the structured format with the `data` field. This provides several benefits:

1. **Explicit Schema Information**: Full Apache Arrow type metadata (Int32, Float64, Timestamp types, etc.)
2. **Better Type Safety**: Precise type information for accurate data conversion
3. **Metadata Support**: Access to dictionary encoding and custom metadata
4. **Row Count**: Includes total row count without needing to count the array
5. **Future-Proof**: Extensible format for additional metadata and features

### Unified Response Parsing

The `convertToSqlV1Format()` function in `arrow-utils.ts` normalizes all response formats to a consistent internal structure:

```typescript
export function convertToSqlV1Format(
  jsonData: any,
  _isSpiceAI: boolean = false,
): {
  schema: { fields: any[] };
  rows: any[];
};
```

This function handles:

- Plain arrays (infers schema from first row)
- Structured responses with `rows` field
- Structured responses with `data` field
- Empty responses

### Arrow Table Conversion

All normalized data is then converted to Apache Arrow Tables for consistent, high-performance data handling:

```typescript
const table = jsonToArrowTable(schema, rows);
```

## Usage in Applications

### Direct SQL Queries (Arrow Format)

```typescript
const client = new SpiceClient({ apiKey: 'your-api-key' });
const table = await client.sql('SELECT * FROM dataset');

// Access data as Arrow Table
const rows = table.toArray();
console.log(rows[0]); // { id: 1, name: 'Alice', ... }
```

### JSON Queries with Metadata

```typescript
const result = await client.sqlJson('SELECT * FROM dataset');

// Access structured JSON response
console.log(result.row_count); // Number of rows
console.log(result.schema); // Schema information
console.log(result.data); // Plain JavaScript objects
console.log(result.execution_time_ms); // Query execution time
```

## Testing

The test suite includes comprehensive tests for all response formats:

- `arrow-utils.test.ts` - Tests for response format conversion
- `test/apps/vercel-nextjs/` - Integration tests for both endpoints

### Running Tests

```bash
# Run all tests
npm test

# Run arrow-utils tests specifically
npm test -- arrow-utils.test.ts
```

## Benefits

1. **Transparent**: Applications don't need to know which endpoint format is being used
2. **Type-Safe**: All data is converted to strongly-typed Arrow Tables
3. **Performance**: Arrow format provides efficient columnar data access
4. **Compatibility**: Works with both cloud (data.spiceai.io) and self-hosted runtimes
5. **Flexible**: Supports both streaming and single-response patterns

## Migration Guide

If you're updating from an older version of spice.js that didn't handle these different formats:

1. No code changes required - the library handles format detection automatically
2. Existing code using `sql()` and `sqlJson()` will continue to work
3. Both cloud and self-hosted endpoints are supported transparently

## See Also

- [Arrow Utils Tests](../src/arrow-utils.test.ts)
- [Client Common Implementation](../src/client-common.ts)
- [Vercel Next.js Test App](../test/apps/vercel-nextjs/)
