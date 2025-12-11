/**
 * Unit tests for the search() function
 */

import { SpiceClient } from '../src';
import type { SearchResponse } from '../src';

// Mock fetch for testing
const mockFetch = jest.fn();

describe('SpiceClient.search()', () => {
  let client: SpiceClient;

  beforeEach(() => {
    // Create a client with HTTP URL
    client = new SpiceClient({
      apiKey: 'test-api-key',
      httpUrl: 'http://localhost:8090',
    });

    // Mock the internal fetch method
    (client as any)._platform = {
      fetch: mockFetch,
    };

    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should make a POST request to /v1/search', async () => {
    const mockResponse: SearchResponse = {
      duration_ms: 150,
      results: [
        {
          dataset: 'documents',
          score: 0.95,
          matches: { text: 'machine learning' },
          primary_key: { id: 1 },
          data: { title: 'ML Guide' },
          metadata: {},
        },
      ],
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
      text: async () => JSON.stringify(mockResponse),
    });

    const result = await client.search('machine learning', {
      datasets: ['documents'],
      limit: 5,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8090/v1/search',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-API-Key': 'test-api-key',
        }),
        body: JSON.stringify({
          text: 'machine learning',
          datasets: ['documents'],
          limit: 5,
          additional_columns: undefined,
          where: undefined,
          keywords: undefined,
        }),
      }),
    );

    expect(result).toEqual(mockResponse);
  });

  it('should include all optional parameters when provided', async () => {
    const mockResponse: SearchResponse = {
      duration_ms: 200,
      results: [],
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
      text: async () => JSON.stringify(mockResponse),
    });

    await client.search('artificial intelligence', {
      datasets: ['documents', 'articles'],
      limit: 10,
      additional_columns: ['title', 'author'],
      where: "published_date >= '2024-01-01'",
      keywords: ['AI', 'ML'],
    });

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);

    expect(body).toEqual({
      text: 'artificial intelligence',
      datasets: ['documents', 'articles'],
      limit: 10,
      additional_columns: ['title', 'author'],
      where: "published_date >= '2024-01-01'",
      keywords: ['AI', 'ML'],
    });
  });

  it('should handle null datasets (search across all)', async () => {
    const mockResponse: SearchResponse = {
      duration_ms: 175,
      results: [],
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
      text: async () => JSON.stringify(mockResponse),
    });

    await client.search('search query', {
      datasets: null,
    });

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);

    expect(body.datasets).toBeNull();
  });

  it('should throw error if query is not provided', async () => {
    await expect(
      client.search('', { datasets: ['documents'] }),
    ).rejects.toThrow('query parameter is required for search operation');

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should throw error if HTTP URL is not configured', async () => {
    // Create client and manually set httpUrl to undefined to test the guard
    const clientNoHttp = new SpiceClient({
      flightUrl: 'grpc://localhost:50051',
    });

    // Manually override _httpUrl to undefined to test the error path
    (clientNoHttp as any)._httpUrl = undefined;

    await expect(clientNoHttp.search('search query')).rejects.toThrow(
      'HTTP URL is required for search operation',
    );
  });

  it('should handle HTTP errors properly', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => 'Invalid search parameters',
    });

    await expect(client.search('search query')).rejects.toThrow(
      'Search request failed: 400 Bad Request - Invalid search parameters',
    );
  });

  it('should handle server errors', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Server error occurred',
    });

    await expect(client.search('search query')).rejects.toThrow(
      'Search request failed: 500 Internal Server Error - Server error occurred',
    );
  });

  it('should return results with proper structure', async () => {
    const mockResponse: SearchResponse = {
      duration_ms: 125,
      results: [
        {
          dataset: 'docs',
          score: 0.98,
          matches: { content: 'AI research' },
          primary_key: { doc_id: '123' },
          data: {
            title: 'AI Research Paper',
            author: 'John Doe',
          },
          metadata: {
            source: 'arxiv',
          },
        },
        {
          dataset: 'articles',
          score: 0.85,
          matches: { text: 'machine learning' },
          primary_key: { article_id: 456 },
          data: {},
          metadata: {},
        },
      ],
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
      text: async () => JSON.stringify(mockResponse),
    });

    const result = await client.search('AI and ML', {
      limit: 2,
    });

    expect(result.duration_ms).toBe(125);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].dataset).toBe('docs');
    expect(result.results[0].score).toBe(0.98);
    expect(result.results[0].data.title).toBe('AI Research Paper');
    expect(result.results[1].dataset).toBe('articles');
    expect(result.results[1].score).toBe(0.85);
  });
});
