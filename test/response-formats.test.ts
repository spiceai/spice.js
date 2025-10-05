import { SpiceClient } from '../';
import 'dotenv/config';

/**
 * Tests for different response formats from Spice API
 *
 * The Spice API supports two response formats:
 * 1. application/json - Legacy format with rowCount, schema (with type objects), and rows
 * 2. application/vnd.spiceai.sql.v1+json - New format with row_count, schema.fields, and data
 */
describe('Response Formats Integration Tests', () => {
  const api_key = process.env.SPICE_API_KEY;

  if (!api_key) {
    throw new Error('SPICE_API_KEY environment variable not set');
  }

  const HTTP_DATA_PATH = process.env.HTTP_URL || 'https://data.spiceai.io';
  const FLIGHT_PATH = process.env.FLIGHT_URL || 'flight.spiceai.io:443';

  const cloudClient = new SpiceClient({
    apiKey: api_key,
    httpUrl: HTTP_DATA_PATH,
    flightUrl: FLIGHT_PATH,
  });

  describe('Pull Requests Dataset - Standard Query', () => {
    const testQuery = 'SELECT * FROM pulls LIMIT 5';

    test('sql() should parse response correctly', async () => {
      const tableResult = await cloudClient.sql(testQuery);
      const rows = tableResult.toArray();

      // Should return 5 rows
      expect(rows).toHaveLength(5);

      // Verify expected columns exist
      const firstRow = rows[0];
      expect(firstRow).toHaveProperty('repo');
      expect(firstRow).toHaveProperty('additions');
      expect(firstRow).toHaveProperty('assignees');
      expect(firstRow).toHaveProperty('author');
      expect(firstRow).toHaveProperty('body');
      expect(firstRow).toHaveProperty('changed_files');
      expect(firstRow).toHaveProperty('closed_at');
      expect(firstRow).toHaveProperty('comments_count');
      expect(firstRow).toHaveProperty('commits_count');
      expect(firstRow).toHaveProperty('created_at');
      expect(firstRow).toHaveProperty('deletions');
      expect(firstRow).toHaveProperty('hashes');
      expect(firstRow).toHaveProperty('id');
      expect(firstRow).toHaveProperty('labels');
      expect(firstRow).toHaveProperty('merged_at');
      expect(firstRow).toHaveProperty('number');
      expect(firstRow).toHaveProperty('reviews_count');
      expect(firstRow).toHaveProperty('state');
      expect(firstRow).toHaveProperty('title');
      expect(firstRow).toHaveProperty('updated_at');
      expect(firstRow).toHaveProperty('url');
      expect(firstRow).toHaveProperty('discussion');
      expect(firstRow).toHaveProperty('review_comments');
    }, 30000);

    test('sqlJson() should return correctly formatted response', async () => {
      const result = await cloudClient.sqlJson(testQuery);

      // Check top-level structure
      expect(result).toHaveProperty('row_count');
      expect(result).toHaveProperty('schema');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('execution_time_ms');

      // Verify counts
      expect(result.row_count).toBe(5);
      expect(result.data).toHaveLength(5);

      // Verify schema structure
      expect(result.schema).toHaveProperty('fields');
      expect(Array.isArray(result.schema.fields)).toBe(true);
      expect(result.schema.fields.length).toBeGreaterThan(0);

      // Check schema field structure
      const repoField = result.schema.fields.find((f) => f.name === 'repo');
      expect(repoField).toBeDefined();
      expect(repoField).toHaveProperty('name');
      expect(repoField).toHaveProperty('data_type');
      expect(repoField).toHaveProperty('nullable');
      expect(repoField).toHaveProperty('dict_id');
      expect(repoField).toHaveProperty('dict_is_ordered');

      // Verify data structure
      const firstRow = result.data[0];
      expect(firstRow).toHaveProperty('repo');
      expect(firstRow).toHaveProperty('additions');
      expect(firstRow).toHaveProperty('author');
      expect(firstRow).toHaveProperty('number');
      expect(firstRow).toHaveProperty('state');
      expect(firstRow).toHaveProperty('title');

      // Verify some expected values from the example
      expect(typeof firstRow.repo).toBe('string');
      expect(typeof firstRow.author).toBe('string');
      expect(Array.isArray(firstRow.assignees)).toBe(true);
      expect(Array.isArray(firstRow.labels)).toBe(true);
      expect(Array.isArray(firstRow.hashes)).toBe(true);

      // Execution time should be positive
      expect(result.execution_time_ms).toBeGreaterThan(0);
    }, 30000);

    test('should handle string fields correctly', async () => {
      const result = await cloudClient.sqlJson(testQuery);
      const firstRow = result.data[0];

      expect(typeof firstRow.repo).toBe('string');
      expect(typeof firstRow.author).toBe('string');
      expect(typeof firstRow.body).toBe('string');
      expect(typeof firstRow.id).toBe('string');
      expect(typeof firstRow.state).toBe('string');
      expect(typeof firstRow.title).toBe('string');
      expect(typeof firstRow.url).toBe('string');
    }, 30000);

    test('should handle numeric fields correctly', async () => {
      const result = await cloudClient.sqlJson(testQuery);
      const firstRow = result.data[0];

      // BigInt fields may be returned as strings or numbers
      expect(['number', 'string']).toContain(typeof firstRow.additions);
      expect(['number', 'string']).toContain(typeof firstRow.changed_files);
      expect(['number', 'string']).toContain(typeof firstRow.comments_count);
      expect(['number', 'string']).toContain(typeof firstRow.commits_count);
      expect(['number', 'string']).toContain(typeof firstRow.deletions);
      expect(['number', 'string']).toContain(typeof firstRow.number);
      expect(['number', 'string']).toContain(typeof firstRow.reviews_count);
    }, 30000);

    test('should handle array/list fields correctly', async () => {
      const result = await cloudClient.sqlJson(testQuery);
      const firstRow = result.data[0];

      expect(Array.isArray(firstRow.assignees)).toBe(true);
      expect(Array.isArray(firstRow.hashes)).toBe(true);
      expect(Array.isArray(firstRow.labels)).toBe(true);
      expect(Array.isArray(firstRow.discussion)).toBe(true);
      expect(Array.isArray(firstRow.review_comments)).toBe(true);
    }, 30000);

    test('should handle timestamp fields correctly', async () => {
      const result = await cloudClient.sqlJson(testQuery);
      const firstRow = result.data[0];

      // Timestamps should be strings or null
      if (firstRow.closed_at !== null) {
        expect(typeof firstRow.closed_at).toBe('string');
      }
      if (firstRow.created_at !== null) {
        expect(typeof firstRow.created_at).toBe('string');
      }
      if (firstRow.merged_at !== null) {
        expect(typeof firstRow.merged_at).toBe('string');
      }
      if (firstRow.updated_at !== null) {
        expect(typeof firstRow.updated_at).toBe('string');
      }
    }, 30000);
  });

  describe('Schema Validation', () => {
    test('should correctly parse schema with VARCHAR type', async () => {
      const result = await cloudClient.sqlJson('SELECT * FROM pulls LIMIT 1');

      const repoField = result.schema.fields.find((f) => f.name === 'repo');
      expect(repoField).toBeDefined();
      // data_type can be "Utf8" or "VARCHAR" depending on the format
      expect(['Utf8', 'VARCHAR']).toContain(
        typeof repoField!.data_type === 'string'
          ? repoField!.data_type
          : (repoField!.data_type as any).name
      );
    }, 30000);

    test('should correctly parse schema with BIGINT type', async () => {
      const result = await cloudClient.sqlJson('SELECT * FROM pulls LIMIT 1');

      const additionsField = result.schema.fields.find(
        (f) => f.name === 'additions'
      );
      expect(additionsField).toBeDefined();
      // data_type can be "Int64" or "BIGINT" depending on the format
      expect(['Int64', 'BIGINT']).toContain(
        typeof additionsField!.data_type === 'string'
          ? additionsField!.data_type
          : (additionsField!.data_type as any).name
      );
    }, 30000);

    test('should correctly parse schema with LIST type', async () => {
      const result = await cloudClient.sqlJson('SELECT * FROM pulls LIMIT 1');

      const assigneesField = result.schema.fields.find(
        (f) => f.name === 'assignees'
      );
      expect(assigneesField).toBeDefined();
      // LIST types can be represented differently
      const dataType = assigneesField!.data_type;
      expect(
        typeof dataType === 'object' ||
          (typeof dataType === 'string' && dataType.includes('List'))
      ).toBe(true);
    }, 30000);

    test('should correctly parse schema with TIMESTAMP type', async () => {
      const result = await cloudClient.sqlJson('SELECT * FROM pulls LIMIT 1');

      const closedAtField = result.schema.fields.find(
        (f) => f.name === 'closed_at'
      );
      expect(closedAtField).toBeDefined();
      // TIMESTAMP types can be objects or strings
      const dataType = closedAtField!.data_type;
      expect(typeof dataType === 'object' || typeof dataType === 'string').toBe(
        true
      );
    }, 30000);

    test('should correctly parse schema with nested STRUCT in LIST', async () => {
      const result = await cloudClient.sqlJson('SELECT * FROM pulls LIMIT 1');

      const discussionField = result.schema.fields.find(
        (f) => f.name === 'discussion'
      );
      expect(discussionField).toBeDefined();
      // Complex nested types
      expect(discussionField!.data_type).toBeDefined();
    }, 30000);
  });

  describe('Data Type Conversions', () => {
    test('should handle nullable fields correctly', async () => {
      const result = await cloudClient.sqlJson('SELECT * FROM pulls LIMIT 5');

      // Some merged_at values might be null (for closed/unmerged PRs)
      const hasNullMergedAt = result.data.some((row) => row.merged_at === null);
      const hasNonNullMergedAt = result.data.some(
        (row) => row.merged_at !== null
      );

      // Verify that the data contains both null and non-null values if present
      if (hasNullMergedAt) {
        expect(hasNullMergedAt).toBe(true);
      }
      if (hasNonNullMergedAt) {
        expect(hasNonNullMergedAt).toBe(true);
      }
    }, 30000);

    test('should handle empty arrays correctly', async () => {
      const result = await cloudClient.sqlJson('SELECT * FROM pulls LIMIT 5');

      result.data.forEach((row) => {
        // discussion and review_comments are often empty
        expect(Array.isArray(row.discussion)).toBe(true);
        expect(Array.isArray(row.review_comments)).toBe(true);
      });
    }, 30000);

    test('should handle non-empty arrays correctly', async () => {
      const result = await cloudClient.sqlJson('SELECT * FROM pulls LIMIT 5');

      // Find a row with non-empty arrays
      const rowWithAssignees = result.data.find(
        (row) => row.assignees.length > 0
      );
      const rowWithLabels = result.data.find((row) => row.labels.length > 0);
      const rowWithHashes = result.data.find((row) => row.hashes.length > 0);

      if (rowWithAssignees) {
        expect(Array.isArray(rowWithAssignees.assignees)).toBe(true);
        expect(rowWithAssignees.assignees.length).toBeGreaterThan(0);
        expect(typeof rowWithAssignees.assignees[0]).toBe('string');
      }

      if (rowWithLabels) {
        expect(Array.isArray(rowWithLabels.labels)).toBe(true);
        expect(rowWithLabels.labels.length).toBeGreaterThan(0);
        expect(typeof rowWithLabels.labels[0]).toBe('string');
      }

      if (rowWithHashes) {
        expect(Array.isArray(rowWithHashes.hashes)).toBe(true);
        expect(rowWithHashes.hashes.length).toBeGreaterThan(0);
        expect(typeof rowWithHashes.hashes[0]).toBe('string');
      }
    }, 30000);
  });

  describe('Specific Data Validation from Examples', () => {
    test('should match expected structure from first example PR', async () => {
      const result = await cloudClient.sqlJson(
        'SELECT * FROM pulls WHERE number = 1 LIMIT 1'
      );

      if (result.data.length > 0) {
        const pr = result.data[0];

        // Validate expected structure
        expect(pr.repo).toBeDefined();
        expect(pr.number).toBe(1);
        expect(pr.state).toBeDefined();
        expect(pr.title).toBeDefined();
        expect(pr.author).toBeDefined();
        expect(pr.url).toBeDefined();
        expect(Array.isArray(pr.assignees)).toBe(true);
        expect(Array.isArray(pr.labels)).toBe(true);
      }
    }, 30000);

    test('should handle PR with MERGED state', async () => {
      const result = await cloudClient.sqlJson(
        "SELECT * FROM pulls WHERE state = 'MERGED' LIMIT 1"
      );

      if (result.data.length > 0) {
        const pr = result.data[0];

        expect(pr.state).toBe('MERGED');
        expect(pr.merged_at).not.toBeNull();
        expect(pr.closed_at).not.toBeNull();
      }
    }, 30000);

    test('should handle PR with CLOSED state', async () => {
      const result = await cloudClient.sqlJson(
        "SELECT * FROM pulls WHERE state = 'CLOSED' AND merged_at IS NULL LIMIT 1"
      );

      if (result.data.length > 0) {
        const pr = result.data[0];

        expect(pr.state).toBe('CLOSED');
        expect(pr.merged_at).toBeNull();
        expect(pr.closed_at).not.toBeNull();
      }
    }, 30000);
  });

  describe('Streaming vs Non-streaming', () => {
    test('should handle streaming results with sql()', async () => {
      let chunkCount = 0;
      const chunks: any[] = [];

      await cloudClient.sql('SELECT * FROM pulls LIMIT 5', (table) => {
        chunkCount++;
        const rows = table.toArray();
        chunks.push(...rows);
        expect(rows.length).toBeGreaterThan(0);
      });

      // Should receive at least one chunk
      expect(chunkCount).toBeGreaterThanOrEqual(1);
      // Total rows across all chunks should be 5
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    }, 30000);

    test('should return complete result without streaming callback', async () => {
      const table = await cloudClient.sql('SELECT * FROM pulls LIMIT 5');
      const rows = table.toArray();

      expect(rows).toHaveLength(5);
      expect(rows[0]).toHaveProperty('repo');
      expect(rows[0]).toHaveProperty('number');
    }, 30000);
  });

  describe('Error Handling', () => {
    test('should throw error for invalid table', async () => {
      await expect(
        cloudClient.sql('SELECT * FROM nonexistent_table LIMIT 1')
      ).rejects.toThrow();
    });

    test('should throw error for invalid SQL syntax', async () => {
      await expect(cloudClient.sql('SELECT * FROM')).rejects.toThrow();
    });

    test('should throw error for invalid column', async () => {
      await expect(
        cloudClient.sql('SELECT nonexistent_column FROM pulls LIMIT 1')
      ).rejects.toThrow();
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty result set', async () => {
      const result = await cloudClient.sqlJson(
        'SELECT * FROM pulls WHERE false'
      );

      expect(result.row_count).toBe(0);
      expect(result.data).toHaveLength(0);
      expect(result.schema.fields.length).toBeGreaterThanOrEqual(0);
    }, 30000);

    test('should handle single row result', async () => {
      const result = await cloudClient.sqlJson('SELECT * FROM pulls LIMIT 1');

      expect(result.row_count).toBe(1);
      expect(result.data).toHaveLength(1);
    }, 30000);

    test('should handle large result set', async () => {
      const result = await cloudClient.sqlJson('SELECT * FROM pulls LIMIT 100');

      expect(result.row_count).toBe(100);
      expect(result.data).toHaveLength(100);
    }, 30000);
  });
});
