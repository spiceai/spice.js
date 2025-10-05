/**
 * Simple test to verify sqlJson() preserves types correctly
 */

import { SpiceClient } from '../src/index.browser';

describe('sqlJson() Type Preservation', () => {
  let client: SpiceClient;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;

    client = new SpiceClient({
      httpUrl: 'http://localhost:8090',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('preserves number types (not strings)', async () => {
    // Mock response with actual numbers
    const mockResponse = {
      row_count: 2,
      schema: {
        fields: [
          { name: 'id', data_type: 'Int32', nullable: false },
          { name: 'amount', data_type: 'Float64', nullable: false },
        ],
      },
      data: [
        { id: 1, amount: 100.5 },
        { id: 2, amount: 200.75 },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(mockResponse),
    });

    const result = await client.sqlJson('SELECT * FROM test');

    // Critical: Numbers should be numbers, NOT strings
    expect(result.data[0].id).toBe(1);
    expect(result.data[0].amount).toBe(100.5);
    expect(typeof result.data[0].id).toBe('number');
    expect(typeof result.data[0].amount).toBe('number');

    // Ensure NOT strings
    expect(result.data[0].id).not.toBe('1');
    expect(result.data[0].amount).not.toBe('100.5');
  });

  test('preserves boolean types', async () => {
    const mockResponse = {
      row_count: 2,
      schema: {
        fields: [{ name: 'active', data_type: 'Boolean', nullable: false }],
      },
      data: [{ active: true }, { active: false }],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(mockResponse),
    });

    const result = await client.sqlJson('SELECT active FROM test');

    expect(result.data[0].active).toBe(true);
    expect(result.data[1].active).toBe(false);
    expect(typeof result.data[0].active).toBe('boolean');
    expect(typeof result.data[1].active).toBe('boolean');
  });

  test('handles null values', async () => {
    const mockResponse = {
      row_count: 2,
      schema: {
        fields: [
          { name: 'value', data_type: 'Int32', nullable: true },
          { name: 'name', data_type: 'Utf8', nullable: true },
        ],
      },
      data: [
        { value: null, name: 'test' },
        { value: 42, name: null },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(mockResponse),
    });

    const result = await client.sqlJson('SELECT * FROM test');

    expect(result.data[0].value).toBeNull();
    expect(result.data[0].name).toBe('test');
    expect(result.data[1].value).toBe(42);
    expect(result.data[1].name).toBeNull();
  });
});
