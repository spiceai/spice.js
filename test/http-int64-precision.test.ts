/**
 * Int64/UInt64 values outside ±(2^53 - 1) must come back exact over HTTP.
 * JSON.parse rounds them (9007199254740993 -> 9007199254740992), so the HTTP
 * path parses losslessly and types such columns Int64/UInt64, matching Flight.
 */

import { SpiceClient } from '../src/index.browser';
import { parseJsonLossless } from '../src/json-lossless';
import { jsonToArrowTable, convertToSqlV1Format } from '../src/arrow-utils';

const BODY =
  '[{"big":9007199254740993,"neg":-9007199254740995,"id17":12345678901234567,' +
  '"umax":18446744073709551615,"small":42,"f":1.5,"e":1e300,"s":"9007199254740993",' +
  '"arr":[9007199254740993,1],"obj":{"x":-9223372036854775808,"y":[2,12345678901234567]}}]';

describe.each([
  ['native reviver (or fallback when unsupported)', false],
  ['portable parser', true],
])('parseJsonLossless: %s', (_name, forceFallback) => {
  const parse = (text: string, mode: 'bigint' | 'string' = 'bigint') =>
    parseJsonLossless(text, mode, forceFallback);

  test('keeps unsafe integers exact as bigint, incl. negatives, UInt64 max, nested', () => {
    const [row] = parse(BODY);
    expect(row.big).toBe(BigInt('9007199254740993'));
    expect(row.neg).toBe(BigInt('-9007199254740995'));
    expect(row.id17).toBe(BigInt('12345678901234567'));
    expect(row.umax).toBe(BigInt('18446744073709551615'));
    expect(row.arr).toEqual([BigInt('9007199254740993'), 1]);
    expect(row.obj.x).toBe(BigInt('-9223372036854775808'));
    expect(row.obj.y).toEqual([2, BigInt('12345678901234567')]);
  });

  test('leaves safe integers, floats, exponents and strings unchanged', () => {
    const [row] = parse(BODY);
    expect(row.small).toBe(42);
    expect(row.f).toBe(1.5);
    expect(row.e).toBe(1e300);
    expect(row.s).toBe('9007199254740993');
    expect(parse('[9007199254740991,-9007199254740991]')).toEqual([
      Number.MAX_SAFE_INTEGER,
      Number.MIN_SAFE_INTEGER,
    ]);
  });

  test("'string' mode returns exact decimal strings", () => {
    const [row] = parse(BODY, 'string');
    expect(row.big).toBe('9007199254740993');
    expect(row.umax).toBe('18446744073709551615');
    expect(row.small).toBe(42);
  });

  test('matches JSON.parse on edge cases', () => {
    for (const doc of [
      '{"a":1,"a":12345678901234567}',
      '{"__proto__":{"x":1},"n":12345678901234567}',
      '[-0,12345678901234567,"\\ud83d\\ude00"]',
    ]) {
      const expected = JSON.parse(doc, (_k, v) =>
        typeof v === 'number' && !Number.isSafeInteger(v) && Number.isInteger(v)
          ? 'X'
          : v,
      );
      const actual = JSON.parse(
        JSON.stringify(parse(doc), (_k, v) =>
          typeof v === 'bigint' ? 'X' : v,
        ),
      );
      expect(actual).toEqual(JSON.parse(JSON.stringify(expected)));
    }
    expect(Object.is(parse('[-0,12345678901234567]')[0], -0)).toBe(true);
    expect(
      Object.getPrototypeOf(
        parse('{"__proto__":{"x":1},"n":12345678901234567}'),
      ),
    ).toBe(Object.prototype);
  });

  test('matches JSON.parse on ordinary documents', () => {
    const doc =
      '{"a":[1,2.5,-0.25e-3,true,false,null,"x\\"\\u00e9\\n"],"b":{},"c":[],"d":"1234567890123456789"}';
    expect(parse(doc)).toEqual(JSON.parse(doc));
    expect(parse(' 7 ')).toBe(7);
  });

  test('rejects malformed JSON', () => {
    for (const bad of [
      '{"a":12345678901234567',
      '[12345678901234567,]',
      '{"a" 1}',
      '[1] x 12345678901234567',
    ]) {
      expect(() => parse(bad)).toThrow(SyntaxError);
    }
  });
});

