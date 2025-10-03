import { SpiceClient } from '@spiceai/spice';

export async function GET() {
  console.log('[Vercel /health] Health endpoint called');
  try {
    // Initialize SpiceClient with cloud URL (health endpoint is unauthenticated)
    // Use cloud URL since local runtime defaults to 127.0.0.1 which won't work in serverless
    console.log(
      '[Vercel /health] Initializing SpiceClient with httpUrl: https://data.spiceai.io',
    );
    const client = new SpiceClient({
      httpUrl: 'https://data.spiceai.io',
    });

    console.log('[Vercel /health] Calling client.isSpiceHealthy()...');
    const isHealthy = await client.isSpiceHealthy();
    console.log('[Vercel /health] isSpiceHealthy result:', isHealthy);

    if (isHealthy) {
      console.log('[Vercel /health] Returning 200 OK');
      return new Response('ok', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    } else {
      console.log('[Vercel /health] Returning 503 unhealthy');
      return new Response('Spice runtime is unhealthy', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  } catch (error) {
    console.error('[Vercel /health] Error checking Spice health:', error);
    return new Response(
      `Error checking Spice health: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
      {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      },
    );
  }
}
