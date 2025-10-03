import { SpiceClient } from '@spiceai/spice';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  console.log('[Vercel /v1/ready] Ready endpoint called');
  try {
    // Use API key from X-API-KEY header or environment variable
    const apiKey = request.headers.get('X-API-KEY');
    const key = apiKey || process.env.SPICEAI_API_KEY;
    console.log(
      '[Vercel /v1/ready] Using API key:',
      key ? `${key.substring(0, 10)}...` : 'none',
    );

    // Initialize SpiceClient
    console.log('[Vercel /v1/ready] Initializing SpiceClient');
    const client = new SpiceClient(key);

    console.log('[Vercel /v1/ready] Calling client.isSpiceReady()...');
    const isReady = await client.isSpiceReady();
    console.log('[Vercel /v1/ready] isSpiceReady result:', isReady);

    if (isReady) {
      console.log('[Vercel /v1/ready] Returning 200 ready');
      return new Response('ready', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    } else {
      console.log('[Vercel /v1/ready] Returning 503 not ready');
      return new Response('Spice runtime is not ready', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  } catch (error) {
    console.error('[Vercel /v1/ready] Error checking Spice readiness:', error);
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
