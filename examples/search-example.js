/**
 * Example usage of the search() function
 *
 * This example demonstrates how to perform vector similarity search
 * on datasets with embedding columns.
 */

const { SpiceClient } = require('@spiceai/spice');

async function main() {
  // Initialize the Spice client
  const client = new SpiceClient({
    apiKey: process.env.SPICEAI_API_KEY || 'your-api-key',
    httpUrl: process.env.SPICE_HTTP_URL || 'http://localhost:8090',
  });

  try {
    // Basic search example
    console.log('Running basic search...');
    const result1 = await client.search('machine learning algorithms', {
      datasets: ['daily_journal', 'articles'],
      limit: 5,
    });

    console.log(`Search completed in ${result1.duration_ms}ms`);
    console.log(`Found ${result1.results.length} results`);

    result1.results.forEach((match, index) => {
      console.log(
        `\n[${index + 1}] Dataset: ${match.dataset}, Score: ${match.score}`,
      );
      console.log('  Matches:', match.matches);
      console.log('  Primary Key:', match.primary_key);
      if (Object.keys(match.data).length > 0) {
        console.log('  Data:', match.data);
      }
    });

    // Search with additional columns
    console.log('\n\nRunning search with additional columns...');
    const result2 = await client.search('artificial intelligence', {
      additional_columns: ['title', 'author', 'published_date'],
      limit: 3,
    });

    console.log(`Search completed in ${result2.duration_ms}ms`);
    console.log(`Found ${result2.results.length} results`);

    // Search with WHERE filter
    console.log('\n\nRunning search with WHERE filter...');
    const result3 = await client.search('data science', {
      datasets: ['documents'],
      where: "published_date >= '2024-01-01'",
      limit: 10,
    });

    console.log(`Search completed in ${result3.duration_ms}ms`);
    console.log(`Found ${result3.results.length} results`);

    // Search with keywords
    console.log('\n\nRunning search with keywords...');
    const result4 = await client.search('neural networks', {
      keywords: ['deep learning', 'AI'],
      limit: 5,
    });

    console.log(`Search completed in ${result4.duration_ms}ms`);
    console.log(`Found ${result4.results.length} results`);
  } catch (error) {
    console.error('Error performing search:', error.message);
  }
}

main();
