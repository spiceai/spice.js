import { SpiceClient } from '@spiceai/spice';
import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { sql } = body;

    if (!sql) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required field: sql',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // Use API key from X-SPICE-API-KEY header or environment variable
    const apiKey = request.headers.get('X-SPICE-API-KEY');
    const key = apiKey || process.env.SPICEAI_API_KEY;

    if (!key) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            'Missing API key. Provide X-SPICE-API-KEY header or set SPICEAI_API_KEY environment variable.',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // Initialize SpiceClient
    const client = new SpiceClient(key);

    // Create a streaming response
    const encoder = new TextEncoder();
    let totalRows = 0;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial metadata
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                success: true,
                streaming: true,
                startTime: Date.now(),
              }) + '\n',
            ),
          );

          // Execute query with streaming callback
          await client.query(sql, (table) => {
            // Convert each chunk's rows
            const resultArray = table.toArray();

            resultArray.forEach((row: any) => {
              const plainRow: any = {};
              for (const key in row) {
                const value = row[key];
                // Convert BigInt to string for JSON serialization
                plainRow[key] =
                  typeof value === 'bigint' ? value.toString() : value;
              }

              // Stream each row as a separate JSON line
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({ type: 'row', data: plainRow }) + '\n',
                ),
              );
              totalRows++;
            });
          });

          // Send final metadata
          const executionTime = Date.now() - startTime;
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'complete',
                metadata: {
                  rowCount: totalRows,
                  executionTime,
                },
              }) + '\n',
            ),
          );

          controller.close();
        } catch (error) {
          // Send error as final message
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'error',
                error: error instanceof Error ? error.message : 'Unknown error',
                metadata: {
                  executionTime: Date.now() - startTime,
                },
              }) + '\n',
            ),
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          executionTime: Date.now() - startTime,
        },
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
