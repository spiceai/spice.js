# Spice.js Vercel Test App

This is a minimal Next.js 15 application using the App Router for testing the Spice.js Node.js SDK on Vercel's serverless platform.

## Purpose

This test app validates that the Spice.js SDK works correctly on Vercel, particularly testing:

- HTTP fallback mechanism in serverless environments
- Proto file handling when bundled deployments don't include proto files
- Query execution and result serialization
- Next.js 15 App Router compatibility

## Setup

1. Install dependencies:

```bash
npm install
```

2. Set up environment variables (create `.env.local`):

```bash
SPICEAI_API_KEY=your_api_key_here
```

3. Run locally:

```bash
npm run dev
```

The app will be available at http://localhost:3000

## Architecture

This app uses **Next.js 15 App Router** with TypeScript:

- `app/layout.tsx` - Root layout
- `app/page.tsx` - Home page (client component)
- `app/api/v1/sql/route.ts` - API route handler (server-side)

## API Endpoint

### POST /api/v1/sql

Execute a SQL query using the Spice.js SDK with **streaming results**.

**Headers:**

```
Content-Type: application/json
X-SPICE-API-KEY: your-api-key (optional if set in environment)
```

**Request Body:**

```json
{
  "sql": "SELECT 1 as test"
}
```

**Response:** Streaming NDJSON (newline-delimited JSON)

```
Content-Type: application/x-ndjson
```

The response streams multiple JSON objects, one per line:

1. **Initial message:**

```json
{ "success": true, "streaming": true, "startTime": 1234567890 }
```

2. **Row messages** (one per row as data arrives):

```json
{"type":"row","data":{"test":"1"}}
{"type":"row","data":{"test":"2"}}
```

3. **Completion message:**

```json
{ "type": "complete", "metadata": { "rowCount": 2, "executionTime": 123 } }
```

Or **Error message** if query fails:

```json
{
  "type": "error",
  "error": "Query failed",
  "metadata": { "executionTime": 123 }
}
```

## Testing on Vercel

1. Deploy to Vercel:

```bash
vercel
```

2. Set the `SPICEAI_API_KEY` environment variable in your Vercel project settings

3. Test the endpoint:

```bash
curl -X POST https://your-app.vercel.app/api/v1/sql \
  -H "Content-Type: application/json" \
  -H "X-SPICE-API-KEY: your-api-key" \
  -d '{"sql": "SELECT 1 as test"}'
```

## Testing

### UI Testing

The home page provides a simple UI to test queries:

1. Open the deployed app in your browser
2. Enter your API key (optional if set in environment)
3. Enter a SQL query
4. Click "Execute Query"
5. View the results (streaming in real-time)

### Automated Testing

Run the cloud tests against your Vercel deployment:

```bash
# From the root of spice.js repository
SPICEAI_API_KEY=your-api-key VERCEL_ENDPOINT=https://your-app.vercel.app npm test -- cloud.test.ts
```

This will run tests against:

- Direct Spice.ai endpoints (Flight + HTTP)
- Your Vercel deployment (streaming endpoint)

Skip Vercel tests by not setting `VERCEL_ENDPOINT`:

```bash
SPICEAI_API_KEY=your-api-key npm test -- cloud.test.ts
```

## Expected Behavior

When deployed to Vercel:

- The SDK should automatically detect that proto files are not available
- It will attempt to download the proto file from https://data.spiceai.io/v1/proto/flight
- If proto download fails or gRPC is not available, it falls back to HTTP endpoint
- Queries execute successfully using the HTTP fallback mechanism
- Results are returned in the same format regardless of protocol used

## Example Queries

```sql
-- Simple test
SELECT 1 as test

-- Multiple columns with different types
SELECT 'hello' as message, 123 as number, true as flag

-- Current time
SELECT NOW() as current_time

-- String operations
SELECT UPPER('vercel') as platform, LOWER('SPICE') as sdk
```

## Notes

- BigInt values are automatically converted to strings for JSON serialization
- The SDK handles compression negotiation automatically
- HTTP fallback is transparent to the application code
