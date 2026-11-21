/**
 * Int64/UInt64 values outside ±(2^53 - 1) must come back exact over HTTP.
 * JSON.parse rounds them (9007199254740993 -> 9007199254740992), so the HTTP
 * path parses losslessly and types such columns Int64/UInt64, matching Flight.
 */

import * as arrow from 'apache-arrow';
import { SpiceClient } from '../src/index.browser';
import { parseJsonLossless } from '../src/json-lossless';
import { jsonToArrowTable, convertToSqlV1Format, normalizeUnsafeIntegers } from '../src/arrow-utils';

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
    expect(typeOf(table, 'arr')).toBe('Utf8');
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

  test('toArray() timestamp handling keeps nested Int64 text exact', async () => {
    body = '[{"s":{"id":9007199254740993,"ts":"2024-01-01T00:00:00.000Z"}}]';
    const client = new SpiceClient({ httpUrl: 'http://localhost:8090' });
    const table = await client.sql('SELECT 1');
    const row: any = table.toArray()[0];
    expect(String(row.s)).toContain('"id":9007199254740993');
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

  test('streamed JSON-text chunks share one Utf8 schema, incl. all-null chunks', async () => {
    body = '[{"x":null}]\n[{"x":[9007199254740993]}]';
    const client = new SpiceClient({ httpUrl: 'http://localhost:8090' });
    const chunks: any[] = [];
    await client.sql('SELECT 1', (t) => chunks.push(t));
    expect(chunks.map((t) => t.schema.fields[0].type.toString())).toEqual([
      'Utf8',
      'Utf8',
    ]);
    expect(chunks[1].toArray()[0].x).toBe('[9007199254740993]');
  });

  test('sqlJson() keeps numbers for declared Float64/Decimal fields', async () => {
    body =
      '{"row_count":1,"schema":{"fields":[{"name":"f","data_type":"Float64"},' +
      '{"name":"d","data_type":"Decimal128(20, 0)"},{"name":"big","data_type":"Int64"},' +
      '{"name":"s","data_type":"Struct"}]},' +
      '"data":[{"f":9007199254740992,"d":12345678901234567,"big":9007199254740993,' +
      '"s":{"id":9007199254740993,"n":1}}]}';
    const client = new SpiceClient({ httpUrl: 'http://localhost:8090' });
    const result = await client.sqlJson('SELECT 1');
    expect(result.data[0]).toEqual({
      f: 9007199254740992,
      d: 12345678901234567,
      big: '9007199254740993',
      s: { id: '9007199254740993', n: 1 },
    });
  });

  test('sqlJson() after a Flight-to-HTTP fallback returns nested values, not JSON text', async () => {
    body = '[{"s":{"id":9007199254740993,"n":1},"l":[9007199254740993,2]}]';
    const client = new SpiceClient({
      httpUrl: 'http://localhost:8090',
      logging: false,
    });
    client.setMaxRetries(0);
    (client as any)._grpcClient = {
      ensureInitialized: jest.fn().mockResolvedValue(true),
      executeQuery: jest.fn().mockRejectedValue(
        Object.assign(new Error('14 UNAVAILABLE: connection refused'), {
          code: 14,
        }),
      ),
    };
    const result = await client.sqlJson('SELECT 1');
    expect(result.data[0]).toEqual({
      s: { id: '9007199254740993', n: 1 },
      l: ['9007199254740993', 2],
    });
  });

  test('sqlJson() Flight fallback round-trips mixed string cells in a JSON-text column', async () => {
    body = '[{"s":{"id":9007199254740993}},{"s":"hello"}]';
    const client = new SpiceClient({
      httpUrl: 'http://localhost:8090',
      logging: false,
    });
    client.setMaxRetries(0);
    (client as any)._grpcClient = {
      ensureInitialized: jest.fn().mockResolvedValue(true),
      executeQuery: jest.fn().mockRejectedValue(
        Object.assign(new Error('14 UNAVAILABLE: connection refused'), {
          code: 14,
        }),
      ),
    };
    const result = await client.sqlJson('SELECT 1');
    expect(result.data).toEqual([
      { s: { id: '9007199254740993' } },
      { s: 'hello' },
    ]);
  });

  test('sqlJson() Flight fallback keeps nested Float64 leaves as numbers', async () => {
    body =
      '{"row_count":1,"schema":{"fields":[{"name":"s","data_type":{"Struct":[' +
      '{"name":"id","data_type":"Float64","nullable":true},' +
      '{"name":"tag","data_type":"Utf8","nullable":true}]}},' +
      '{"name":"l","data_type":{"List":{"name":"item","data_type":"Float64",' +
      '"nullable":true,"dict_id":0,"dict_is_ordered":false,"metadata":{}}}}]},' +
      '"data":[{"s":{"id":9007199254740992,"tag":"x"},"l":[9007199254740992,1]}]}';
    const client = new SpiceClient({
      httpUrl: 'http://localhost:8090',
      logging: false,
    });
    client.setMaxRetries(0);
    (client as any)._grpcClient = {
      ensureInitialized: jest.fn().mockResolvedValue(true),
      executeQuery: jest.fn().mockRejectedValue(
        Object.assign(new Error('14 UNAVAILABLE: connection refused'), {
          code: 14,
        }),
      ),
    };
    const result = await client.sqlJson('SELECT 1');
    expect(result.data[0]).toEqual({
      s: { id: 9007199254740992, tag: 'x' },
      l: [9007199254740992, 1],
    });
    expect(typeof result.data[0].s.id).toBe('number');
    expect(typeof result.data[0].l[0]).toBe('number');
  });

  test('sqlJson() true Flight path keeps Binary as Uint8Array', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const table = new arrow.Table({
      bin: arrow.vectorFromArray([bytes], new arrow.Binary()),
      n: arrow.vectorFromArray([1], new arrow.Int32()),
    });
    // True Flight tables have no HTTP _originalSchema.
    expect((table as any)._originalSchema).toBeUndefined();

    const client = new SpiceClient({
      httpUrl: 'http://localhost:8090',
      logging: false,
    });
    (client as any)._grpcClient = {
      ensureInitialized: jest.fn().mockResolvedValue(true),
    };
    jest.spyOn(client, 'sql').mockImplementation(
      async (_q: string, _opts?: any, onData?: (t: any) => void) => {
        onData?.(table);
        return table;
      },
    );

    const result = await client.sqlJson('SELECT 1');
    expect(result.data[0].bin).toBeInstanceOf(Uint8Array);
    expect(Array.from(result.data[0].bin)).toEqual([1, 2, 3, 4]);
    // Typed-array methods must remain (plain-object copy would lose them).
    expect(typeof result.data[0].bin.subarray).toBe('function');
    expect(result.data[0].n).toBe(1);
  });

  test('sqlJson() keeps nested Float64 leaves as numbers via child schema', async () => {
    body =
      '{"row_count":1,"schema":{"fields":[{"name":"s","data_type":{"Struct":[' +
      '{"name":"id","data_type":"Float64","nullable":true},' +
      '{"name":"tag","data_type":"Utf8","nullable":true}]}},' +
      '{"name":"l","data_type":{"List":{"name":"item","data_type":"Float64",' +
      '"nullable":true,"dict_id":0,"dict_is_ordered":false,"metadata":{}}}}]},' +
      '"data":[{"s":{"id":9007199254740992,"tag":"x"},"l":[9007199254740992,1]}]}';
    const client = new SpiceClient({ httpUrl: 'http://localhost:8090' });
    const result = await client.sqlJson('SELECT 1');
    expect(result.data[0]).toEqual({
      s: { id: 9007199254740992, tag: 'x' },
      l: [9007199254740992, 1],
    });
  });

  test('sqlJson() preserves nested __proto__ as an own property', async () => {
    body =
      '{"row_count":1,"schema":{"fields":[{"name":"s","data_type":{"Struct":[' +
      '{"name":"__proto__","data_type":{"Struct":[{"name":"tag","data_type":"Utf8"}]},' +
      '"nullable":true},{"name":"id","data_type":"Int64","nullable":true}]}}]},' +
      '"data":[{"s":{"__proto__":{"tag":"query-data"},"id":9007199254740993}}]}';
    const client = new SpiceClient({ httpUrl: 'http://localhost:8090' });
    const result = await client.sqlJson('SELECT 1');
    const s = result.data[0].s;
    expect(Object.prototype.hasOwnProperty.call(s, '__proto__')).toBe(true);
    expect(s.__proto__).toEqual({ tag: 'query-data' });
    expect(Object.getPrototypeOf(s)).toBe(Object.prototype);
    expect(s.id).toBe('9007199254740993');
    expect((s as any).tag).toBeUndefined();
  });

  test('sqlJson() honours array-schema Float64 via type.name', async () => {
    body =
      '{"schema":[{"name":"f","type":{"name":"Float64"}},{"name":"big","type":{"name":"Int64"}}],' +
      '"rows":[[9007199254740992,9007199254740993]]}';
    const client = new SpiceClient({ httpUrl: 'http://localhost:8090' });
    const result = await client.sqlJson('SELECT 1');
    expect(result.data[0]).toEqual([9007199254740992, '9007199254740993']);
  });
});

