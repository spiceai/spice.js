import { SpiceClient } from '@spiceai/spice';

export async function GET() {
  try {
    // Initialize SpiceClient with cloud URL (health endpoint is unauthenticated)
    // Use cloud URL since local runtime defaults to 127.0.0.1 which won't work in serverless
    const client = new SpiceClient({
      httpUrl: 'https://data.spiceai.io',
    });

    const isHealthy = await client.isSpiceHealthy();

    if (isHealthy) {
      return new Response('ok', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    } else {
      return new Response('Spice runtime is unhealthy', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  } catch (error) {
    console.error('Error checking Spice health:', error);
    return new Response(
      `Error checking Spice health: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
      {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      }
    );
  }
}
