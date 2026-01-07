/**
 * Param class for explicit Arrow type control in parameterized queries.
 *
 * When using parameterized queries, JavaScript/TypeScript values are automatically
 * converted to appropriate SQL types. Use the Param class when you need explicit
 * control over the Arrow/SQL type used.
 *
 * @example
 * // Automatic type inference (usually sufficient)
 * await client.sql('SELECT * FROM users WHERE id = $1', { parameters: [42] });
 *
 * // Explicit type control
 * await client.sql('SELECT * FROM users WHERE id = $1', {
 *   parameters: [Param.int64(42)]  // Force Int64 instead of default number
 * });
 */

/**
 * Arrow type identifiers used by the Param class
 */
export type ArrowTypeId =
  | 'Int8'
  | 'Int16'
  | 'Int32'
  | 'Int64'
  | 'UInt8'
  | 'UInt16'
  | 'UInt32'
  | 'UInt64'
  | 'Float16'
  | 'Float32'
  | 'Float64'
  | 'String'
  | 'LargeString'
  | 'Binary'
  | 'LargeBinary'
  | 'FixedSizeBinary'
  | 'Boolean'
  | 'Date32'
  | 'Date64'
  | 'Time32'
  | 'Time64'
  | 'Timestamp'
  | 'Duration'
  | 'Decimal128'
  | 'Decimal256'
  | 'Null';

/**
 * Time units for temporal types
 */
export type TimeUnit = 'Second' | 'Millisecond' | 'Microsecond' | 'Nanosecond';

/**
 * Options for Decimal types
 */
export interface DecimalOptions {
  precision: number;
  scale: number;
}

/**
 * Options for Timestamp types
 */
export interface TimestampOptions {
  unit: TimeUnit;
  timezone?: string;
}

/**
 * Options for Duration types
 */
export interface DurationOptions {
  unit: TimeUnit;
}

/**
 * Options for Time types
 */
export interface TimeOptions {
  unit: 'Second' | 'Millisecond' | 'Microsecond' | 'Nanosecond';
}

/**
 * Options for FixedSizeBinary types
 */
export interface FixedSizeBinaryOptions {
  byteWidth: number;
}

/**
 * Param class for explicit Arrow type control in parameterized queries.
 *
 * This class provides factory methods to create typed parameters for SQL queries.
 * Use this when automatic type inference doesn't produce the desired SQL type.
 *
 * ## Automatic Type Inference
 *
 * When you pass plain JavaScript values to parameterized queries, the SDK infers types:
 *
 * | JavaScript Type | Inferred SQL Type |
 * |-----------------|-------------------|
 * | `number`        | Number literal    |
 * | `string`        | String (quoted)   |
 * | `boolean`       | TRUE/FALSE        |
 * | `null`          | NULL              |
 * | `undefined`     | NULL              |
 * | `Date`          | ISO timestamp     |
 * | `bigint`        | Number literal    |
 * | `Buffer`        | Hex literal       |
 * | `Uint8Array`    | Hex literal       |
 *
 * ## Using Param for Explicit Types
 *
 * ```typescript
 * import { Param } from '@spiceai/spice';
 *
 * // Force specific integer types
 * await client.sql('SELECT * WHERE id = $1', { parameters: [Param.int64(42)] });
 *
 * // Use specific decimal precision
 * await client.sql('SELECT * WHERE amount >= $1', {
 *   parameters: [Param.decimal128(99.99, { precision: 10, scale: 2 })]
 * });
 *
 * // Use specific timestamp with timezone
 * await client.sql('SELECT * WHERE created_at > $1', {
 *   parameters: [Param.timestamp(new Date(), { unit: 'Microsecond', timezone: 'UTC' })]
 * });
 * ```
 */
export class Param {
  /**
   * The underlying value
   */
  readonly value: any;

  /**
   * The Arrow type identifier
   */
  readonly type: ArrowTypeId;

  /**
   * Additional type options (precision, scale, timezone, etc.)
   */
  readonly options?: any;

  private constructor(value: any, type: ArrowTypeId, options?: any) {
    this.value = value;
    this.type = type;
    this.options = options;
  }

  // ============ Integer Types ============

  /**
   * Creates an Int8 (signed 8-bit integer) parameter.
   * Range: -128 to 127
   */
  static int8(value: number): Param {
    return new Param(value, 'Int8');
  }

  /**
   * Creates an Int16 (signed 16-bit integer) parameter.
   * Range: -32,768 to 32,767
   */
  static int16(value: number): Param {
    return new Param(value, 'Int16');
  }

  /**
   * Creates an Int32 (signed 32-bit integer) parameter.
   * Range: -2,147,483,648 to 2,147,483,647
   */
  static int32(value: number): Param {
    return new Param(value, 'Int32');
  }

  /**
   * Creates an Int64 (signed 64-bit integer) parameter.
   * Use for large integers or when explicit 64-bit precision is needed.
   */
  static int64(value: number | bigint): Param {
    return new Param(value, 'Int64');
  }

  /**
   * Creates a UInt8 (unsigned 8-bit integer) parameter.
   * Range: 0 to 255
   */
  static uint8(value: number): Param {
    return new Param(value, 'UInt8');
  }

  /**
   * Creates a UInt16 (unsigned 16-bit integer) parameter.
   * Range: 0 to 65,535
   */
  static uint16(value: number): Param {
    return new Param(value, 'UInt16');
  }

  /**
   * Creates a UInt32 (unsigned 32-bit integer) parameter.
   * Range: 0 to 4,294,967,295
   */
  static uint32(value: number): Param {
    return new Param(value, 'UInt32');
  }

