# Spice.js Test Applications

This directory contains test applications for validating the Spice.js SDK in different deployment environments.

## Applications

### vercel-nextjs

A minimal Next.js application for testing the Spice.js SDK on Vercel's serverless platform.

**Purpose:** Validate HTTP fallback mechanism in serverless environments where proto files may not be available.

**Key Features:**

- Simple API endpoint (`/api/query`) that uses the Spice.js SDK
- Web UI for interactive testing
- Automatic HTTP fallback when gRPC is unavailable
- Handles BigInt serialization for JSON responses

**Setup & Deployment:**

See [vercel-nextjs/README.md](./vercel-nextjs/README.md) for detailed instructions.

Quick start:

```bash
cd vercel-nextjs
npm install
npm run dev
```

Deploy to Vercel:

```bash
cd vercel-nextjs
vercel
```

## Testing Checklist

When testing in each environment, verify:

- ✅ SDK initializes successfully
- ✅ Queries execute without errors
- ✅ Results are returned in correct format
- ✅ HTTP fallback activates when proto files are unavailable
- ✅ Compression is negotiated properly
- ✅ Different data types (string, number, boolean, null) are handled
- ✅ Error handling works correctly

## Future Test Apps

Consider adding test apps for:

- AWS Lambda (serverless function)
- Cloudflare Workers (edge runtime)
- Netlify Functions
- Google Cloud Functions
- Azure Functions

## Contributing

When adding a new test app:

1. Create a new directory under `test/apps/`
2. Include a comprehensive README.md
3. Add example queries and expected results
4. Document any platform-specific considerations
5. Update this README with the new app information
