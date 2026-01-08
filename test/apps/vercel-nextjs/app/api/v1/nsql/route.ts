import { SpiceClient } from '@spiceai/spice';
import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Accept plain text natural language query
    const query = await request.text();

    if (!query || query.trim().length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing natural language query in request body',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // Get API key from header or environment variable
    const apiKey = request.headers.get('X-API-KEY');
    const key = apiKey || process.env.SPICEAI_API_KEY;

    if (!key) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            'Missing API key. Provide X-API-KEY header or set SPICEAI_API_KEY environment variable.',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // Initialize SpiceClient
    const client = new SpiceClient(key);

    try {
      const result = await client.nsql(query);

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      const errorCode = (error as any)?.code;
      const errorDetails = (error as any)?.details;

      // Handle authentication/authorization errors
      if (
        errorCode === 7 ||
        errorCode === 16 ||
        errorDetails === 'permission denied'
      ) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              'Invalid or unauthorized API key. Please verify your API key has access to the requested resource.',
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      // Handle other errors
      return new Response(
        JSON.stringify({
          success: false,
          error:
            error instanceof Error ? error.message : 'Query execution failed',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
