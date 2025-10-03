# Cross-Platform Support (v3.1.0+)

The Spice.js SDK now fully supports both **Node.js server-side** and **browser client-side** environments!

## What Changed?

The package has been restructured to provide two separate builds:

### Node.js Build (Full Features)

- ✅ gRPC Flight protocol support (high performance)
- ✅ HTTP fallback
- ✅ All existing functionality

### Browser Build (HTTP Only)

- ✅ HTTP-based queries
- ✅ No Node.js dependencies
- ✅ Works in all modern browsers
- ⚠️ No gRPC support (automatically uses HTTP)

## Installation

```bash
npm install @spiceai/spice
# or
yarn add @spiceai/spice
```

The package automatically selects the right build for your environment!

## Usage

### Node.js (Server-Side)

```typescript
import { SpiceClient } from '@spiceai/spice';

// Automatically uses gRPC when available, falls back to HTTP
const client = new SpiceClient({
  httpUrl: 'http://localhost:8090',
  flightUrl: 'localhost:50051', // Optional: for gRPC
});

const result = await client.sql('SELECT * FROM my_table LIMIT 10');
console.log(result.toArray());
```

### Browser (Client-Side with Bundler)

```typescript
import { SpiceClient } from '@spiceai/spice';

// Automatically uses HTTP-only mode in browsers
const client = new SpiceClient({
  httpUrl: 'http://localhost:8090',
  // Note: flightUrl is ignored in browsers
});

const result = await client.sql('SELECT * FROM my_table LIMIT 10');
console.log(result.toArray());
```

### Browser (Native ES Modules)

```html
<script type="module">
  import { SpiceClient } from './node_modules/@spiceai/spice/dist/browser/index.browser.js';

  const client = new SpiceClient({
    httpUrl: 'http://localhost:8090',
  });

  const result = await client.sql('SELECT * FROM my_table');
  console.log(result.toArray());
</script>
```

## API Compatibility

The API is **100% compatible** across both environments. All methods work the same way:

### Query Methods

- `sql(query, onData?)` - Execute SQL queries
- `query(query, onData?)` - Alias for `sql()` (deprecated)
- `sqlJson(query)` - Get results as JSON

### Health & Status Methods

- `isSpiceHealthy()` - Check runtime health (unauthenticated)
- `isSpiceReady()` - Check if runtime is ready (authenticated)

### Other Methods

- `nsql(query, options?)` - Natural language queries
- `refreshAcceleration(dataset, options?)` - Trigger dataset refresh
- `setMaxRetries(n)` - Configure retry behavior

## Environment Detection

The package automatically detects your environment:

| Environment      | Build Used      | gRPC Support      |
| ---------------- | --------------- | ----------------- |
| Node.js          | `dist/node/`    | ✅ Yes            |
| Browser          | `dist/browser/` | ❌ No (HTTP only) |
| Webpack/Vite/etc | `dist/browser/` | ❌ No (HTTP only) |

## Migration Guide

### No Changes Required! 🎉

Existing Node.js code works without any modifications. The package is fully backward compatible.

### For New Browser Usage

Simply import and use the same API. The package handles everything automatically.

## Examples

Check out these example files:

- `examples/http-fallback.js` - Node.js with HTTP
- `examples/browser-example.html` - Browser with native modules
- `examples/browser-with-bundler.ts` - Browser with webpack/vite

## CORS Considerations for Browsers

When using the browser build, ensure your Spice instance has CORS properly configured:

```yaml
# spicepod.yaml
runtime:
  http:
    cors_enabled: true
    cors_allowed_origins:
      - 'http://localhost:3000' # Your frontend URL
```

## Build Details

The package uses conditional exports in `package.json`:

```json
{
  "main": "dist/node/index.node.js",
  "browser": "dist/browser/index.browser.js",
  "exports": {
    ".": {
      "node": "./dist/node/index.node.js",
      "browser": "./dist/browser/index.browser.js"
    }
  }
}
```

This allows bundlers and Node.js to automatically choose the correct build.

## TypeScript Support

Full TypeScript support is included for both environments:

- Node.js: `dist/node/index.node.d.ts`
- Browser: `dist/browser/index.browser.d.ts`

## Performance Considerations

### Node.js

- **gRPC (Flight)**: High performance, binary protocol
- **HTTP Fallback**: Used when gRPC unavailable

### Browser

- **HTTP Only**: Always uses HTTP endpoint
- **Streaming**: Supports streamed responses
- **Arrow Format**: Efficient data transfer

## Troubleshooting

### "gRPC is not supported in browser environments"

This is expected! The browser build only supports HTTP. Make sure you're configuring the `httpUrl` parameter.

### Bundler Issues

If you encounter issues with webpack/vite/etc:

```javascript
// webpack.config.js
module.exports = {
  resolve: {
    alias: {
      '@spiceai/spice': '@spiceai/spice/dist/browser/index.browser.js',
    },
  },
};
```

### TypeScript Errors

Make sure your `tsconfig.json` includes:

```json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "resolveJsonModule": true
  }
}
```

## Advanced: Manual Build Selection

If you need to manually select a build:

```javascript
// Force Node.js build
import { SpiceClient } from '@spiceai/spice/dist/node/index.node.js';

// Force browser build
import { SpiceClient } from '@spiceai/spice/dist/browser/index.browser.js';
```

## More Information

- [Cross-Platform Build Documentation](./docs/CROSS_PLATFORM_BUILD.md)
- [API Reference](./README.md)
- [GitHub Repository](https://github.com/spiceai/spice.js)

## Questions or Issues?

Please open an issue on [GitHub](https://github.com/spiceai/spice.js/issues)!
