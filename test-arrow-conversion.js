const { SpiceClient } = require('./dist/node/index.js');

const client = new SpiceClient({
  httpUrl: 'https://data.spiceai.io',
  apiKey: process.env.SPICEAI_API_KEY || 'test'
});

async function test() {
  try {
    const query = 'SELECT * FROM pulls LIMIT 1';
    
    console.log('Testing .sql() method:');
    const sqlResult = await client.sql(query);
    const sqlRows = sqlResult.toArray();
    
    console.log('\nChecking specific fields:');
    const row = sqlRows[0];
    console.log(`hashes type: ${typeof row.hashes}, isArray: ${Array.isArray(row.hashes)}`);
    console.log(`hashes value: ${JSON.stringify(row.hashes)}`);
    console.log(`hashes constructor: ${row.hashes?.constructor?.name}`);
    if (row.hashes && typeof row.hashes.toArray === 'function') {
      console.log(`hashes.toArray(): ${JSON.stringify(row.hashes.toArray())}`);
    }
    
    console.log(`\nreview_comments type: ${typeof row.review_comments}, isArray: ${Array.isArray(row.review_comments)}`);
    console.log(`review_comments value: ${JSON.stringify(row.review_comments)}`);
    console.log(`review_comments constructor: ${row.review_comments?.constructor?.name}`);
    if (row.review_comments && typeof row.review_comments.toArray === 'function') {
      console.log(`review_comments.toArray(): ${JSON.stringify(row.review_comments.toArray()).substring(0, 200)}`);
    }
    
    console.log(`\nchanged_files type: ${typeof row.changed_files}`);
    console.log(`changed_files value: ${JSON.stringify(row.changed_files)}`);
    
    console.log(`\nclosed_at type: ${typeof row.closed_at}`);
    console.log(`closed_at value: ${JSON.stringify(row.closed_at)}`);
    
    console.log('\nTesting .sqlJson() method:');
    const jsonResult = await client.sqlJson(query);
    const jsonRow = jsonResult.data[0];
    console.log(`\nJSON hashes: ${JSON.stringify(jsonRow.hashes)}`);
    console.log(`JSON review_comments: ${JSON.stringify(jsonRow.review_comments).substring(0, 200)}`);
    console.log(`JSON changed_files: ${JSON.stringify(jsonRow.changed_files)}`);
    console.log(`JSON closed_at: ${JSON.stringify(jsonRow.closed_at)}`);
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

test();
