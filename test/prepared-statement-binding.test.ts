/**
 * Unit tests for server-side parameter binding.
 *
 * Parameterized queries on the Node gRPC path bind values as a typed Arrow record
 * batch through a Flight SQL prepared statement, rather than splicing them into the
 * SQL text. These tests cover the two pieces that have to match the wire protocol
 * exactly: the column naming of the bound batch, and the IPC framing DoPut expects.
 */

import * as arrow from 'apache-arrow';
import {
  buildNamedParameterColumns,
  buildParameterColumns,
  serializeNamedParametersToIPC,
  serializeParametersToIPC,
} from '../src/adbc/client';
import { splitArrowIpcStream } from '../src/grpc/client.node';
import { arrowTypeFor, normalizeParam } from '../src/adbc/client';
import { Param } from '../src/param';

const IPC_CONTINUATION_MARKER = 0xffffffff;

describe('Parameter binding', () => {
  describe('positional parameter columns', () => {
    test('names columns $1, $2, ... matching the placeholders', () => {
      const { columns } = buildParameterColumns(['a', 'b', 'c']);
      expect(Object.keys(columns)).toEqual(['$1', '$2', '$3']);
    });

    test('keeps values in their own single-row column', () => {
      const { columns } = buildParameterColumns([42, 'text']);
      expect(columns.$1).toEqual([BigInt(42)]);
      expect(columns.$2).toEqual(['text']);
    });

    test('infers int64 for integers and float64 for decimals', () => {
      const { types } = buildParameterColumns([1, 1.5]);
      expect(types.$1).toBe('int64');
      expect(types.$2).toBe('float64');
    });

    test('round-trips through Arrow with the placeholder names intact', () => {
      const table = arrow.tableFromIPC(serializeParametersToIPC([7]));
      expect(table.schema.fields.map((f) => f.name)).toEqual(['$1']);
      expect(table.numRows).toBe(1);
    });
  });

  describe('named parameter columns', () => {
    // The runtime looks up a named placeholder by its bare name. Binding a column
    // called `$nm` fails with "No value found for placeholder with name $nm", even
    // though the parameter schema the server reports spells the field `$nm`.
    test('names columns without the leading $', () => {
      const { columns } = buildNamedParameterColumns({ nm: 'EGYPT' });
      expect(Object.keys(columns)).toEqual(['nm']);
    });

    test('strips a leading $ the caller supplied', () => {
      const { columns } = buildNamedParameterColumns({ $nm: 'EGYPT' });
      expect(Object.keys(columns)).toEqual(['nm']);
    });

    test('carries several parameters', () => {
      const { columns } = buildNamedParameterColumns({
        name: 'CANADA',
        region: 1,
      });
      expect(Object.keys(columns).sort()).toEqual(['name', 'region']);
      expect(columns.region).toEqual([BigInt(1)]);
    });

    test('honours an explicit Param dataType', () => {
      const { types } = buildNamedParameterColumns({
        id: { value: 1, dataType: 'int32' },
      });
      expect(types.id).toBe('int32');
    });

    test('round-trips through Arrow with the bare names intact', () => {
      const table = arrow.tableFromIPC(
        serializeNamedParametersToIPC({ nm: 'EGYPT' }),
      );
      expect(table.schema.fields.map((f) => f.name)).toEqual(['nm']);
    });

    test('serializes nothing when there are no parameters', () => {
      expect(serializeNamedParametersToIPC({}).length).toBe(0);
    });
  });

  describe('splitArrowIpcStream', () => {
    test('splits a stream into its messages', () => {
      const messages = splitArrowIpcStream(serializeParametersToIPC([1]));

      // At minimum a schema message and a record batch.
      expect(messages.length).toBeGreaterThanOrEqual(2);
      messages.forEach((m) => {
        expect(Buffer.isBuffer(m.header)).toBe(true);
        expect(m.header.length).toBeGreaterThan(0);
      });
    });

    test('produces headers that decode as Arrow messages', () => {
      const messages = splitArrowIpcStream(serializeParametersToIPC([1, 'two']));

      messages.forEach((m) => {
        const decoded = arrow.Message.decode(m.header);
        expect(Number(decoded.bodyLength)).toBe(m.body.length);
      });
    });

    test('reassembles into the original table', () => {
      const original = serializeParametersToIPC([123, 'abc']);
      const messages = splitArrowIpcStream(original);

      const chunks: Buffer[] = [];
      for (const m of messages) {
        const prefix = Buffer.alloc(8);
        prefix.writeUInt32LE(IPC_CONTINUATION_MARKER, 0);
        prefix.writeUInt32LE(m.header.length, 4);
        chunks.push(prefix, m.header, m.body);
      }
      const eos = Buffer.alloc(8);
      eos.writeUInt32LE(IPC_CONTINUATION_MARKER, 0);
      eos.writeUInt32LE(0, 4);
      chunks.push(eos);

      const table = arrow.tableFromIPC(Buffer.concat(chunks));
      expect(table.schema.fields.map((f) => f.name)).toEqual(['$1', '$2']);
      expect(table.numRows).toBe(1);
    });

    test('returns nothing for an empty stream', () => {
      expect(splitArrowIpcStream(new Uint8Array(0))).toEqual([]);
    });

    test('stops at the end-of-stream marker', () => {
      const eos = Buffer.alloc(8);
      eos.writeUInt32LE(IPC_CONTINUATION_MARKER, 0);
      eos.writeUInt32LE(0, 4);
      expect(splitArrowIpcStream(eos)).toEqual([]);
    });

    test('stops on input that is not an IPC stream', () => {
      expect(splitArrowIpcStream(Buffer.from('not arrow at all'))).toEqual([]);
    });
  });

  describe('values are not spliced into SQL', () => {
    // The point of binding: a value carrying SQL syntax stays a value.
    test('quote characters survive as data, not syntax', () => {
      const { columns } = buildParameterColumns(["CANADA' OR '1'='1"]);
      expect(columns.$1).toEqual(["CANADA' OR '1'='1"]);
    });

    test('the serialized batch holds the raw string', () => {
      const table = arrow.tableFromIPC(
        serializeParametersToIPC(["O'Brien"]),
      );
      expect(table.getChildAt(0)?.get(0)).toBe("O'Brien");
    });
  });
});


