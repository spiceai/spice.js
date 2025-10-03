import { SpiceClient } from '@spiceai/spice';
import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Accept plain text SQL query
    const sql = await request.text();
    console.log('[SQL API] Received SQL query:', sql);

    if (!sql || sql.trim().length === 0) {
      console.error('[SQL API] Error: Empty SQL query received');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing SQL query in request body',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // Use API key from X-API-KEY header or environment variable
    const apiKey = request.headers.get('X-API-KEY');
    const key = apiKey || process.env.SPICEAI_API_KEY;

    console.log(
      '[SQL API] API key source:',
      apiKey ? 'X-API-KEY header' : 'SPICEAI_API_KEY env var',
    );
    console.log('[SQL API] API key present:', !!key);
    console.log(
      '[SQL API] API key format:',
      key ? `${key.substring(0, 10)}...` : 'N/A',
    );

    if (!key) {
      console.error('[SQL API] Error: Missing API key');
      return new Response(
        JSON.stringify({
          success: false,
          error:
            'Missing API key. Provide X-API-KEY header or set SPICEAI_API_KEY environment variable.',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    console.log('[SQL API] Initializing SpiceClient...');
    // Initialize SpiceClient
    const client = new SpiceClient(key);
    console.log('[SQL API] SpiceClient initialized successfully');

    // Create a streaming response
    const encoder = new TextEncoder();
    let totalRows = 0;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          console.log('[SQL API] Starting query execution...');
          console.log(
            '[SQL API] Query:',
            sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
          );
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
            console.log(
              '[SQL API] Received table chunk, numRows:',
              table.numRows,
            );
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
          console.log(
            '[SQL API] Query completed successfully. Total rows:',
            totalRows,
            'Execution time:',
            executionTime,
            'ms',
          );
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
          console.error('[SQL API] Error during query execution:', error);
          console.error(
            '[SQL API] Error stack:',
            error instanceof Error ? error.stack : 'No stack trace',
          );
          console.error('[SQL API] Error code:', (error as any)?.code);
          console.error('[SQL API] Error details:', (error as any)?.details);
          console.error('[SQL API] Error metadata:', (error as any)?.metadata);
          // Send error as final message
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'error',
                error: error instanceof Error ? error.message : 'Unknown error',
                code: (error as any)?.code,
                details: (error as any)?.details,
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
    console.error('[SQL API] Unexpected error:', error);
    console.error(
      '[SQL API] Error stack:',
      error instanceof Error ? error.stack : 'No stack trace',
    );
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
