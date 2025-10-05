/**
 * Test to verify Arrow schema serialization for complex types (List, Struct, etc.)
 */

import { serializeArrowField } from '../src/arrow-utils';
import * as arrow from 'apache-arrow';

describe('Arrow Schema Serialization', () => {
  test('should serialize simple types as strings', () => {
    const field = new arrow.Field('name', new arrow.Utf8(), true);
    const serialized = serializeArrowField(field);

    expect(serialized).toEqual({
      name: 'name',
      data_type: 'Utf8',
      nullable: true,
      dict_id: 0,
      dict_is_ordered: false,
      metadata: {},
    });
  });

  test('should serialize Int32 type', () => {
    const field = new arrow.Field('id', new arrow.Int32(), false);
    const serialized = serializeArrowField(field);

    expect(serialized).toEqual({
      name: 'id',
      data_type: 'Int32',
      nullable: false,
      dict_id: 0,
      dict_is_ordered: false,
      metadata: {},
    });
  });

  test('should serialize Float64 type', () => {
    const field = new arrow.Field('amount', new arrow.Float64(), true);
    const serialized = serializeArrowField(field);

    expect(serialized).toEqual({
      name: 'amount',
      data_type: 'Float64',
      nullable: true,
      dict_id: 0,
      dict_is_ordered: false,
      metadata: {},
    });
  });

  test('should serialize List type with nested structure (Cloud format)', () => {
    // Create a List<Utf8> field
    const listField = new arrow.Field(
      'logins',
      new arrow.List(new arrow.Field('item', new arrow.Utf8(), true)),
      true,
    );

    const serialized = serializeArrowField(listField);

    // Should match Cloud API format with nested structure
    expect(serialized).toEqual({
      name: 'logins',
      data_type: {
        List: {
          name: 'item',
          data_type: 'Utf8',
          nullable: true,
          dict_id: 0,
          dict_is_ordered: false,
          metadata: {},
        },
      },
      nullable: true,
      dict_id: 0,
      dict_is_ordered: false,
      metadata: {},
    });
  });

  test('should serialize List<Int32> type', () => {
    const listField = new arrow.Field(
      'numbers',
      new arrow.List(new arrow.Field('item', new arrow.Int32(), false)),
      false,
    );

    const serialized = serializeArrowField(listField);

    expect(serialized).toEqual({
      name: 'numbers',
      data_type: {
        List: {
          name: 'item',
          data_type: 'Int32',
          nullable: false,
          dict_id: 0,
          dict_is_ordered: false,
          metadata: {},
        },
      },
      nullable: false,
      dict_id: 0,
      dict_is_ordered: false,
      metadata: {},
    });
  });

  test('should handle full schema with mixed types', () => {
    const schema = new arrow.Schema([
      new arrow.Field('id', new arrow.Int32(), false),
      new arrow.Field('name', new arrow.Utf8(), true),
      new arrow.Field(
        'tags',
        new arrow.List(new arrow.Field('item', new arrow.Utf8(), true)),
        true,
      ),
      new arrow.Field('active', new arrow.Bool(), false),
    ]);

    const serializedFields = schema.fields.map((field) =>
      serializeArrowField(field),
    );

    expect(serializedFields).toHaveLength(4);

    // Simple type
    expect(serializedFields[0].data_type).toBe('Int32');

    // Another simple type
    expect(serializedFields[1].data_type).toBe('Utf8');

    // Complex type (List)
    expect(serializedFields[2].data_type).toEqual({
      List: {
        name: 'item',
        data_type: 'Utf8',
        nullable: true,
        dict_id: 0,
        dict_is_ordered: false,
        metadata: {},
      },
    });

    // Boolean type
    expect(serializedFields[3].data_type).toBe('Bool');

    // All fields should have metadata
    expect(serializedFields[0]).toHaveProperty('metadata');
    expect(serializedFields[1]).toHaveProperty('metadata');
    expect(serializedFields[2]).toHaveProperty('metadata');
    expect(serializedFields[3]).toHaveProperty('metadata');
  });
});
