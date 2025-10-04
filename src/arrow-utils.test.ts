import { describe, it, expect } from '@jest/globals';
import { Table } from 'apache-arrow';
import {
  inferDataType,
  convertToSqlV1Format,
  jsonToArrowTable,
  normalizeSchema,
} from './arrow-utils';

describe('arrow-utils', () => {
  describe('inferDataType', () => {
    it('should infer utf8 for null values', () => {
      expect(inferDataType(null)).toBe('utf8');
      expect(inferDataType(undefined)).toBe('utf8');
    });

    it('should infer bool for boolean values', () => {
      expect(inferDataType(true)).toBe('bool');
      expect(inferDataType(false)).toBe('bool');
    });

    it('should infer int64 for integer numbers', () => {
      expect(inferDataType(42)).toBe('int64');
      expect(inferDataType(0)).toBe('int64');
      expect(inferDataType(-100)).toBe('int64');
    });

    it('should infer float64 for floating point numbers', () => {
      expect(inferDataType(3.14)).toBe('float64');
      expect(inferDataType(-2.5)).toBe('float64');
      expect(inferDataType(0.1)).toBe('float64');
    });

    it('should infer int64 for bigint values', () => {
      expect(inferDataType(BigInt(123))).toBe('int64');
      expect(inferDataType(BigInt('9007199254740991'))).toBe('int64');
    });

    it('should infer timestamp for Date objects', () => {
      expect(inferDataType(new Date())).toBe('timestamp');
      expect(inferDataType(new Date('2024-01-01'))).toBe('timestamp');
    });

    it('should infer utf8 for strings', () => {
      expect(inferDataType('hello')).toBe('utf8');
      expect(inferDataType('')).toBe('utf8');
    });

    it('should default to utf8 for unknown types', () => {
      expect(inferDataType({})).toBe('utf8');
      expect(inferDataType([])).toBe('utf8');
      expect(inferDataType(Symbol('test'))).toBe('utf8');
    });
  });

  describe('convertToSqlV1Format', () => {
    it('should return data already in SQL v1 format with rows', () => {
      const input = {
        schema: { fields: [{ name: 'id', data_type: 'int64' }] },
        rows: [[1], [2]],
      };
      const result = convertToSqlV1Format(input);
      expect(result).toEqual({
        schema: { fields: [{ name: 'id', data_type: 'int64' }] },
        rows: [[1], [2]],
      });
    });

    it('should return data already in SQL v1 format with data field', () => {
      const input = {
        schema: { fields: [{ name: 'id', data_type: 'int64' }] },
        data: [[1], [2]],
      };
      const result = convertToSqlV1Format(input);
      expect(result).toEqual({
        schema: { fields: [{ name: 'id', data_type: 'int64' }] },
        rows: [[1], [2]],
      });
    });

    it('should convert plain array of objects to SQL v1 format', () => {
      const input = [
        { id: 1, name: 'Alice', active: true },
        { id: 2, name: 'Bob', active: false },
      ];
      const result = convertToSqlV1Format(input);

      expect(result.schema.fields).toHaveLength(3);
      expect(result.schema.fields).toContainEqual({
        name: 'id',
        data_type: 'int64',
        nullable: true,
      });
      expect(result.schema.fields).toContainEqual({
        name: 'name',
        data_type: 'utf8',
        nullable: true,
      });
      expect(result.schema.fields).toContainEqual({
        name: 'active',
        data_type: 'bool',
        nullable: true,
      });
      expect(result.rows).toEqual(input);
    });

    it('should handle empty arrays', () => {
      const result = convertToSqlV1Format([]);
      expect(result).toEqual({
        schema: { fields: [] },
        rows: [],
      });
    });

    it('should handle empty objects', () => {
      const result = convertToSqlV1Format({});
      expect(result).toEqual({
        schema: { fields: [] },
        rows: [],
      });
    });

    it('should infer correct types for mixed data', () => {
      const input = [
        {
          id: 1,
          price: 19.99,
          name: 'Product',
          created: new Date('2024-01-01'),
          count: BigInt(1000),
        },
      ];
      const result = convertToSqlV1Format(input);

      const fieldsByName = Object.fromEntries(
        result.schema.fields.map((f: any) => [f.name, f]),
      );

      expect(fieldsByName.id.data_type).toBe('int64');
      expect(fieldsByName.price.data_type).toBe('float64');
      expect(fieldsByName.name.data_type).toBe('utf8');
      expect(fieldsByName.created.data_type).toBe('timestamp');
      expect(fieldsByName.count.data_type).toBe('int64');
    });

    it('should handle data.spiceai.io format with rows field', () => {
      // data.spiceai.io with application/json returns schema with 'rows'
      const input = {
        schema: { fields: [{ name: 'id', data_type: 'int64' }] },
        rows: [{ id: 1 }, { id: 2 }],
      };
      const result = convertToSqlV1Format(input, true);

      expect(result.schema).toEqual(input.schema);
      expect(result.rows).toEqual(input.rows);
    });

    it('should handle OSS format (plain array)', () => {
      // OSS with application/json returns plain array
      const input = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      const result = convertToSqlV1Format(input, false);

      expect(result.schema.fields).toHaveLength(2);
      expect(result.rows).toEqual(input);
    });

    it('should handle SQL v1 format with data field', () => {
      // Both endpoints with application/vnd.spiceai.sql.v1+json return 'data'
      const input = {
        schema: { fields: [{ name: 'id', data_type: 'int64' }] },
        data: [{ id: 1 }, { id: 2 }],
      };
      const result = convertToSqlV1Format(input);

      expect(result.schema).toEqual(input.schema);
      expect(result.rows).toEqual(input.data);
    });

    it('should handle Spice Cloud application/json format with schema array', () => {
      // Spice Cloud with application/json returns schema as array with nested type objects
      const input = {
        rowCount: 2,
        schema: [
          { name: 'repo', type: { name: 'VARCHAR' } },
          { name: 'number', type: { name: 'BIGINT' } },
        ],
        rows: [
          { repo: 'spiceai/spiceai', number: 1 },
          { repo: 'spiceai/spiceai', number: 2 },
        ],
      };
      const result = convertToSqlV1Format(input, true);

      expect(result.schema.fields).toHaveLength(2);
      expect(result.schema.fields[0]).toEqual({
        name: 'repo',
        data_type: 'VARCHAR',
        nullable: true,
      });
      expect(result.schema.fields[1]).toEqual({
        name: 'number',
        data_type: 'BIGINT',
        nullable: true,
      });
      expect(result.rows).toEqual(input.rows);
    });
  });

  describe('normalizeSchema', () => {
    it('should return empty array for null/undefined', () => {
      expect(normalizeSchema(null)).toEqual([]);
      expect(normalizeSchema(undefined)).toEqual([]);
    });

    it('should extract fields from schema object', () => {
      const schema = {
        fields: [
          { name: 'id', data_type: 'int64' },
          { name: 'name', data_type: 'utf8' },
        ],
      };
      expect(normalizeSchema(schema)).toEqual(schema.fields);
    });

    it('should return array schema as-is', () => {
      const schema = [
        { name: 'id', data_type: 'int64' },
        { name: 'name', data_type: 'utf8' },
      ];
      expect(normalizeSchema(schema)).toEqual(schema);
    });

    it('should return empty array for invalid schema', () => {
      expect(normalizeSchema('invalid')).toEqual([]);
      expect(normalizeSchema(123)).toEqual([]);
      expect(normalizeSchema({})).toEqual([]);
    });
  });

  describe('jsonToArrowTable', () => {
    it('should create empty table for empty rows', () => {
      const schema = [
        { name: 'id', data_type: 'int64' },
        { name: 'name', data_type: 'utf8' },
      ];
      const table = jsonToArrowTable(schema, []);

      expect(table).toBeInstanceOf(Table);
      expect(table.numRows).toBe(0);
      expect(table.numCols).toBe(2);
    });

    it('should convert object-based rows to Arrow table', () => {
      const schema = [
        { name: 'id', data_type: 'int64' },
        { name: 'name', data_type: 'utf8' },
      ];
      const rows = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      const table = jsonToArrowTable(schema, rows);

      expect(table).toBeInstanceOf(Table);
      expect(table.numRows).toBe(2);
      expect(table.numCols).toBe(2);

      const result = table.toArray();
      expect(result[0].id).toBe(1);
      expect(result[0].name).toBe('Alice');
      expect(result[1].id).toBe(2);
      expect(result[1].name).toBe('Bob');
    });

    it('should convert array-based rows to Arrow table', () => {
      const schema = [
        { name: 'id', data_type: 'int64' },
        { name: 'name', data_type: 'utf8' },
      ];
      const rows = [
        [1, 'Alice'],
        [2, 'Bob'],
      ];
      const table = jsonToArrowTable(schema, rows);

      expect(table).toBeInstanceOf(Table);
      expect(table.numRows).toBe(2);
      expect(table.numCols).toBe(2);

      const result = table.toArray();
      expect(result[0].id).toBe(1);
      expect(result[0].name).toBe('Alice');
      expect(result[1].id).toBe(2);
      expect(result[1].name).toBe('Bob');
    });

    it('should handle mixed types correctly', () => {
      const schema = [
        { name: 'id', data_type: 'int64' },
        { name: 'price', data_type: 'float64' },
        { name: 'active', data_type: 'bool' },
        { name: 'name', data_type: 'utf8' },
      ];
      const rows = [
        { id: 1, price: 19.99, active: true, name: 'Product A' },
        { id: 2, price: 29.99, active: false, name: 'Product B' },
      ];
      const table = jsonToArrowTable(schema, rows);

      expect(table.numRows).toBe(2);
      expect(table.numCols).toBe(4);

      const result = table.toArray();
      expect(result[0].id).toBe(1);
      expect(result[0].price).toBeCloseTo(19.99, 2);
      expect(result[0].active).toBe(true);
      expect(result[0].name).toBe('Product A');
    });

    it('should handle null values', () => {
      const schema = [
        { name: 'id', data_type: 'int64' },
        { name: 'name', data_type: 'utf8' },
      ];
      const rows = [
        { id: 1, name: 'Alice' },
        { id: 2, name: null },
      ];
      const table = jsonToArrowTable(schema, rows);

      const result = table.toArray();
      expect(result[0].name).toBe('Alice');
      expect(result[1].name).toBeNull();
    });

    it('should handle single row', () => {
      const schema = [{ name: 'id', data_type: 'int64' }];
      const rows = [{ id: 42 }];
      const table = jsonToArrowTable(schema, rows);

      expect(table.numRows).toBe(1);
      const result = table.toArray();
      expect(result[0].id).toBe(42);
    });

    it('should handle large datasets efficiently', () => {
      const schema = [
        { name: 'id', data_type: 'int64' },
        { name: 'value', data_type: 'float64' },
      ];
      const rows = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        value: i * 1.5,
      }));

      const table = jsonToArrowTable(schema, rows);

      expect(table.numRows).toBe(1000);
      const result = table.toArray();
      expect(result[0].id).toBe(0);
      expect(result[999].id).toBe(999);
      expect(result[999].value).toBeCloseTo(1498.5, 1);
    });
  });

  describe('integration tests', () => {
    it('should handle complete conversion pipeline', () => {
      // Simulate raw API response
      const apiResponse = [
        { id: 1, name: 'Alice', score: 95.5, active: true },
        { id: 2, name: 'Bob', score: 87.3, active: false },
        { id: 3, name: 'Charlie', score: 92.1, active: true },
      ];

      // Convert to SQL v1 format
      const sqlV1 = convertToSqlV1Format(apiResponse);
      expect(sqlV1.rows).toHaveLength(3);

      // Normalize schema
      const schema = normalizeSchema(sqlV1.schema);
      expect(schema).toHaveLength(4);

      // Convert to Arrow table
      const table = jsonToArrowTable(schema, sqlV1.rows);
      expect(table.numRows).toBe(3);
      expect(table.numCols).toBe(4);

      // Verify data integrity
      const result = table.toArray();
      expect(result[0].id).toBe(apiResponse[0].id);
      expect(result[0].name).toBe(apiResponse[0].name);
      expect(result[0].score).toBeCloseTo(apiResponse[0].score, 2);
      expect(result[0].active).toBe(apiResponse[0].active);

      expect(result[1].id).toBe(apiResponse[1].id);
      expect(result[1].name).toBe(apiResponse[1].name);
      expect(result[1].score).toBeCloseTo(apiResponse[1].score, 2);
      expect(result[1].active).toBe(apiResponse[1].active);

      expect(result[2].id).toBe(apiResponse[2].id);
      expect(result[2].name).toBe(apiResponse[2].name);
      expect(result[2].score).toBeCloseTo(apiResponse[2].score, 2);
      expect(result[2].active).toBe(apiResponse[2].active);
    });
  });
});