describe('explicit Param types', () => {
  const schemaOf = (bytes: Uint8Array) =>
    arrow
      .tableFromIPC(bytes)
      .schema.fields.map((f) => `${f.name}:${f.type}`)
      .join(', ');

  // The public Param class uses { value, type, options }; the column builder
  // speaks { value, dataType }. Without normalization an explicit type is
  // silently inferred away.
  test('normalizes a public Param into the internal shape', () => {
    expect(normalizeParam(Param.int32(5))).toEqual({
      value: 5,
      dataType: 'int32',
      options: undefined,
    });
  });

  test('passes a raw value through untouched', () => {
    expect(normalizeParam(42)).toEqual({ value: 42 });
    expect(normalizeParam('text')).toEqual({ value: 'text' });
    expect(normalizeParam(null)).toEqual({ value: null });
  });

  test('accepts the internal shape as-is', () => {
    expect(normalizeParam({ value: 1, dataType: 'int16' })).toEqual({
      value: 1,
      dataType: 'int16',
      options: undefined,
    });
  });

  test('an explicit type reaches the Arrow schema', () => {
    // A plain number infers Int64; Param.int32 must not.
    expect(schemaOf(serializeParametersToIPC([42]))).toBe('$1:Int64');
    expect(schemaOf(serializeParametersToIPC([Param.int32(42)]))).toBe('$1:Int32');
    expect(schemaOf(serializeParametersToIPC([Param.int16(7)]))).toBe('$1:Int16');
    expect(schemaOf(serializeParametersToIPC([Param.float32(1.5)]))).toBe(
      '$1:Float32',
    );
  });

  test('mixed typed and untyped parameters keep their positions', () => {
    expect(
      schemaOf(serializeParametersToIPC([Param.int32(1), 'plain', Param.float32(2.5)])),
    ).toBe('$1:Int32, $2:Utf8, $3:Float32');
  });

  test('named parameters honour explicit types too', () => {
    expect(schemaOf(serializeNamedParametersToIPC({ nm: Param.int32(9) }))).toBe(
      'nm:Int32',
    );
  });

  test('a type needing absent options falls back to inference', () => {
    // Without a unit there is nothing to resolve, so inference handles it
    // rather than the code guessing a unit.
    expect(arrowTypeFor('time32', undefined)).toBeUndefined();
    expect(arrowTypeFor('decimal128', undefined)).toBeUndefined();
    expect(arrowTypeFor('fixed_size_binary', undefined)).toBeUndefined();
    expect(arrowTypeFor('unknown-type', undefined)).toBeUndefined();
  });

  test('resolves types that need no options', () => {
    expect(arrowTypeFor('int32')?.toString()).toBe('Int32');
    expect(arrowTypeFor('bool')?.toString()).toBe('Bool');
    expect(arrowTypeFor('utf8')?.toString()).toBe('Utf8');
  });
});
