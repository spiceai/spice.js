/**
 * Tests for date/timestamp timezone handling in Arrow conversions
 */

import { SpiceClient } from '../client-common';
import type { PlatformAdapter } from '../platform/types';
import type { RetryModule } from '../client-common';

// Mock platform adapter
const mockPlatform: PlatformAdapter = {
  getUserAgent: () => 'test-agent',
  getPlatformName: () => 'test',
  supportsGrpc: () => false,
  fetch: jest.fn(),
};

// Mock retry module
const mockRetry: RetryModule = {
  FLIGHT_QUERY_MAX_RETRIES: 3,
  dontRetry: jest.fn(),
  retryWithExponentialBackoff: jest.fn((op) => op()),
};

describe('Timezone Conversions', () => {
  let client: SpiceClient;

  beforeEach(() => {
    client = new SpiceClient(
      {
        httpUrl: 'http://localhost:8090',
      },
      mockPlatform,
      mockRetry,
    );
  });

  describe('Timestamp with timezone', () => {
    it('should preserve timezone info (keep Z suffix)', async () => {
      const mockResponse = {
        ok: true,
        text: async () =>
          JSON.stringify({
            schema: {
              fields: [
                {
                  name: 'ts_with_tz',
                  data_type: 'Timestamp(Nanosecond, Some("UTC"))',
                  nullable: true,
                  dict_id: 0,
                  dict_is_ordered: false,
                  metadata: {},
                },
              ],
            },
            data: [{ ts_with_tz: '2024-01-15T10:30:00.000Z' }],
          }),
      };

      (mockPlatform.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.sql('SELECT * FROM test');
      const rows = result.toArray();

      expect(rows[0].ts_with_tz).toBe('2024-01-15T10:30:00Z');
      expect(rows[0].ts_with_tz).toMatch(/Z$/); // Should end with Z
    });
  });

  describe('Timestamp without timezone', () => {
    it('should remove timezone info (no Z suffix)', async () => {
      const mockResponse = {
        ok: true,
        text: async () =>
          JSON.stringify({
            schema: {
              fields: [
                {
                  name: 'ts_no_tz',
                  data_type: 'Timestamp(Nanosecond, None)',
                  nullable: true,
                  dict_id: 0,
                  dict_is_ordered: false,
                  metadata: {},
                },
              ],
            },
            data: [{ ts_no_tz: '2024-01-15T10:30:00.000Z' }],
          }),
      };

      (mockPlatform.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.sql('SELECT * FROM test');
      const rows = result.toArray();

      expect(rows[0].ts_no_tz).toBe('2024-01-15T10:30:00');
      expect(rows[0].ts_no_tz).not.toMatch(/Z$/); // Should not end with Z
    });
  });

  describe('Date32/Date64 types', () => {
    it('should handle Date32 without timezone', async () => {
      const mockResponse = {
        ok: true,
        text: async () =>
          JSON.stringify({
            schema: {
              fields: [
                {
                  name: 'date_col',
                  data_type: 'Date32',
                  nullable: true,
                  dict_id: 0,
                  dict_is_ordered: false,
                  metadata: {},
                },
              ],
            },
            data: [{ date_col: '2024-01-15T00:00:00.000Z' }],
          }),
      };

      (mockPlatform.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.sql('SELECT * FROM test');
      const rows = result.toArray();

      expect(rows[0].date_col).toBe('2024-01-15T00:00:00');
      expect(rows[0].date_col).not.toMatch(/Z$/); // Date types don't have timezone
    });
  });

  describe('Nested structures with dates', () => {
    it('should preserve timezone in lists of timestamps', async () => {
      const mockResponse = {
        ok: true,
        text: async () =>
          JSON.stringify({
            schema: {
              fields: [
                {
                  name: 'ts_list',
                  data_type: 'List',
                  nullable: true,
                  dict_id: 0,
                  dict_is_ordered: false,
                  metadata: {},
                  children: [
                    {
                      name: 'item',
                      data_type: 'Timestamp(Nanosecond, Some("UTC"))',
                      nullable: true,
                      dict_id: 0,
                      dict_is_ordered: false,
                      metadata: {},
                    },
                  ],
                },
              ],
            },
            data: [
              {
                ts_list: [
                  '2024-01-15T10:30:00.000Z',
                  '2024-01-16T15:45:00.000Z',
                ],
              },
            ],
          }),
      };

      (mockPlatform.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.sql('SELECT * FROM test');
      const rows = result.toArray();

      // List is returned as JSON string
      const tsList = JSON.parse(rows[0].ts_list);
      expect(tsList).toEqual(['2024-01-15T10:30:00Z', '2024-01-16T15:45:00Z']);
      tsList.forEach((ts: string) => {
        expect(ts).toMatch(/Z$/);
      });
    });

    it('should handle struct with mixed timezone timestamps', async () => {
      const mockResponse = {
        ok: true,
        text: async () =>
          JSON.stringify({
            schema: {
              fields: [
                {
                  name: 'event',
                  data_type: 'Struct',
                  nullable: true,
                  dict_id: 0,
                  dict_is_ordered: false,
                  metadata: {},
                  children: [
                    {
                      name: 'created_at',
                      data_type: 'Timestamp(Nanosecond, Some("UTC"))',
                      nullable: true,
                      dict_id: 0,
                      dict_is_ordered: false,
                      metadata: {},
                    },
                    {
                      name: 'local_time',
                      data_type: 'Timestamp(Nanosecond, None)',
                      nullable: true,
                      dict_id: 0,
                      dict_is_ordered: false,
                      metadata: {},
                    },
                  ],
                },
              ],
            },
            data: [
              {
                event: {
                  created_at: '2024-01-15T10:30:00.000Z',
                  local_time: '2024-01-15T10:30:00.000Z',
                },
              },
            ],
          }),
      };

      (mockPlatform.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.sql('SELECT * FROM test');
      const rows = result.toArray();

      expect(rows[0].event.created_at).toBe('2024-01-15T10:30:00Z');
      expect(rows[0].event.created_at).toMatch(/Z$/);

      expect(rows[0].event.local_time).toBe('2024-01-15T10:30:00');
      expect(rows[0].event.local_time).not.toMatch(/Z$/); // Should not have Z without timezone
    });
  });

  describe('sqlJson timezone handling', () => {
    it('should preserve timezone in JSON response', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          schema: {
            fields: [
              {
                name: 'ts_with_tz',
                data_type: 'Timestamp(Nanosecond, Some("UTC"))',
                nullable: true,
              },
              {
                name: 'ts_no_tz',
                data_type: 'Timestamp(Nanosecond, None)',
                nullable: true,
              },
            ],
          },
          data: [
            {
              ts_with_tz: '2024-01-15T10:30:00Z',
              ts_no_tz: '2024-01-15T10:30:00',
            },
          ],
        }),
      };

      (mockPlatform.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await client.sqlJson('SELECT * FROM test');

      expect(result.data[0].ts_with_tz).toMatch(/Z$/);
      expect(result.data[0].ts_no_tz).not.toMatch(/Z$/);
    });
  });
});
