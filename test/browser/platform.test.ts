/**
 * Browser platform adapter tests
 */

import { platform } from '../../src/platform/browser';

describe('Browser Platform Adapter', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('supportsGrpc', () => {
    test('should return false for browser environment', () => {
      expect(platform.supportsGrpc()).toBe(false);
    });
  });

  describe('getUserAgent', () => {
    test('should return browser user agent', () => {
      const userAgent = platform.getUserAgent();
      expect(userAgent).toContain('spice.js');
      expect(userAgent).toContain('Browser');
    });

    test('should include version in user agent', () => {
      const userAgent = platform.getUserAgent();
      expect(userAgent).toMatch(/spice\.js\/\d+\.\d+\.\d+/);
    });
  });

  describe('fetch', () => {
    test('should use window.fetch', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        text: jest.fn().mockResolvedValue('response text'),
        json: jest.fn().mockResolvedValue({ data: 'test' }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const response = await platform.fetch('http://example.com/api', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://example.com/api',
        expect.objectContaining({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.statusText).toBe('OK');
    });

    test('should handle POST requests with body', async () => {
      const mockResponse = {
        ok: true,
        status: 201,
        statusText: 'Created',
        headers: new Headers(),
        text: jest.fn().mockResolvedValue(''),
        json: jest.fn().mockResolvedValue({ id: 123 }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const body = JSON.stringify({ key: 'value' });
      await platform.fetch('http://example.com/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://example.com/api',
        expect.objectContaining({
          method: 'POST',
          body,
        })
      );
    });

    test('should handle fetch errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      await expect(
        platform.fetch('http://example.com/api', {
          method: 'GET',
          headers: {},
        })
      ).rejects.toThrow('Network error');
    });

    test('should handle response text', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        text: jest.fn().mockResolvedValue('Hello, World!'),
        json: jest.fn(),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const response = await platform.fetch('http://example.com/api', {
        method: 'GET',
        headers: {},
      });

      const text = await response.text();
      expect(text).toBe('Hello, World!');
    });

    test('should handle response JSON', async () => {
      const mockData = { message: 'success', data: [1, 2, 3] };
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        text: jest.fn(),
        json: jest.fn().mockResolvedValue(mockData),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const response = await platform.fetch('http://example.com/api', {
        method: 'GET',
        headers: {},
      });

      const json = await response.json();
      expect(json).toEqual(mockData);
    });

    test('should handle response headers', async () => {
      const headers = new Headers();
      headers.set('content-type', 'application/json');
      headers.set('x-custom-header', 'custom-value');

      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers,
        text: jest.fn(),
        json: jest.fn(),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const response = await platform.fetch('http://example.com/api', {
        method: 'GET',
        headers: {},
      });

      expect(response.headers.get('content-type')).toBe('application/json');
      expect(response.headers.get('x-custom-header')).toBe('custom-value');
    });
  });

  describe('Error Handling', () => {
    test('should handle 404 responses', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
        text: jest.fn().mockResolvedValue('Not found'),
        json: jest.fn().mockResolvedValue({ error: 'Not found' }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const response = await platform.fetch('http://example.com/api', {
        method: 'GET',
        headers: {},
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });

    test('should handle 500 responses', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers(),
        text: jest.fn().mockResolvedValue('Server error'),
        json: jest.fn().mockResolvedValue({ error: 'Internal error' }),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const response = await platform.fetch('http://example.com/api', {
        method: 'GET',
        headers: {},
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(500);
    });
  });
});
