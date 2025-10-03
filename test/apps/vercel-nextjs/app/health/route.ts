import { SpiceClient } from '@spiceai/spice';

export async function GET() {
  try {
    // Initialize SpiceClient without API key (health endpoint is unauthenticated)
    const client = new SpiceClient();

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
