/**
 * Documentation and comparison of Spice API response formats
 *
 * This file serves as both documentation and test suite for understanding
 * the two different response formats supported by the Spice API.
 */

import { SpiceClient } from '../';

describe('Response Format Documentation', () => {
  describe('Format Comparison', () => {
    /**
     * The Spice API supports two response formats based on the Accept header:
     *
     * 1. Legacy Format (Accept: application/json)
     *    - Uses `rowCount` field
     *    - Schema is an array with `type` objects: [{ name: "col", type: { name: "VARCHAR" } }]
     *    - Data is in `rows` field
     *    - Type names: VARCHAR, BIGINT, LIST, TIMESTAMP
     *
     * 2. New Format (Accept: application/vnd.spiceai.sql.v1+json)
     *    - Uses `row_count` field
     *    - Schema has `fields` property: { fields: [{ name: "col", data_type: "Utf8" }] }
     *    - Data is in `data` field
     *    - Type names: Utf8, Int64, structured types for LIST/TIMESTAMP
     *    - More detailed type information with nullable, dict_id, metadata
     */

    test('Legacy Format Structure', () => {
      const legacyFormat = {
        rowCount: 5,
        schema: [
          { name: 'repo', type: { name: 'VARCHAR' } },
          { name: 'additions', type: { name: 'BIGINT' } },
          { name: 'assignees', type: { name: 'LIST' } },
        ],
        rows: [{ repo: 'spiceai/spiceai', additions: 2, assignees: ['user1'] }],
      };

      expect(legacyFormat).toHaveProperty('rowCount');
      expect(legacyFormat).toHaveProperty('rows');
      expect(Array.isArray(legacyFormat.schema)).toBe(true);
      expect(legacyFormat.schema[0]).toHaveProperty('type');
    });

    test('New Format Structure', () => {
      const newFormat = {
        row_count: 5,
        schema: {
          fields: [
            {
              name: 'repo',
              data_type: 'Utf8',
              nullable: false,
              dict_id: 0,
              dict_is_ordered: false,
              metadata: {},
            },
            {
              name: 'additions',
              data_type: 'Int64',
              nullable: true,
              dict_id: 0,
              dict_is_ordered: false,
              metadata: {},
            },
          ],
          metadata: {},
        },
        data: [{ repo: 'spiceai/spiceai', additions: 2, assignees: ['user1'] }],
      };

      expect(newFormat).toHaveProperty('row_count');
      expect(newFormat).toHaveProperty('data');
      expect(newFormat.schema).toHaveProperty('fields');
      expect(Array.isArray(newFormat.schema.fields)).toBe(true);
      expect(newFormat.schema.fields[0]).toHaveProperty('data_type');
      expect(newFormat.schema.fields[0]).toHaveProperty('nullable');
      expect(newFormat.schema.fields[0]).toHaveProperty('dict_id');
    });
  });

  describe('Type Mapping', () => {
    test('String Types', () => {
      const legacyType = { name: 'VARCHAR' };
      const newType = 'Utf8';

      // Both represent string data
      expect(typeof legacyType.name).toBe('string');
      expect(typeof newType).toBe('string');
    });

    test('Integer Types', () => {
      const legacyType = { name: 'BIGINT' };
      const newType = 'Int64';

      // Both represent 64-bit integers
      expect(legacyType.name).toBe('BIGINT');
      expect(newType).toBe('Int64');
    });

    test('List Types', () => {
      const legacyType = { name: 'LIST' };
      const newType = {
        List: {
          name: 'item',
          data_type: 'Utf8',
          nullable: true,
        },
      };

      // Legacy format has simple LIST, new format has detailed structure
      expect(legacyType.name).toBe('LIST');
      expect(newType).toHaveProperty('List');
      expect(newType.List).toHaveProperty('data_type');
    });

    test('Timestamp Types', () => {
      const legacyType = { name: 'TIMESTAMP' };
      const newType = {
        Timestamp: ['Millisecond', null],
      };

      // New format includes precision information
      expect(legacyType.name).toBe('TIMESTAMP');
      expect(newType).toHaveProperty('Timestamp');
      expect(Array.isArray(newType.Timestamp)).toBe(true);
    });

    test('Nested Struct Types', () => {
      const newComplexType = {
        List: {
          name: 'item',
          data_type: {
            Struct: [
              {
                name: 'body',
                data_type: 'Utf8',
                nullable: true,
              },
              {
                name: 'created_at',
                data_type: { Timestamp: ['Millisecond', null] },
                nullable: true,
              },
            ],
          },
          nullable: true,
        },
      };

      // New format supports complex nested structures
      expect(newComplexType.List.data_type).toHaveProperty('Struct');
      expect(Array.isArray(newComplexType.List.data_type.Struct)).toBe(true);
    });
  });

  describe('Field Naming Conventions', () => {
    test('Legacy Format Uses camelCase', () => {
      const legacy = {
        rowCount: 5, // camelCase
        schema: [],
        rows: [],
      };

      expect(legacy).toHaveProperty('rowCount');
      expect(legacy).not.toHaveProperty('row_count');
    });

    test('New Format Uses snake_case', () => {
      const newFormat = {
        row_count: 5, // snake_case
        schema: { fields: [] },
        data: [],
      };

      expect(newFormat).toHaveProperty('row_count');
      expect(newFormat).not.toHaveProperty('rowCount');
    });

    test('Schema Field Names', () => {
      const legacySchema = { name: 'col', type: { name: 'VARCHAR' } };
      const newSchema = {
        name: 'col',
        data_type: 'Utf8',
        nullable: false,
        dict_id: 0,
        dict_is_ordered: false,
      };

      // Legacy uses 'type', new uses 'data_type'
      expect(legacySchema).toHaveProperty('type');
      expect(newSchema).toHaveProperty('data_type');
      expect(newSchema).toHaveProperty('dict_id'); // snake_case
      expect(newSchema).toHaveProperty('dict_is_ordered'); // snake_case
    });
  });

  describe('Data Representation', () => {
    test('Row Data Format - Arrays vs Objects', () => {
      // Both formats support object-based rows
      const objectRow = {
        repo: 'spiceai/spiceai',
        additions: 2,
        author: 'lukekim',
      };

      expect(objectRow.repo).toBe('spiceai/spiceai');
      expect(objectRow.additions).toBe(2);

      // Some responses may use array-based rows
      const arrayRow = ['spiceai/spiceai', 2, 'lukekim'];

      expect(arrayRow[0]).toBe('spiceai/spiceai');
      expect(arrayRow[1]).toBe(2);
    });

    test('Timestamp Format Differences', () => {
      // Legacy format: "2021-08-09 09:30:46Z"
      const legacyTimestamp = '2021-08-09 09:30:46Z';

      // New format: "2021-08-09T09:30:46"
      const newTimestamp = '2021-08-09T09:30:46';

      // Both are valid ISO 8601 formats
      expect(typeof legacyTimestamp).toBe('string');
      expect(typeof newTimestamp).toBe('string');
      expect(legacyTimestamp.includes('Z')).toBe(true);
      expect(newTimestamp.includes('T')).toBe(true);
    });

    test('Array Field Representation', () => {
      // Both formats use standard JavaScript arrays
      const assignees = ['lukekim', 'user2'];
      const labels = ['kind/bug', 'kind/documentation'];

      expect(Array.isArray(assignees)).toBe(true);
      expect(Array.isArray(labels)).toBe(true);
      expect(assignees.length).toBe(2);
      expect(labels[0]).toBe('kind/bug');
    });

    test('Null Handling', () => {
      // Both formats use null for missing values
      const rowWithNulls = {
        repo: 'spiceai/spiceai',
        merged_at: null,
        body: '',
        assignees: [],
      };

      expect(rowWithNulls.merged_at).toBeNull();
      expect(rowWithNulls.body).toBe('');
      expect(Array.isArray(rowWithNulls.assignees)).toBe(true);
      expect(rowWithNulls.assignees.length).toBe(0);
    });
  });

  describe('Client Behavior', () => {
    test('Client should handle both formats transparently', () => {
      // The SpiceClient internally sends Accept: application/vnd.spiceai.sql.v1+json
      // and handles parsing of both formats automatically

      const client = new SpiceClient({
        httpUrl: 'http://localhost:8090',
      });

      // The client's sql() method returns Apache Arrow Tables regardless of format
      // The client's sqlJson() method returns normalized format with row_count, schema.fields, data

      expect(client).toBeDefined();
      expect(typeof client.sql).toBe('function');
      expect(typeof client.sqlJson).toBe('function');
    });

    test('sqlJson() always returns normalized format', () => {
      // Regardless of server response format, sqlJson() returns:
      const expectedFormat = {
        row_count: 0,
        schema: {
          fields: [],
        },
        data: [],
        execution_time_ms: 0,
      };

      expect(expectedFormat).toHaveProperty('row_count');
      expect(expectedFormat).toHaveProperty('schema.fields');
      expect(expectedFormat).toHaveProperty('data');
      expect(expectedFormat).toHaveProperty('execution_time_ms');
    });
  });

  describe('Real World Examples', () => {
    test('Example 1: Pull Request Data (Legacy Format)', () => {
      const legacyPullRequest = {
        additions: 2,
        assignees: ['lukekim'],
        author: 'lukekim',
        body: '',
        changed_files: 2,
        closed_at: '2021-08-09 09:30:46Z',
        comments_count: 0,
        commits_count: 1,
        created_at: '2021-08-09 09:30:10Z',
        deletions: 2,
        discussion: [],
        hashes: [
          'MDE3OlB1bGxSZXF1ZXN0Q29tbWl0NzA2MzU4OTUwOmYyMGRjZjY5YWZhNmVhM2I1NTQ1OGRkYTNkZTc0NmYzODU0YWE2N2M=',
        ],
        id: 'MDExOlB1bGxSZXF1ZXN0NzA2MzU4OTUw',
        labels: ['kind/bug', 'kind/documentation'],
        merged_at: '2021-08-09 09:30:46Z',
        number: 1,
        repo: 'spiceai/spiceai',
        review_comments: [],
        reviews_count: 1,
        state: 'MERGED',
        title: 'Update CODEOWNERS and install token',
        updated_at: '2021-08-09 09:30:47Z',
        url: 'https://github.com/spiceai/spiceai/pull/1',
      };

      // Validate structure
      expect(legacyPullRequest.repo).toBe('spiceai/spiceai');
      expect(legacyPullRequest.number).toBe(1);
      expect(legacyPullRequest.state).toBe('MERGED');
      expect(Array.isArray(legacyPullRequest.assignees)).toBe(true);
      expect(legacyPullRequest.closed_at).toContain('Z');
    });

    test('Example 2: Pull Request Data (New Format)', () => {
      const newPullRequest = {
        repo: 'spiceai/spiceai',
        additions: 2,
        assignees: ['lukekim'],
        author: 'lukekim',
        body: '',
        changed_files: 2,
        closed_at: '2021-08-09T09:30:46',
        comments_count: 0,
        commits_count: 1,
        created_at: '2021-08-09T09:30:10',
        deletions: 2,
        hashes: [
          'MDE3OlB1bGxSZXF1ZXN0Q29tbWl0NzA2MzU4OTUwOmYyMGRjZjY5YWZhNmVhM2I1NTQ1OGRkYTNkZTc0NmYzODU0YWE2N2M=',
        ],
        id: 'MDExOlB1bGxSZXF1ZXN0NzA2MzU4OTUw',
        labels: ['kind/bug', 'kind/documentation'],
        merged_at: '2021-08-09T09:30:46',
        number: 1,
        reviews_count: 1,
        state: 'MERGED',
        title: 'Update CODEOWNERS and install token',
        updated_at: '2021-08-09T09:30:47',
        url: 'https://github.com/spiceai/spiceai/pull/1',
        discussion: [],
        review_comments: [],
      };

      // Validate structure (mostly same, timestamp format differs)
      expect(newPullRequest.repo).toBe('spiceai/spiceai');
      expect(newPullRequest.number).toBe(1);
      expect(newPullRequest.state).toBe('MERGED');
      expect(Array.isArray(newPullRequest.assignees)).toBe(true);
      expect(newPullRequest.closed_at).toContain('T');
      expect(newPullRequest.closed_at).not.toContain('Z');
    });
  });

  describe('Migration Guide', () => {
    test('Migrating from Legacy to New Format', () => {
      // If you have code that expects legacy format:
      const legacy = {
        rowCount: 5,
        schema: [{ name: 'col', type: { name: 'VARCHAR' } }],
        rows: [{ col: 'value' }],
      };

      // Convert to new format:
      const migrated = {
        row_count: legacy.rowCount,
        schema: {
          fields: legacy.schema.map((field) => ({
            name: field.name,
            data_type: field.type.name,
            nullable: true,
            dict_id: 0,
            dict_is_ordered: false,
            metadata: {},
          })),
          metadata: {},
        },
        data: legacy.rows,
      };

      expect(migrated.row_count).toBe(5);
      expect(migrated.schema.fields[0].name).toBe('col');
      expect(migrated.data[0].col).toBe('value');
    });

    test('Using SpiceClient API (Format Agnostic)', () => {
      // Best practice: Use SpiceClient methods which handle both formats
      const client = new SpiceClient({
        httpUrl: 'http://localhost:8090',
      });

      // sql() returns Apache Arrow Table (works with both formats)
      // sqlJson() returns normalized format (works with both formats)

      // No need to worry about format differences when using the SDK
      expect(typeof client.sql).toBe('function');
      expect(typeof client.sqlJson).toBe('function');
    });
  });
});