describe('jsonToArrowTable with lossless rows', () => {
  test('types unsafe-integer columns Int64/UInt64 and keeps safe columns as before', () => {
    const rows = parseJsonLossless(
      '[{"big":9007199254740993,"umax":18446744073709551615,"mixed":1,"small":42},' +
        '{"big":null,"umax":1,"mixed":-9007199254740995,"small":7}]',
    );
    const sqlV1 = convertToSqlV1Format(rows);
    const table = jsonToArrowTable(sqlV1.schema.fields, sqlV1.data);
    const types = Object.fromEntries(
      table.schema.fields.map((f) => [f.name, f.type.toString()]),
    );
    expect(types).toEqual({
      big: 'Int64',
      umax: 'Uint64',
      mixed: 'Int64',
      small: 'Float64',
    });
    const [r0, r1] = table.toArray().map((r: any) => r.toJSON());
    expect(r0.big).toBe(BigInt('9007199254740993'));
    expect(r1.big).toBeNull();
    expect(r0.umax).toBe(BigInt('18446744073709551615'));
    expect(r0.mixed).toBe(BigInt(1));
    expect(r1.mixed).toBe(BigInt('-9007199254740995'));
    expect(r0.small).toBe(42);
  });

  test('uses the declared UInt64 type when values fit Int64', () => {
    const table = jsonToArrowTable(
      [{ name: 'u', data_type: 'UInt64' }],
      [{ u: BigInt('9007199254740993') }],
    );
    expect(table.schema.fields[0].type.toString()).toBe('Uint64');
  });

  const build = (text: string) => {
    const sqlV1 = convertToSqlV1Format(parseJsonLossless(text));
    return jsonToArrowTable(sqlV1.schema.fields, sqlV1.data);
  };
  const typeOf = (table: any, name: string) =>
    table.schema.fields.find((f: any) => f.name === name).type.toString();

  test('keeps nested unsafe integers exact as JSON text, incl. UInt64 max', () => {
    const table = build(
      '[{"arr":[9007199254740993,1],"u":[18446744073709551615],"s":{"id":9007199254740993,"f":1.5}},' +
        '{"arr":[2],"u":null,"s":{"id":1,"f":1}}]',
    );
    expect(typeOf(table, 'arr')).toBe('Dictionary<Int32, Utf8>');
    const rows = table.toArray();
    expect(rows[0].arr).toBe('[9007199254740993,1]');
    expect(rows[0].u).toBe('[18446744073709551615]');
    expect(rows[0].s).toBe('{"id":9007199254740993,"f":1.5}');
    expect(rows[1].arr).toBe('[2]');
    expect(rows[1].u).toBeNull();
  });

  test('nested values without unsafe integers are inferred as before', () => {
    const table = build('[{"arr":[1,2],"s":{"a":1.5}}]');
    expect(typeOf(table, 'arr')).toBe('List<Float64>');
    expect(typeOf(table, 's')).toBe('Struct<{a:Float64}>');
  });

  test('keeps a UInt64 vector when another column falls back to inference', () => {
    const table = build(
      '[{"u":18446744073709551615,"s":{"x":1}},{"u":1,"s":null},{"u":2,"s":[1,"a"]}]',
    );
    expect(typeOf(table, 'u')).toBe('Uint64');
    expect(table.get(0)!.u).toBe(BigInt('18446744073709551615'));
  });

  test('honors declared non-integer types as before', () => {
    const table = jsonToArrowTable(
      [
        { name: 'f', data_type: 'Float64' },
        { name: 'd', data_type: 'Decimal128(38, 0)' },
      ],
      parseJsonLossless(
        '[{"f":9007199254740992,"d":123456789012345678901234567890},{"f":1.5,"d":1}]',
      ),
    );
    expect(typeOf(table, 'f')).toBe('Float64');
    expect(table.get(0)!.f).toBe(9007199254740992);
    expect(table.get(1)!.f).toBe(1.5);
    expect(typeOf(table, 'd')).toBe('Float64');
  });

  test('integers outside every 64-bit range stay exact as text', () => {
    const table = build('[{"x":123456789012345678901234567890}]');
    expect(table.get(0)!.x).toBe('123456789012345678901234567890');
  });

  test('round-2 edge cases', () => {
    let t = build('[{"x":null},{"x":9007199254740993}]');
    expect(t.get(1)!.x).toBe(BigInt('9007199254740993'));
    t = jsonToArrowTable(
      [{ name: 'x', data_type: 'BIGINT' }],
      parseJsonLossless('[{"x":9007199254740993}]'),
    );
    expect(t.get(0)!.x).toBe(BigInt('9007199254740993'));
    t = build('[{"x":-1},{"x":18446744073709551615}]');
    expect(t.toArray().map((r: any) => r.x)).toEqual([
      '-1',
      '18446744073709551615',
    ]);
    t = build(
      '[{"s":{"\\u0000bigint:1":"\\u0000bigint:2","n":9007199254740993}}]',
    );
    expect(JSON.parse(t.get(0)!.s)).toEqual({
      '\u0000bigint:1': '\u0000bigint:2',
      n: 9007199254740992,
    });
    expect(t.get(0)!.s).toContain('"n":9007199254740993');
  });

  test('a declared Int64 column of safe values is unchanged', () => {
    const table = jsonToArrowTable(
      [{ name: 'i', data_type: 'Int64' }],
      parseJsonLossless('[{"i":1},{"i":2}]'),
    );
    expect(typeOf(table, 'i')).toBe('Float64');
  });
});

