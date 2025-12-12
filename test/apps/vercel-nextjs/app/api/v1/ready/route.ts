import { SpiceClient } from '@spiceai/spice';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Use API key from X-API-KEY header or environment variable
    const apiKey = request.headers.get('X-API-KEY');
    const key = apiKey || process.env.SPICEAI_API_KEY;

    // Initialize SpiceClient
    const client = new SpiceClient(key);

    const isReady = await client.isSpiceReady();

    if (isReady) {
      return new Response('ready', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    } else {
      return new Response('Spice runtime is not ready', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  } catch (error) {
    return new Response(
      `Error checking Spice readiness: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
      {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      },
    );
  }
}