  /**
   * Creates a UInt64 (unsigned 64-bit integer) parameter.
   */
  static uint64(value: number | bigint): Param {
    return new Param(value, 'UInt64');
  }

  // ============ Floating Point Types ============

  /**
   * Creates a Float16 (16-bit floating point) parameter.
   * Half precision, useful for machine learning.
   */
  static float16(value: number): Param {
    return new Param(value, 'Float16');
  }

  /**
   * Creates a Float32 (32-bit floating point) parameter.
   * Single precision float.
   */
  static float32(value: number): Param {
    return new Param(value, 'Float32');
  }

  /**
   * Creates a Float64 (64-bit floating point) parameter.
   * Double precision float (JavaScript's default number type).
   */
  static float64(value: number): Param {
    return new Param(value, 'Float64');
  }

  // ============ String Types ============

  /**
   * Creates a String (UTF-8) parameter.
   */
  static string(value: string): Param {
    return new Param(value, 'String');
  }

  /**
   * Creates a LargeString parameter for strings larger than 2GB.
   */
  static largeString(value: string): Param {
    return new Param(value, 'LargeString');
  }

  // ============ Binary Types ============

  /**
   * Creates a Binary parameter.
   */
  static binary(value: Buffer | Uint8Array): Param {
    return new Param(value, 'Binary');
  }

  /**
   * Creates a LargeBinary parameter for data larger than 2GB.
   */
  static largeBinary(value: Buffer | Uint8Array): Param {
    return new Param(value, 'LargeBinary');
  }

  /**
   * Creates a FixedSizeBinary parameter with specified byte width.
   */
  static fixedSizeBinary(
    value: Buffer | Uint8Array,
    options: FixedSizeBinaryOptions,
  ): Param {
    return new Param(value, 'FixedSizeBinary', options);
  }

  // ============ Boolean Type ============

  /**
   * Creates a Boolean parameter.
   */
  static bool(value: boolean): Param {
    return new Param(value, 'Boolean');
  }

  // Alias for consistency with other SDKs
  static boolean(value: boolean): Param {
    return Param.bool(value);
  }

  // ============ Date/Time Types ============

  /**
   * Creates a Date32 parameter (days since epoch).
   * Suitable for date-only values without time component.
   */
  static date32(value: Date | number): Param {
    return new Param(value, 'Date32');
  }

  /**
   * Creates a Date64 parameter (milliseconds since epoch).
   * Suitable for date values stored as milliseconds.
   */
  static date64(value: Date | number): Param {
    return new Param(value, 'Date64');
  }

  /**
   * Creates a Time32 parameter.
   * @param value - Time value in the specified unit
   * @param options - Time unit (Second or Millisecond)
   */
  static time32(value: number, options: TimeOptions): Param {
    if (options.unit !== 'Second' && options.unit !== 'Millisecond') {
      throw new Error('Time32 only supports Second or Millisecond units');
    }
    return new Param(value, 'Time32', options);
  }

  /**
   * Creates a Time64 parameter.
   * @param value - Time value in the specified unit
   * @param options - Time unit (Microsecond or Nanosecond)
   */
  static time64(value: number | bigint, options: TimeOptions): Param {
    if (options.unit !== 'Microsecond' && options.unit !== 'Nanosecond') {
      throw new Error('Time64 only supports Microsecond or Nanosecond units');
    }
    return new Param(value, 'Time64', options);
  }

  /**
   * Creates a Timestamp parameter.
   * @param value - Date value
   * @param options - Timestamp options (unit and optional timezone)
   */
  static timestamp(
    value: Date | number | bigint,
    options?: TimestampOptions,
  ): Param {
    return new Param(value, 'Timestamp', options ?? { unit: 'Microsecond' });
  }

  /**
   * Creates a Duration parameter.
   * @param value - Duration value in the specified unit
   * @param options - Duration options (unit)
   */
  static duration(value: number | bigint, options: DurationOptions): Param {
    return new Param(value, 'Duration', options);
  }

  // Convenience methods for common duration units
  static durationSeconds(value: number | bigint): Param {
    return Param.duration(value, { unit: 'Second' });
  }

  static durationMilliseconds(value: number | bigint): Param {
    return Param.duration(value, { unit: 'Millisecond' });
  }

  static durationMicroseconds(value: number | bigint): Param {
    return Param.duration(value, { unit: 'Microsecond' });
  }

  static durationNanoseconds(value: number | bigint): Param {
    return Param.duration(value, { unit: 'Nanosecond' });
  }

  // ============ Decimal Types ============

  /**
   * Creates a Decimal128 parameter with specified precision and scale.
   * @param value - Decimal value
   * @param options - Precision (total digits) and scale (decimal places)
   */
  static decimal128(value: number | string, options: DecimalOptions): Param {
    return new Param(value, 'Decimal128', options);
  }

  /**
   * Creates a Decimal256 parameter with specified precision and scale.
   * For very high precision decimal values.
   * @param value - Decimal value
   * @param options - Precision (total digits) and scale (decimal places)
   */
  static decimal256(value: number | string, options: DecimalOptions): Param {
    return new Param(value, 'Decimal256', options);
  }

  // ============ Null Type ============

  /**
   * Creates an explicit NULL parameter.
   */
  static null(): Param {
    return new Param(null, 'Null');
  }

  static nullValue(): Param {
    return Param.null();
  }

  // ============ Generic Constructor ============

  /**
   * Creates a parameter with explicit type specification.
   * Use this for advanced cases not covered by the convenience methods.
   * @param value - The value
   * @param type - Arrow type identifier
   * @param options - Optional type-specific options
   */
  static of(value: any, type: ArrowTypeId, options?: any): Param {
    return new Param(value, type, options);
  }
}

// Re-export for convenience
export default Param;
