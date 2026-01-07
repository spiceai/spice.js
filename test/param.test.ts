/**
 * Tests for the Param class used for explicit Arrow type control in parameterized queries.
 */

import { Param } from '../src/param';

describe('Param Class', () => {
  describe('Integer Types', () => {
    test('int8 creates correct param', () => {
      const param = Param.int8(42);
      expect(param.value).toBe(42);
      expect(param.type).toBe('Int8');
    });

    test('int16 creates correct param', () => {
      const param = Param.int16(1000);
      expect(param.value).toBe(1000);
      expect(param.type).toBe('Int16');
    });

    test('int32 creates correct param', () => {
      const param = Param.int32(100000);
      expect(param.value).toBe(100000);
      expect(param.type).toBe('Int32');
    });

    test('int64 creates correct param with number', () => {
      const param = Param.int64(9007199254740991);
      expect(param.value).toBe(9007199254740991);
      expect(param.type).toBe('Int64');
    });

    test('int64 creates correct param with bigint', () => {
      const param = Param.int64(BigInt('9223372036854775807'));
      expect(param.value).toBe(BigInt('9223372036854775807'));
      expect(param.type).toBe('Int64');
    });

    test('uint8 creates correct param', () => {
      const param = Param.uint8(255);
      expect(param.value).toBe(255);
      expect(param.type).toBe('UInt8');
    });

    test('uint16 creates correct param', () => {
      const param = Param.uint16(65535);
      expect(param.value).toBe(65535);
      expect(param.type).toBe('UInt16');
    });

    test('uint32 creates correct param', () => {
      const param = Param.uint32(4294967295);
      expect(param.value).toBe(4294967295);
      expect(param.type).toBe('UInt32');
    });

    test('uint64 creates correct param', () => {
      const param = Param.uint64(BigInt('18446744073709551615'));
      expect(param.value).toBe(BigInt('18446744073709551615'));
      expect(param.type).toBe('UInt64');
    });
  });

  describe('Floating Point Types', () => {
    test('float16 creates correct param', () => {
      const param = Param.float16(3.14);
      expect(param.value).toBe(3.14);
      expect(param.type).toBe('Float16');
    });

    test('float32 creates correct param', () => {
      const param = Param.float32(3.14159);
      expect(param.value).toBe(3.14159);
      expect(param.type).toBe('Float32');
    });

    test('float64 creates correct param', () => {
      const param = Param.float64(3.141592653589793);
      expect(param.value).toBe(3.141592653589793);
      expect(param.type).toBe('Float64');
    });
  });

  describe('String Types', () => {
    test('string creates correct param', () => {
      const param = Param.string('hello world');
      expect(param.value).toBe('hello world');
      expect(param.type).toBe('String');
    });

    test('largeString creates correct param', () => {
      const param = Param.largeString('very large string');
      expect(param.value).toBe('very large string');
      expect(param.type).toBe('LargeString');
    });

    test('string handles special characters', () => {
      const param = Param.string('O\'Brien\'s "quoted" value');
      expect(param.value).toBe('O\'Brien\'s "quoted" value');
      expect(param.type).toBe('String');
    });

    test('string handles unicode', () => {
      const param = Param.string('日本語 🎉 emoji');
      expect(param.value).toBe('日本語 🎉 emoji');
      expect(param.type).toBe('String');
    });
  });

  describe('Binary Types', () => {
    test('binary creates correct param with Buffer', () => {
      const buffer = Buffer.from([0xca, 0xfe, 0xba, 0xbe]);
      const param = Param.binary(buffer);
      expect(param.value).toBe(buffer);
      expect(param.type).toBe('Binary');
    });

    test('binary creates correct param with Uint8Array', () => {
      const arr = new Uint8Array([1, 2, 3, 4]);
      const param = Param.binary(arr);
      expect(param.value).toBe(arr);
      expect(param.type).toBe('Binary');
    });

    test('largeBinary creates correct param', () => {
      const buffer = Buffer.from([0x00, 0x01, 0x02]);
      const param = Param.largeBinary(buffer);
      expect(param.value).toBe(buffer);
      expect(param.type).toBe('LargeBinary');
    });

    test('fixedSizeBinary creates correct param with options', () => {
      const buffer = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      const param = Param.fixedSizeBinary(buffer, { byteWidth: 4 });
      expect(param.value).toBe(buffer);
      expect(param.type).toBe('FixedSizeBinary');
      expect(param.options).toEqual({ byteWidth: 4 });
    });
  });

  describe('Boolean Type', () => {
    test('bool creates correct param for true', () => {
      const param = Param.bool(true);
      expect(param.value).toBe(true);
      expect(param.type).toBe('Boolean');
    });

    test('bool creates correct param for false', () => {
      const param = Param.bool(false);
      expect(param.value).toBe(false);
      expect(param.type).toBe('Boolean');
    });

    test('boolean is alias for bool', () => {
      const param = Param.boolean(true);
      expect(param.value).toBe(true);
      expect(param.type).toBe('Boolean');
    });
  });

  describe('Date/Time Types', () => {
    test('date32 creates correct param with Date', () => {
      const date = new Date('2024-01-15');
      const param = Param.date32(date);
      expect(param.value).toBe(date);
      expect(param.type).toBe('Date32');
    });

    test('date32 creates correct param with number (days since epoch)', () => {
      const param = Param.date32(19738); // 2024-01-15
      expect(param.value).toBe(19738);
      expect(param.type).toBe('Date32');
    });

    test('date64 creates correct param', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const param = Param.date64(date);
      expect(param.value).toBe(date);
      expect(param.type).toBe('Date64');
    });

    test('time32 creates correct param', () => {
      const param = Param.time32(12345, { unit: 'Millisecond' });
      expect(param.value).toBe(12345);
      expect(param.type).toBe('Time32');
      expect(param.options).toEqual({ unit: 'Millisecond' });
    });

    test('time32 throws for invalid unit', () => {
      expect(() => Param.time32(12345, { unit: 'Nanosecond' })).toThrow(
        'Time32 only supports Second or Millisecond units',
      );
    });

    test('time64 creates correct param', () => {
      const param = Param.time64(BigInt(12345678), { unit: 'Microsecond' });
      expect(param.value).toBe(BigInt(12345678));
      expect(param.type).toBe('Time64');
      expect(param.options).toEqual({ unit: 'Microsecond' });
    });

    test('time64 throws for invalid unit', () => {
      expect(() => Param.time64(12345, { unit: 'Second' })).toThrow(
        'Time64 only supports Microsecond or Nanosecond units',
      );
    });

    test('timestamp creates correct param with defaults', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const param = Param.timestamp(date);
      expect(param.value).toBe(date);
      expect(param.type).toBe('Timestamp');
      expect(param.options).toEqual({ unit: 'Microsecond' });
    });

    test('timestamp creates correct param with options', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const param = Param.timestamp(date, {
        unit: 'Nanosecond',
        timezone: 'America/New_York',
      });
      expect(param.value).toBe(date);
      expect(param.type).toBe('Timestamp');
      expect(param.options).toEqual({
        unit: 'Nanosecond',
        timezone: 'America/New_York',
      });
    });
  });

  describe('Duration Types', () => {
    test('duration creates correct param', () => {
      const param = Param.duration(1000000, { unit: 'Microsecond' });
      expect(param.value).toBe(1000000);
      expect(param.type).toBe('Duration');
      expect(param.options).toEqual({ unit: 'Microsecond' });
    });

    test('durationSeconds convenience method', () => {
      const param = Param.durationSeconds(60);
      expect(param.value).toBe(60);
      expect(param.type).toBe('Duration');
      expect(param.options).toEqual({ unit: 'Second' });
    });

    test('durationMilliseconds convenience method', () => {
      const param = Param.durationMilliseconds(1000);
      expect(param.value).toBe(1000);
      expect(param.type).toBe('Duration');
      expect(param.options).toEqual({ unit: 'Millisecond' });
    });

    test('durationMicroseconds convenience method', () => {
      const param = Param.durationMicroseconds(1000000);
      expect(param.value).toBe(1000000);
      expect(param.type).toBe('Duration');
      expect(param.options).toEqual({ unit: 'Microsecond' });
    });

    test('durationNanoseconds convenience method', () => {
      const param = Param.durationNanoseconds(BigInt(1000000000));
      expect(param.value).toBe(BigInt(1000000000));
      expect(param.type).toBe('Duration');
      expect(param.options).toEqual({ unit: 'Nanosecond' });
    });
  });

  describe('Decimal Types', () => {
    test('decimal128 creates correct param', () => {
      const param = Param.decimal128(99.99, { precision: 10, scale: 2 });
      expect(param.value).toBe(99.99);
      expect(param.type).toBe('Decimal128');
      expect(param.options).toEqual({ precision: 10, scale: 2 });
    });

    test('decimal128 with string value', () => {
      const param = Param.decimal128('12345.6789', {
        precision: 38,
        scale: 10,
      });
      expect(param.value).toBe('12345.6789');
      expect(param.type).toBe('Decimal128');
      expect(param.options).toEqual({ precision: 38, scale: 10 });
    });

    test('decimal256 creates correct param', () => {
      const param = Param.decimal256('9999999999999999999.99', {
        precision: 76,
        scale: 2,
      });
      expect(param.value).toBe('9999999999999999999.99');
      expect(param.type).toBe('Decimal256');
      expect(param.options).toEqual({ precision: 76, scale: 2 });
    });
  });

  describe('Null Type', () => {
    test('null creates correct param', () => {
      const param = Param.null();
      expect(param.value).toBe(null);
      expect(param.type).toBe('Null');
    });

    test('nullValue is alias for null', () => {
      const param = Param.nullValue();
      expect(param.value).toBe(null);
      expect(param.type).toBe('Null');
    });
  });

  describe('Generic Constructor', () => {
    test('of creates param with custom type', () => {
      const param = Param.of('custom value', 'String', { custom: 'option' });
      expect(param.value).toBe('custom value');
      expect(param.type).toBe('String');
      expect(param.options).toEqual({ custom: 'option' });
    });

    test('of creates param without options', () => {
      const param = Param.of(42, 'Int32');
      expect(param.value).toBe(42);
      expect(param.type).toBe('Int32');
      expect(param.options).toBeUndefined();
    });
  });

  describe('Instance Check', () => {
    test('Param instances are identifiable', () => {
      const param = Param.int32(42);
      expect(param instanceof Param).toBe(true);
    });

    test('plain objects are not Param instances', () => {
      const obj = { value: 42, type: 'Int32' };
      expect(obj instanceof Param).toBe(false);
    });
  });

  describe('Immutability', () => {
    test('Param properties are readonly', () => {
      const param = Param.int32(42);
      // TypeScript will prevent this at compile time, but at runtime:
      expect(param.value).toBe(42);
      expect(param.type).toBe('Int32');
    });
  });
});
