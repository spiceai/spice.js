/**
 * Flight parameter encoding for temporal and decimal types, and bigint over HTTP.
 * These used to throw "Cannot mix BigInt and other types" / "value.subarray is not
 * a function" while building the bound Arrow batch.
 */
import { tableFromIPC } from 'apache-arrow';
import { Param } from '../src/param';
import { serializeParametersToIPC, toUnscaledDecimal } from '../src/adbc/client';
import { stringifyWithBigInt } from '../src/client-common';

const d = new Date('2026-10-12T01:02:03.456Z');

function bound(param: unknown) {
  const table = tableFromIPC(serializeParametersToIPC([param]));
  const field = table.schema.fields[0];
  const data = table.getChildAt(0)!.data[0];
  return { type: field.type.toString(), arrowType: field.type as any, values: data.values };
}

describe('Flight parameter encoding', () => {
  it('encodes an inferred Date as a microsecond timestamp', () => {
    const { type, values } = bound(d);
    expect(type).toMatch(/Timestamp<MICROSECOND/);
    expect(values[0]).toBe(1791766923456000n);
  });

  it.each([
    ['Second', 1791766923n],
    ['Millisecond', 1791766923456n],
    ['Microsecond', 1791766923456000n],
    ['Nanosecond', 1791766923456000000n],
  ] as const)('encodes Param.timestamp(Date) in %s', (unit, expected) => {
    expect(bound(Param.timestamp(d, { unit })).values[0]).toBe(expected);
  });

  it('keeps a bigint timestamp in its declared unit exactly', () => {
    const v = 1791766923456789123n;
    expect(bound(Param.timestamp(v, { unit: 'Nanosecond' })).values[0]).toBe(v);
  });

  it('rejects timestamps outside the 64-bit range instead of wrapping', () => {
    expect(() => bound(Param.timestamp(2n ** 63n, { unit: 'Nanosecond' }))).toThrow(
      /outside the signed 64-bit range/,
    );
    expect(() =>
      bound(Param.timestamp(new Date('2500-01-01T00:00:00Z'), { unit: 'Nanosecond' })),
    ).toThrow(/outside the signed 64-bit range/);
  });

  it('floors pre-epoch sub-unit instants', () => {
    const pre = new Date('1969-12-31T23:59:59.500Z');
    expect(bound(Param.timestamp(pre, { unit: 'Second' })).values[0]).toBe(-1n);
    expect(bound(Param.date32(pre)).values[0]).toBe(-1);
  });

  it('encodes Param.decimal128 from a bigint', () => {
    const { values } = bound(Param.decimal128(42n, { precision: 10, scale: 2 }));
    expect(Array.from(values.slice(0, 4))).toEqual([4200, 0, 0, 0]);
  });

  it('encodes Param.date32 from a Date and from a day count', () => {
    expect(bound(Param.date32(d)).values[0]).toBe(20738);
    expect(bound(Param.date32(20738)).values[0]).toBe(20738);
  });

  it('encodes decimal128 exactly from a string', () => {
    const { arrowType, values } = bound(
      Param.decimal128('12345678.90', { precision: 10, scale: 2 }),
    );
    expect([arrowType.precision, arrowType.scale, arrowType.bitWidth]).toEqual([10, 2, 128]);
    expect(Array.from(values.slice(0, 4))).toEqual([1234567890, 0, 0, 0]);
  });

  it('encodes negative decimal256 in two\'s complement', () => {
    const { arrowType, values } = bound(
      Param.decimal256('-0.05', { precision: 40, scale: 2 }),
    );
    expect(arrowType.bitWidth).toBe(256);
    expect(Array.from(values.slice(0, 8))).toEqual(
      [0xfffffffb, ...Array(7).fill(0xffffffff)],
    );
  });

  it('parses decimals without floating point', () => {
    expect(toUnscaledDecimal('12345678.90', 15)).toBe(12345678900000000000000n);
    expect(toUnscaledDecimal(12.34, 2)).toBe(1234n);
    expect(toUnscaledDecimal(5n, 2)).toBe(500n);
    expect(() => toUnscaledDecimal('1.234', 2)).toThrow(/fractional digits/);
    expect(() => toUnscaledDecimal('abc', 2)).toThrow(/Invalid decimal/);
  });
});

describe('bigint over HTTP', () => {
  it('serializes bigint as an exact JSON integer', () => {
    expect(
      stringifyWithBigInt({ parameters: [9223372036854775807n, -5n, 'x'] }),
    ).toBe('{"parameters":[9223372036854775807,-5,"x"]}');
  });

  it('never rewrites caller strings or keys that look like placeholders', () => {
    const input = {
      '__spice_bigint_abc__1': '__spice_bigint_abc__123',
      n: 7n,
    };
    expect(JSON.parse(stringifyWithBigInt(input))).toEqual({
      '__spice_bigint_abc__1': '__spice_bigint_abc__123',
      n: 7,
    });
  });
});
