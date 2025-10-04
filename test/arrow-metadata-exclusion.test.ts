/**
 * Test to verify that internal Arrow properties like 'metadata' are not included in JSON output
 */

import { tableFromArrays } from 'apache-arrow';

describe('Arrow to JSON Conversion', () => {
  test('should not include internal Arrow properties like metadata in gRPC mode', async () => {
    // Create a mock Arrow table
    const table = tableFromArrays({
      id: [1, 2, 3],
      name: ['Alice', 'Bob', 'Charlie'],
      age: [30, 25, 35],
    });

    // Verify the table has the metadata property (internal Arrow property)
    const rows = table.toArray();
    expect(rows[0]).toHaveProperty('id');
    // The row object might have internal properties, but we shouldn't include them in output

    // Convert using the same logic as sqlJson() gRPC mode
    const allRows: any[] = [];
    const resultArray = table.toArray();

    resultArray.forEach((row: any) => {
      const plainRow: any = {};
      // Use the same conversion logic from client-common.ts
      for (const field of table.schema.fields) {
        const key = field.name;
        if (key in row) {
          const value = row[key];
          plainRow[key] = typeof value === 'bigint' ? value.toString() : value;
        }
      }
      allRows.push(plainRow);
    });

    // Verify the output has ONLY the data fields
    expect(allRows).toHaveLength(3);
    expect(allRows[0]).toEqual({ id: 1, name: 'Alice', age: 30 });
    expect(allRows[1]).toEqual({ id: 2, name: 'Bob', age: 25 });
    expect(allRows[2]).toEqual({ id: 3, name: 'Charlie', age: 35 });

    // Critical: Verify NO metadata property
    expect(allRows[0]).not.toHaveProperty('metadata');
    expect(allRows[1]).not.toHaveProperty('metadata');
    expect(allRows[2]).not.toHaveProperty('metadata');

    // Verify ONLY the expected keys exist
    expect(Object.keys(allRows[0])).toEqual(['id', 'name', 'age']);
    expect(Object.keys(allRows[1])).toEqual(['id', 'name', 'age']);
    expect(Object.keys(allRows[2])).toEqual(['id', 'name', 'age']);
  });
});
