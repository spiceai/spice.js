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

  test('keeps nested unsafe integers exact', () => {
    const rows = parseJsonLossless(
      '[{"arr":[9007199254740993,1]},{"arr":[2]}]',
    );
    const sqlV1 = convertToSqlV1Format(rows);
    const table = jsonToArrowTable(sqlV1.schema.fields, sqlV1.data);
    expect(table.schema.fields[0].type.toString()).toBe('List<Int64>');
    expect(Array.from(table.get(0)!.arr)).toEqual([
      BigInt('9007199254740993'),
      BigInt(1),
    ]);
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
