// Test: Try sending the raw inner message without Any wrapper

function encodeVarint(value) {
  const bytes = [];
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value);
  return Buffer.from(bytes);
}

function encodeCreatePreparedStatementRequestRaw(query) {
  // ActionCreatePreparedStatementRequest has:
  // Field 1: query (string)
  const queryBytes = Buffer.from(query, 'utf8');
  const queryLengthVarint = encodeVarint(queryBytes.length);
  const fieldTag = Buffer.from([0x0a]); // (1 << 3) | 2 = 10
  return Buffer.concat([fieldTag, queryLengthVarint, queryBytes]);
}

const rawMsg = encodeCreatePreparedStatementRequestRaw('SELECT 1');
console.log('Raw message (no Any wrapper):');
console.log('Length:', rawMsg.length);
console.log('Hex:', rawMsg.toString('hex'));
console.log('Bytes:', [...rawMsg]);

// Now try the Any wrapper version
const { encodeCreatePreparedStatementRequest } = require('./dist/node/adbc/client');
const wrappedMsg = encodeCreatePreparedStatementRequest('SELECT 1');
console.log('\nAny-wrapped message:');
console.log('Length:', wrappedMsg.length);
console.log('Hex:', wrappedMsg.toString('hex'));
console.log('Bytes:', [...wrappedMsg]);

// Let's also decode the Any to verify structure
function decodeAny(data) {
  let offset = 0;
  let typeUrl, value;
  
  while (offset < data.length) {
    const tag = data[offset];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;
    offset++;
    
    if (wireType === 2) {
      // Read varint length
      let length = 0, shift = 0;
      while (data[offset] & 0x80) {
        length |= (data[offset] & 0x7f) << shift;
        shift += 7;
        offset++;
      }
      length |= data[offset] << shift;
      offset++;
      
      const fieldValue = data.slice(offset, offset + length);
      offset += length;
      
      if (fieldNumber === 1) {
        typeUrl = fieldValue.toString('utf8');
      } else if (fieldNumber === 2) {
        value = fieldValue;
      }
    }
  }
  
  return { typeUrl, value };
}

console.log('\nDecoded Any:');
const decoded = decodeAny(wrappedMsg);
console.log('typeUrl:', decoded.typeUrl);
console.log('value hex:', decoded.value ? decoded.value.toString('hex') : 'null');
console.log('value bytes:', decoded.value ? [...decoded.value] : []);