describe('declared types survive lossless HTTP decoding', () => {
  let body: string;

  beforeEach(() => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: () => Promise.resolve(body),
        json: () => Promise.resolve(JSON.parse(body)),
      }),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const fallbackClient = () => {
    const client = new SpiceClient({
      httpUrl: 'http://localhost:8090',
      logging: false,
    });
    client.setMaxRetries(0);
    (client as any)._grpcClient = {
      ensureInitialized: jest.fn().mockResolvedValue(true),
      executeQuery: jest.fn().mockRejectedValue(
        Object.assign(new Error('14 UNAVAILABLE: connection refused'), {
          code: 14,
        }),
      ),
    };
    return client;
  };
  const typeOfField = (table: arrow.Table, name: string) =>
    table.schema.fields.find((f) => f.name === name)!.type.toString();

  const bareArraySchemaBody =
    '{"schema":[{"name":"f","data_type":"Float64"},' +
    '{"name":"d","data_type":"Decimal128(38, 0)"},{"name":"big","data_type":"Int64"}],' +
    '"data":[{"f":9007199254740992,"d":12345678901234567,"big":9007199254740993}]}';

  test('convertToSqlV1Format keeps data_type from bare-array schemas', () => {
    const v1 = convertToSqlV1Format(parseJsonLossless(bareArraySchemaBody));
    expect(v1.schema.fields.map((f: any) => f.data_type)).toEqual([
      'Float64',
      'Decimal128(38, 0)',
      'Int64',
    ]);
    const legacy = convertToSqlV1Format(
      JSON.parse(
        '{"schema":[{"name":"f","type":{"name":"Float64"}},{"name":"x"}],"rows":[]}',
      ),
    );
    expect(legacy.schema.fields.map((f: any) => f.data_type)).toEqual([
      'Float64',
      'utf8',
    ]);
  });

  test('sql() honours bare-array data_type: Float64/Decimal stay numbers', async () => {
    body = bareArraySchemaBody;
    const client = new SpiceClient({ httpUrl: 'http://localhost:8090' });
    const table = await client.sql('SELECT 1');
    expect(typeOfField(table, 'f')).toBe('Float64');
    expect(typeOfField(table, 'd')).toBe('Float64');
    expect(typeOfField(table, 'big')).toBe('Int64');
    const row: any = table.toArray()[0];
    expect(row.f).toBe(9007199254740992);
    expect(row.d).toBe(12345678901234567);
    expect(row.big).toBe(BigInt('9007199254740993'));
  });

  test('sqlJson() Flight fallback honours bare-array data_type like direct HTTP', async () => {
    body = bareArraySchemaBody;
    const expected = {
      f: 9007199254740992,
      d: 12345678901234567,
      big: '9007199254740993',
    };
    const direct = await new SpiceClient({
      httpUrl: 'http://localhost:8090',
    }).sqlJson('SELECT 1');
    expect(direct.data[0]).toEqual(expected);
    const fallback = await fallbackClient().sqlJson('SELECT 1');
    expect(fallback.data[0]).toEqual(expected);
    expect(typeof fallback.data[0].f).toBe('number');
    expect(typeof fallback.data[0].d).toBe('number');
  });

  const floatNestedBody =
    '{"row_count":2,"schema":{"fields":[' +
    '{"name":"l","data_type":{"List":{"name":"item","data_type":"Float64","nullable":true,' +
    '"dict_id":0,"dict_is_ordered":false,"metadata":{}}}},' +
    '{"name":"s","data_type":{"Struct":[{"name":"x","data_type":"Float64","nullable":true},' +
    '{"name":"y","data_type":"Decimal128(38, 0)","nullable":true}]}}]},' +
    '"data":[{"l":[9007199254740992,1.5],"s":{"x":9007199254740992,"y":12345678901234567}},' +
    '{"l":[2.5],"s":{"x":1.5,"y":1}}]}';

  test('sql() keeps declared List<Float64> and Float/Decimal structs nested, not JSON text', async () => {
    body = floatNestedBody;
    const client = new SpiceClient({ httpUrl: 'http://localhost:8090' });
    const table = await client.sql('SELECT 1');
    expect(typeOfField(table, 'l')).toBe('List<Float64>');
    expect(typeOfField(table, 's').startsWith('Struct<')).toBe(true);
    const rows: any[] = table.toArray();
    expect(Array.from(rows[0].l)).toEqual([9007199254740992, 1.5]);
    expect(rows[0].s.x).toBe(9007199254740992);
    expect(rows[0].s.y).toBe(12345678901234567);
  });

  test('jsonToArrowTable still uses JSON text when a nested leaf is a real unsafe integer', () => {
    const table = jsonToArrowTable(
      [
        {
          name: 's',
          data_type: {
            Struct: [
              { name: 'f', data_type: 'Float64' },
              { name: 'i', data_type: 'Int64' },
            ],
          },
        },
      ],
      parseJsonLossless('[{"s":{"f":9007199254740992,"i":9007199254740993}}]'),
    );
    expect(typeOfField(table, 's')).toBe('Utf8');
    expect(table.get(0)!.s).toContain('"i":9007199254740993');
  });

  test('sqlJson() Flight fallback advertises declared List/Struct fields for JSON-text columns', async () => {
    const listType = {
      List: {
        name: 'item',
        data_type: 'Int64',
        nullable: true,
        dict_id: 0,
        dict_is_ordered: false,
        metadata: {},
      },
    };
    const structType = {
      Struct: [
        { name: 'id', data_type: 'Int64', nullable: true },
        { name: 'n', data_type: 'Int32', nullable: true },
      ],
    };
    body = JSON.stringify({
      row_count: 1,
      schema: {
        fields: [
          { name: 'l', data_type: listType, nullable: true },
          { name: 's', data_type: structType, nullable: false },
          { name: 'big', data_type: 'Int64', nullable: true },
        ],
      },
      data: [{ l: ['@L'], s: { id: '@S', n: 1 }, big: '@B' }],
    })
      .replace('"@L"', '9007199254740993')
      .replace('"@S"', '9007199254740993')
      .replace('"@B"', '9007199254740993');

    const client = fallbackClient();
    const table = await client.sql('SELECT 1');
    // sql() keeps the exact JSON text as Utf8.
    expect(typeOfField(table, 'l')).toBe('Utf8');
    expect(typeOfField(table, 's')).toBe('Utf8');

    const result = await fallbackClient().sqlJson('SELECT 1');
    expect(result.data[0]).toEqual({
      l: ['9007199254740993'],
      s: { id: '9007199254740993', n: 1 },
      big: '9007199254740993',
    });
    const fields = result.schema.fields;
    expect(fields[0]).toMatchObject({ name: 'l', data_type: listType });
    expect(fields[1]).toMatchObject({
      name: 's',
      data_type: structType,
      nullable: false,
    });
    expect(fields[2]).toMatchObject({ name: 'big', data_type: 'Int64' });
  });
});

