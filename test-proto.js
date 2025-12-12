const { encodeCreatePreparedStatementRequest } = require('./dist/node/adbc/client');

const encoded = encodeCreatePreparedStatementRequest('SELECT 1');
console.log('Encoded length:', encoded.length);
console.log('Encoded hex:', encoded.toString('hex'));
console.log('Encoded bytes:', [...encoded]);
