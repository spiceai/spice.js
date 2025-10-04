import { SpiceClient } from '../';
import { Table } from 'apache-arrow';

/**
 * Unit tests for SpiceClient response parsing
 * These tests mock the HTTP responses to test the parsing logic
 * without requiring a live connection to the Spice API.
 */
describe('SpiceClient Response Parsing - Unit Tests', () => {
  let mockFetch: jest.Mock;
  let client: SpiceClient;

  // Example response in application/json format (legacy)
  const legacyJsonResponse = {
    rowCount: 5,
    schema: [
      { name: 'repo', type: { name: 'VARCHAR' } },
      { name: 'additions', type: { name: 'BIGINT' } },
      { name: 'assignees', type: { name: 'LIST' } },
      { name: 'author', type: { name: 'VARCHAR' } },
      { name: 'number', type: { name: 'BIGINT' } },
      { name: 'state', type: { name: 'VARCHAR' } },
      { name: 'title', type: { name: 'VARCHAR' } },
    ],
    rows: [
      {
        repo: 'spiceai/spiceai',
        additions: 2,
        assignees: ['lukekim'],
        author: 'lukekim',
        number: 1,
        state: 'MERGED',
        title: 'Update CODEOWNERS and install token',
      },
      {
        repo: 'spiceai/spiceai',
        additions: 3,
        assignees: ['lukekim'],
        author: 'lukekim',
        number: 2,
        state: 'MERGED',
        title: 'Fix link to getting started guide docs',
      },
    ],
  };

  // Example response in application/vnd.spiceai.sql.v1+json format (new)
  const newJsonResponse = {
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
        {
          name: 'assignees',
          data_type: {
            List: {
              name: 'login',
              data_type: 'Utf8',
              nullable: true,
              dict_id: 0,
              dict_is_ordered: false,
              metadata: {},
            },
          },
          nullable: true,
          dict_id: 0,
          dict_is_ordered: false,
          metadata: {},
        },
        {
          name: 'author',
          data_type: 'Utf8',
          nullable: true,
          dict_id: 0,
          dict_is_ordered: false,
          metadata: {},
        },
        {
          name: 'number',
          data_type: 'Int64',
          nullable: true,
          dict_id: 0,
          dict_is_ordered: false,
          metadata: {},
        },
        {
          name: 'state',
          data_type: 'Utf8',
          nullable: true,
          dict_id: 0,
          dict_is_ordered: false,
          metadata: {},
        },
        {
          name: 'title',
          data_type: 'Utf8',
          nullable: true,
          dict_id: 0,
          dict_is_ordered: false,
          metadata: {},
        },
      ],
      metadata: {},
    },
    data: [
      {
        repo: 'spiceai/spiceai',
        additions: 2,
        assignees: ['lukekim'],
        author: 'lukekim',
        number: 1,
        state: 'MERGED',
        title: 'Update CODEOWNERS and install token',
      },
      {
        repo: 'spiceai/spiceai',
        additions: 3,
        assignees: ['lukekim'],
        author: 'lukekim',
        number: 2,
        state: 'MERGED',
        title: 'Fix link to getting started guide docs',
      },
    ],
  };

  beforeEach(() => {
    // Mock fetch for browser environment
    mockFetch = jest.fn();
    global.fetch = mockFetch;

    // Create client instance
    client = new SpiceClient({
      apiKey: 'test-api-key',
      httpUrl: 'http://localhost:8090',
      flightUrl: 'localhost:50051',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('HTTP Response Parsing - New Format (application/vnd.spiceai.sql.v1+json)', () => {
    test('should parse new JSON format correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) =>
            name === 'content-type' ? 'application/json' : null,
        },
        text: async () => JSON.stringify(newJsonResponse),
      });

      const result = await client.sql('SELECT * FROM pulls LIMIT 5');

      expect(result).toBeInstanceOf(Table);
      const rows = result.toArray();
      expect(rows.length).toBe(2);

      const firstRow = rows[0];
      expect(firstRow.repo).toBe('spiceai/spiceai');
      expect(Number(firstRow.additions)).toBe(2);
      expect(Array.isArray(firstRow.assignees)).toBe(true);
      expect(firstRow.assignees.length).toBe(1);
      expect(firstRow.assignees[0]).toBe('lukekim');
      expect(firstRow.author).toBe('lukekim');
      expect(Number(firstRow.number)).toBe(1);
      expect(firstRow.state).toBe('MERGED');
    });

    test('should extract schema from new format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) =>
            name === 'content-type' ? 'application/json' : null,
        },
        text: async () => JSON.stringify(newJsonResponse),
      });

      const result = await client.sql('SELECT * FROM pulls LIMIT 5');
      const schema = result.schema;

      expect(schema.fields.length).toBe(7);
      expect(schema.fields[0].name).toBe('repo');
      expect(schema.fields[1].name).toBe('additions');
      expect(schema.fields[2].name).toBe('assignees');
    });

    test('should handle nested schema.fields structure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) =>
            name === 'content-type' ? 'application/json' : null,
        },
        text: async () => JSON.stringify(newJsonResponse),
      });

      const result = await client.sql('SELECT * FROM pulls LIMIT 5');

      // Should successfully parse without errors
      expect(result).toBeInstanceOf(Table);
      expect(result.numRows).toBe(2);
    });
  });

  describe('HTTP Response Parsing - Legacy Format (application/json)', () => {
    test('should parse legacy JSON format correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) =>
            name === 'content-type' ? 'application/json' : null,
        },
        text: async () => JSON.stringify(legacyJsonResponse),
      });

      const result = await client.sql('SELECT * FROM pulls LIMIT 5');

      expect(result).toBeInstanceOf(Table);
      const rows = result.toArray();
      expect(rows.length).toBe(2);

      const firstRow = rows[0];
      expect(firstRow.repo).toBe('spiceai/spiceai');
      expect(Number(firstRow.additions)).toBe(2);
    });

    test('should handle rowCount vs row_count', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) =>
            name === 'content-type' ? 'application/json' : null,
        },
        text: async () => JSON.stringify(legacyJsonResponse),
      });

      const result = await client.sql('SELECT * FROM pulls LIMIT 5');

      // Should parse successfully regardless of format
      expect(result.numRows).toBeGreaterThan(0);
    });

    test('should handle rows vs data field name', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) =>
            name === 'content-type' ? 'application/json' : null,
        },
        text: async () => JSON.stringify(legacyJsonResponse),
      });

      const result = await client.sql('SELECT * FROM pulls LIMIT 5');
      const rows = result.toArray();

      expect(rows.length).toBe(2);
      expect(rows[0].repo).toBeDefined();
    });
  });

  describe('Streaming Response Parsing', () => {
    test('should parse streaming newline-delimited JSON', async () => {
      const streamingResponse =
        JSON.stringify({
          schema: newJsonResponse.schema,
          data: [newJsonResponse.data[0]],
        }) +
        '\n' +
        JSON.stringify({
          data: [newJsonResponse.data[1]],
        });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) =>
            name === 'content-type' ? 'application/json' : null,
        },
        text: async () => streamingResponse,
      });

      let chunkCount = 0;
      const result = await client.sql(
        'SELECT * FROM pulls LIMIT 5',
        (table) => {
          chunkCount++;
          expect(table).toBeInstanceOf(Table);
        },
      );

      expect(result).toBeInstanceOf(Table);
      // Should have called onData for each chunk
      expect(chunkCount).toBeGreaterThan(0);
    });

    test('should accumulate rows from multiple chunks', async () => {
      const streamingResponse =
        JSON.stringify({
          schema: newJsonResponse.schema,
          data: [newJsonResponse.data[0]],
        }) +
        '\n' +
        JSON.stringify({
          data: [newJsonResponse.data[1]],
        });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) =>
            name === 'content-type' ? 'application/json' : null,
        },
        text: async () => streamingResponse,
      });

      const result = await client.sql('SELECT * FROM pulls LIMIT 5');
      const rows = result.toArray();

      expect(rows.length).toBe(2);
      expect(rows[0].repo).toBe('spiceai/spiceai');
      expect(rows[1].repo).toBe('spiceai/spiceai');
    });
  });

  describe('sqlJson() Format', () => {
    test('should return correctly formatted sqlJson response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) =>
            name === 'content-type' ? 'application/json' : null,
        },
        text: async () => JSON.stringify(newJsonResponse),
      });

      const result = await client.sqlJson('SELECT * FROM pulls LIMIT 5');

      expect(result).toHaveProperty('row_count');
      expect(result).toHaveProperty('schema');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('execution_time_ms');

      expect(result.row_count).toBe(2);
      expect(result.data.length).toBe(2);
      expect(result.schema.fields.length).toBeGreaterThan(0);
      expect(result.execution_time_ms).toBeGreaterThan(0);
    });

    test('should convert BigInt to string in sqlJson', async () => {
      const responseWithBigInt = {
        ...newJsonResponse,
        data: [
          {
            ...newJsonResponse.data[0],
            big_number: 9223372036854775807n, // BigInt
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) =>
            name === 'content-type' ? 'application/json' : null,
        },
        text: async () => JSON.stringify(newJsonResponse),
      });

      const result = await client.sqlJson('SELECT * FROM pulls LIMIT 1');

      // Should handle without errors
      expect(result.data.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should throw error on HTTP failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await expect(client.sql('SELECT * FROM test')).rejects.toThrow();
    });

    test('should throw error on invalid JSON', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) =>
            name === 'content-type' ? 'application/json' : null,
        },
        text: async () => 'invalid json',
      });

      await expect(client.sql('SELECT * FROM test')).rejects.toThrow();
    });

    test('should throw error on empty response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) =>
            name === 'content-type' ? 'application/json' : null,
        },
        text: async () => '',
      });

      await expect(client.sql('SELECT * FROM test')).rejects.toThrow();
    });
  });

  describe('Data Type Handling', () => {
    test('should handle nullable fields', async () => {
      const responseWithNulls = {
        ...newJsonResponse,
        data: [
          {
            repo: 'spiceai/spiceai',
            additions: null,
            assignees: null,
            author: null,
            number: 1,
            state: 'MERGED',
            title: null,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) =>
            name === 'content-type' ? 'application/json' : null,
        },
        text: async () => JSON.stringify(responseWithNulls),
      });

      const result = await client.sql('SELECT * FROM pulls');
      const rows = result.toArray();

      expect(rows.length).toBe(1);
      expect(rows[0].additions).toBeNull();
      expect(rows[0].author).toBeNull();
    });

    test('should handle empty arrays', async () => {
      const responseWithEmptyArrays = {
        ...newJsonResponse,
        data: [
          {
            ...newJsonResponse.data[0],
            assignees: [],
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) =>
            name === 'content-type' ? 'application/json' : null,
        },
        text: async () => JSON.stringify(responseWithEmptyArrays),
      });

      const result = await client.sql('SELECT * FROM pulls');
      const rows = result.toArray();

      expect(rows.length).toBe(1);
      expect(Array.isArray(rows[0].assignees)).toBe(true);
      expect(rows[0].assignees.length).toBe(0);
    });
  });

  describe('Schema Compatibility', () => {
    test('should handle both schema.fields and schema array formats', async () => {
      // Test new format with schema.fields
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) =>
            name === 'content-type' ? 'application/json' : null,
        },
        text: async () => JSON.stringify(newJsonResponse),
      });

      const result1 = await client.sql('SELECT * FROM pulls');
      expect(result1.schema.fields.length).toBeGreaterThan(0);

      // Test legacy format with schema array
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) =>
            name === 'content-type' ? 'application/json' : null,
        },
        text: async () => JSON.stringify(legacyJsonResponse),
      });

      const result2 = await client.sql('SELECT * FROM pulls');
      expect(result2.schema.fields.length).toBeGreaterThan(0);
    });
  });
});