describe('normalizeUnsafeIntegers', () => {
  test('nested Float64 child keeps a number; Int64 child becomes a string', () => {
    const rows = [
      {
        s: { f: BigInt('9007199254740992'), i: BigInt('9007199254740993') },
      },
    ];
    normalizeUnsafeIntegers(
      [
        {
          name: 's',
          data_type: {
            Struct: [
              { name: 'f', data_type: 'Float64' },
              { name: 'i', data_type: 'Int64' },
            ],
          },
        },
      ],
      rows,
    );
    expect(rows[0].s).toEqual({ f: 9007199254740992, i: '9007199254740993' });
  });

  test('duplicate field names keep first-match data_type via Map lookup', () => {
    const rows = [{ a: BigInt('9007199254740992') }];
    normalizeUnsafeIntegers(
      [
        { name: 'a', data_type: 'Float64' },
        { name: 'a', data_type: 'Int64' },
      ],
      rows,
    );
    // .find first-match was Float64 → number, not Int64 → string
    expect(rows[0].a).toBe(9007199254740992);
    expect(typeof rows[0].a).toBe('number');

    const rows2 = [{ a: BigInt('9007199254740992') }];
    normalizeUnsafeIntegers(
      [
        { name: 'a', data_type: 'Int64' },
        { name: 'a', data_type: 'Float64' },
      ],
      rows2,
    );
    expect(rows2[0].a).toBe('9007199254740992');
  });
});