describe('SpiceClient HTTP results keep Int64 precision', () => {
  const rowsBody =
    '[{"big":9007199254740993,"neg":-9007199254740995,"id17":12345678901234567,"small":42}]';
  let body: string;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    body = rowsBody;
    mockFetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: () => Promise.resolve(body),
        json: () => Promise.resolve(JSON.parse(body)),
      }),
    );
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('sql() returns exact bigint values in Int64 columns', async () => {
    const client = new SpiceClient({ httpUrl: 'http://localhost:8090' });
    const table = await client.sql('SELECT 1');
    const row = table.toArray()[0];
    expect(
      table.schema.fields.find((f) => f.name === 'big')!.type.toString(),
    ).toBe('Int64');
    expect(row.big).toBe(BigInt('9007199254740993'));
    expect(row.neg).toBe(BigInt('-9007199254740995'));
    expect(row.id17).toBe(BigInt('12345678901234567'));
    expect(row.small).toBe(42);
  });

  test('streamed chunks share one Int64 schema', async () => {
    body = '[{"x":1}]\n[{"x":9007199254740993}]';
    const client = new SpiceClient({ httpUrl: 'http://localhost:8090' });
    const chunks: any[] = [];
    const table = await client.sql('SELECT 1', (t) => chunks.push(t));
    expect(chunks.map((t) => t.schema.fields[0].type.toString())).toEqual([
      'Int64',
      'Int64',
    ]);
    expect(table.toArray().map((r: any) => r.x)).toEqual([
      BigInt(1),
      BigInt('9007199254740993'),
    ]);
  });

  test('sqlJson() returns exact decimal strings, like the Flight path', async () => {
    body = `{"row_count":1,"schema":{"fields":[{"name":"big","data_type":"Int64"}]},"data":${body}}`;
    const client = new SpiceClient({ httpUrl: 'http://localhost:8090' });
    const result = await client.sqlJson('SELECT 1');
    expect(result.data[0]).toEqual({
      big: '9007199254740993',
      neg: '-9007199254740995',
      id17: '12345678901234567',
      small: 42,
    });
  });
});
