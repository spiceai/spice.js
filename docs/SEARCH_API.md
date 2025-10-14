# Hybrid Search API

The Spice.js client supports hybrid search operations through the `.search()` method.

## Overview

Hybrid search combines multiple search techniques to find the most relevant matches in your datasets:

- **Vector Similarity Search (VSS)**: Semantic matching using embeddings and cosine similarity
- **Keyword/Fulltext Search**: Exact and fuzzy text matching with BM25 scoring
- **Metadata Filtering**: SQL WHERE conditions for precise filtering

This powerful combination allows you to leverage semantic understanding, keyword matching, and structured filtering in a single query. Datasets should have embedding columns configured for vector similarity search, along with the appropriate embedding model loaded in your Spice runtime.

## API Reference

### `client.search(query: string, options?: SearchOptions): Promise<SearchResponse>`

Performs a hybrid search operation on one or more datasets.

#### Parameters

**`query`** (`string`, required): The search query text for semantic and keyword matching

**`options`** (`SearchOptions`, optional): Additional search configuration

| Property             | Type                 | Required | Description                                                                                                           |
| -------------------- | -------------------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| `datasets`           | `string[]` \| `null` | No       | The datasets to search. If `null` or omitted, searches across all available datasets                                  |
| `limit`              | `number` \| `null`   | No       | Maximum number of documents to return for each dataset                                                                |
| `additional_columns` | `string[]`           | No       | Additional columns to return from the dataset. Primary key columns will be returned under `.primary_key`, not `.data` |
| `where`              | `string` \| `null`   | No       | SQL filter predicate to apply (format: `'WHERE condition'`)                                                           |
| `keywords`           | `string[]` \| `null` | No       | Additional keywords to include for keyword/fulltext matching                                                          |

#### Returns

**`Promise<SearchResponse>`**: Search results with the following structure:

```typescript
interface SearchResponse {
  duration_ms: number; // Total search execution time in milliseconds
  results: SearchMatch[]; // Array of matching results
}

interface SearchMatch {
  dataset: string; // Name of the dataset where match was found
  score: number; // Similarity score (0-1, higher is better)
  matches: { [key: string]: any }; // The matched content
  primary_key: { [key: string]: any }; // Primary key(s) of the matched item
  data: { [key: string]: any }; // Additional data columns requested
  metadata: { [key: string]: any }; // Metadata associated with the match
}
```

## Usage Examples

### Basic Search

```typescript
import { SpiceClient } from '@spiceai/spice';

const client = new SpiceClient({
  apiKey: 'your-api-key',
  httpUrl: 'http://localhost:8090',
});

const results = await client.search('machine learning algorithms', {
  datasets: ['documents'],
  limit: 5,
});

console.log(
  `Found ${results.results.length} matches in ${results.duration_ms}ms`,
);
results.results.forEach((match) => {
  console.log(`${match.dataset}: ${match.score.toFixed(4)}`);
});
```

### Search with Additional Columns

Request specific columns to be returned with each match:

```typescript
const results = await client.search('artificial intelligence', {
  datasets: ['research_papers'],
  additional_columns: ['title', 'author', 'published_date', 'abstract'],
  limit: 10,
});

results.results.forEach((match) => {
  console.log(`Title: ${match.data.title}`);
  console.log(`Author: ${match.data.author}`);
  console.log(`Score: ${match.score}`);
});
```

### Search with SQL Filter

Apply SQL predicates to filter results:

```typescript
const results = await client.search('climate change research', {
  datasets: ['scientific_articles'],
  where: "published_date >= '2024-01-01' AND category = 'environment'",
  limit: 20,
});
```

### Search Across All Datasets

Search all available datasets by setting `datasets` to `null`:

```typescript
const results = await client.search('renewable energy', {
  datasets: null, // Search all datasets
  limit: 10,
});

// Group results by dataset
const byDataset = results.results.reduce((acc, match) => {
  if (!acc[match.dataset]) acc[match.dataset] = [];
  acc[match.dataset].push(match);
  return acc;
}, {});

console.log('Results by dataset:', Object.keys(byDataset));
```

### Search with Keywords

Include additional keywords to refine the search:

```typescript
const results = await client.search('neural networks', {
  keywords: ['deep learning', 'AI', 'machine learning'],
  datasets: ['tech_articles'],
  limit: 15,
});
```

## Error Handling

The search method throws errors in the following cases:

```typescript
try {
  const results = await client.search('search query', {
    datasets: ['my_dataset'],
  });
} catch (error) {
  if (error.message.includes('HTTP URL is required')) {
    console.error('Client not configured with HTTP endpoint');
  } else if (error.message.includes('query parameter is required')) {
    console.error('Search query is required');
  } else if (error.message.includes('Search request failed')) {
    console.error('Server error:', error.message);
  }
}
```

## Requirements

- **HTTP Endpoint**: The search operation requires an HTTP URL to be configured in the SpiceClient
- **Embedding Columns**: Datasets must have embedding columns configured
- **Embedding Model**: Appropriate embedding model must be loaded in Spice runtime
- **Search Capability**: Datasets must have `can_search_documents` enabled

## Response Format

The search response includes:

1. **`duration_ms`**: Time taken to execute the search
2. **`results`**: Array of matches, where each match contains:
   - **`dataset`**: The source dataset name
   - **`score`**: Cosine similarity score (0-1, higher means more similar)
   - **`matches`**: The matched content/text
   - **`primary_key`**: Primary key value(s) identifying the record
   - **`data`**: Additional columns (from `additional_columns` parameter)
   - **`metadata`**: Associated metadata

## TypeScript Support

Full TypeScript type definitions are included:

```typescript
import {
  SpiceClient,
  SearchOptions,
  SearchResponse,
  SearchMatch,
} from '@spiceai/spice';
```

All types are fully documented with JSDoc comments for IDE autocompletion and inline documentation.
