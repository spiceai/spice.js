'use client';

import { SpiceClient } from '@spiceai/spice';
import Link from 'next/link';
import { useState, useMemo } from 'react';
import * as Diff from 'diff';

// Beautiful Inline Diff Viewer Component with line-by-line comparison
function DiffViewer({
  proxyResult,
  directResult,
  title,
}: {
  proxyResult: any;
  directResult: any;
  title?: string;
}) {
  const proxyJson = JSON.stringify(proxyResult, null, 2);
  const directJson = JSON.stringify(directResult, null, 2);
  const isMatch = proxyJson === directJson;

  // Compute line-by-line diff
  const diffLines = Diff.diffLines(proxyJson, directJson);

  return (
    <div
      style={{
        marginTop: '15px',
        border: '1px solid #ddd',
        borderRadius: '5px',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}
    >
      {title && (
        <div
          style={{
            background: '#f5f5f5',
            padding: '10px 15px',
            borderBottom: '1px solid #ddd',
            fontWeight: '600',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{title}</span>
          <span
            style={{
              padding: '4px 12px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: '600',
              background: isMatch ? '#d1fae5' : '#fee2e2',
              color: isMatch ? '#065f46' : '#991b1b',
            }}
          >
            {isMatch ? '✓ Identical' : '✗ Differences Found'}
          </span>
        </div>
      )}

      {isMatch ? (
        // Show single view when results match
        <div style={{ background: '#f9fafb' }}>
          <div
            style={{
              background: '#d1fae5',
              padding: '8px 15px',
              fontSize: '12px',
              fontWeight: '600',
              color: '#065f46',
              borderBottom: '1px solid #a7f3d0',
            }}
          >
            ✓ Both endpoints return identical results
          </div>
          <pre
            style={{
              margin: 0,
              padding: '15px',
              fontSize: '12px',
              maxHeight: '400px',
              overflow: 'auto',
              fontFamily:
                "'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace",
              lineHeight: '1.5',
              background: '#fff',
            }}
          >
            {proxyJson}
          </pre>
        </div>
      ) : (
        // Show line-by-line diff when results differ
        <div
          style={{ background: '#fff', maxHeight: '400px', overflow: 'auto' }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '40px 1fr',
              fontSize: '12px',
              fontFamily:
                "'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace",
              lineHeight: '1.5',
            }}
          >
            {diffLines.map((part, index) => {
              const lines = part.value.split('\n');
              // Remove last empty line if present
              if (lines[lines.length - 1] === '') {
                lines.pop();
              }

              return lines.map((line, lineIndex) => {
                let background = '#fff';
                let color = '#333';
                let marker = ' ';
                let borderLeft = 'none';

                if (part.added) {
                  background = '#e6ffed';
                  color = '#24292e';
                  marker = '+';
                  borderLeft = '3px solid #28a745';
                } else if (part.removed) {
                  background = '#ffeef0';
                  color = '#24292e';
                  marker = '-';
                  borderLeft = '3px solid #d73a49';
                }

                return (
                  <div
                    key={`${index}-${lineIndex}`}
                    style={{
                      display: 'contents',
                    }}
                  >
                    <div
                      style={{
                        background,
                        color: part.added
                          ? '#28a745'
                          : part.removed
                            ? '#d73a49'
                            : '#666',
                        padding: '2px 8px',
                        textAlign: 'center',
                        fontWeight: '600',
                        borderLeft,
                        userSelect: 'none',
                      }}
                    >
                      {marker}
                    </div>
                    <div
                      style={{
                        background,
                        color,
                        padding: '2px 12px',
                        borderLeft:
                          part.added || part.removed
                            ? 'none'
                            : '1px solid #e1e4e8',
                        whiteSpace: 'pre',
                        overflowX: 'auto',
                      }}
                    >
                      {line || ' '}
                    </div>
                  </div>
                );
              });
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TestPage() {
  const [apiKey, setApiKey] = useState<string>(
    process.env.NEXT_PUBLIC_SPICE_API_KEY || '',
  );
  const [healthStatus, setHealthStatus] = useState<string>('Not checked');
  const [readyStatus, setReadyStatus] = useState<string>('Not checked');
  const [refreshProxyResult, setRefreshProxyResult] = useState<any>(null);
  const [refreshDirectResult, setRefreshDirectResult] = useState<any>(null);
  const [customQuery, setCustomQuery] = useState<string>(
    'SELECT 1 as num, 2 as value',
  );
  const [queryProxyResult, setQueryProxyResult] = useState<any>(null);
  const [queryDirectResult, setQueryDirectResult] = useState<any>(null);
  const [useJsonFormat, setUseJsonFormat] = useState<boolean>(false);
  const [nsqlQuery, setNsqlQuery] = useState<string>(
    'Show me the first 5 rows',
  );
  const [nsqlProxyResult, setNsqlProxyResult] = useState<any>(null);
  const [nsqlDirectResult, setNsqlDirectResult] = useState<any>(null);

  // Separate loading states for each action
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [loadingReady, setLoadingReady] = useState(false);
  const [loadingRefresh, setLoadingRefresh] = useState(false);
  const [loadingQuery, setLoadingQuery] = useState(false);
  const [loadingNsql, setLoadingNsql] = useState(false);

  const [error, setError] = useState<string>('');

  // Initialize SpiceClient instances for both endpoints
  const proxyClient = useMemo(
    () =>
      new SpiceClient({
        httpUrl: '/api',
        apiKey: apiKey || undefined,
      }),
    [apiKey],
  );

  const directClient = useMemo(
    () =>
      new SpiceClient({
        httpUrl: 'https://data.spiceai.io',
        apiKey: apiKey || undefined,
      }),
    [apiKey],
  );

  // Helper function to extract detailed error information
  const getErrorDetails = (
    err: unknown,
    context: string,
    endpoint?: string,
  ): string => {
    const details: string[] = [`❌ ${context} failed\n`];

    if (err instanceof Error) {
      details.push(`Error: ${err.message}`);

      if (err.stack) {
        details.push(`\nStack trace:\n${err.stack}`);
      }

      // Check for fetch/network errors
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        details.push(
          '\n⚠️ Network error - check your connection and endpoint URL',
        );
      }
    } else if (typeof err === 'object' && err !== null) {
      details.push(`Error object: ${JSON.stringify(err, null, 2)}`);
    } else {
      details.push(`Unknown error: ${String(err)}`);
    }

    // Add environment info
    details.push(`\n📍 Environment:`);
    details.push(`  • Browser: ${navigator.userAgent}`);
    if (endpoint) {
      details.push(`  • Endpoint: ${endpoint}`);
    }
    details.push(`  • API Key: ${apiKey ? '✓ Configured' : '✗ Not set'}`);
    details.push(`  • Timestamp: ${new Date().toISOString()}`);

    return details.join('\n');
  };

  const checkHealth = async () => {
    setLoadingHealth(true);
    setError('');
    try {
      // Call both endpoints in parallel
      const [proxyResult, directResult] = await Promise.allSettled([
        proxyClient.isSpiceHealthy(),
        directClient.isSpiceHealthy(),
      ]);

      const proxyHealthy =
        proxyResult.status === 'fulfilled' && proxyResult.value;
      const directHealthy =
        directResult.status === 'fulfilled' && directResult.value;

      const comparison = [
        `Proxy (/api): ${proxyHealthy ? '✅ Healthy' : '❌ Not Healthy'}`,
        `Direct (data.spiceai.io): ${directHealthy ? '✅ Healthy' : '❌ Not Healthy'}`,
        `Match: ${proxyHealthy === directHealthy ? '✅' : '❌'}`,
      ];

      if (proxyResult.status === 'rejected') {
        comparison.push(`\nProxy Error: ${proxyResult.reason}`);
      }
      if (directResult.status === 'rejected') {
        comparison.push(`\nDirect Error: ${directResult.reason}`);
      }

      setHealthStatus(comparison.join('\n'));
    } catch (err) {
      const errorDetails = getErrorDetails(err, 'Health check');
      setError(errorDetails);
      setHealthStatus('❌ Error');
    } finally {
      setLoadingHealth(false);
    }
  };

  const checkReady = async () => {
    setLoadingReady(true);
    setError('');
    try {
      // Call both endpoints in parallel
      const [proxyResult, directResult] = await Promise.allSettled([
        proxyClient.isSpiceReady(),
        directClient.isSpiceReady(),
      ]);

      const proxyReady =
        proxyResult.status === 'fulfilled' && proxyResult.value;
      const directReady =
        directResult.status === 'fulfilled' && directResult.value;

      const comparison = [
        `Proxy (/api): ${proxyReady ? '✅ Ready' : '❌ Not Ready'}`,
        `Direct (data.spiceai.io): ${directReady ? '✅ Ready' : '❌ Not Ready'}`,
        `Match: ${proxyReady === directReady ? '✅' : '❌'}`,
      ];

      if (proxyResult.status === 'rejected') {
        comparison.push(`\nProxy Error: ${proxyResult.reason}`);
      }
      if (directResult.status === 'rejected') {
        comparison.push(`\nDirect Error: ${directResult.reason}`);
      }

      setReadyStatus(comparison.join('\n'));
    } catch (err) {
      const errorDetails = getErrorDetails(err, 'Ready check');
      setError(errorDetails);
      setReadyStatus('❌ Error');
    } finally {
      setLoadingReady(false);
    }
  };

  const runRefresh = async () => {
    setLoadingRefresh(true);
    setError('');
    setRefreshProxyResult(null);
    setRefreshDirectResult(null);
    try {
      // Call both endpoints in parallel
      const [proxyResult, directResult] = await Promise.allSettled([
        proxyClient.refreshAcceleration('eth.recent_blocks'),
        directClient.refreshAcceleration('eth.recent_blocks'),
      ]);

      setRefreshProxyResult(
        proxyResult.status === 'fulfilled'
          ? proxyResult.value
          : { error: proxyResult.reason?.toString() },
      );
      setRefreshDirectResult(
        directResult.status === 'fulfilled'
          ? directResult.value
          : { error: directResult.reason?.toString() },
      );
    } catch (err) {
      const errorDetails = getErrorDetails(
        err,
        'Dataset refresh (eth.recent_blocks)',
      );
      setError(errorDetails);
      setRefreshProxyResult(null);
      setRefreshDirectResult(null);
    } finally {
      setLoadingRefresh(false);
    }
  };

  const runCustomQuery = async () => {
    setLoadingQuery(true);
    setError('');
    setQueryProxyResult(null);
    setQueryDirectResult(null);
    try {
      if (useJsonFormat) {
        // Use sqlJson() for JSON format with metadata
        const [proxyResult, directResult] = await Promise.allSettled([
          proxyClient.sqlJson(customQuery),
          directClient.sqlJson(customQuery),
        ]);

        setQueryProxyResult(
          proxyResult.status === 'fulfilled'
            ? proxyResult.value
            : { error: proxyResult.reason?.toString() },
        );
        setQueryDirectResult(
          directResult.status === 'fulfilled'
            ? directResult.value
            : { error: directResult.reason?.toString() },
        );
      } else {
        // Use sql() for Arrow Table format
        const [proxyResult, directResult] = await Promise.allSettled([
          proxyClient.sql(customQuery),
          directClient.sql(customQuery),
        ]);

        const proxyRows =
          proxyResult.status === 'fulfilled'
            ? proxyResult.value.toArray()
            : null;
        const directRows =
          directResult.status === 'fulfilled'
            ? directResult.value.toArray()
            : null;

        setQueryProxyResult(
          proxyRows || {
            error:
              proxyResult.status === 'rejected'
                ? proxyResult.reason?.toString()
                : 'No data',
          },
        );
        setQueryDirectResult(
          directRows || {
            error:
              directResult.status === 'rejected'
                ? directResult.reason?.toString()
                : 'No data',
          },
        );
      }
    } catch (err) {
      const method = useJsonFormat ? 'sqlJson' : 'sql';
      const errorDetails = getErrorDetails(err, `Custom query (${method})`);
      // Add query context to error
      const fullError = `Query: ${customQuery}\n\n${errorDetails}`;
      setError(fullError);
      setQueryProxyResult(null);
      setQueryDirectResult(null);
    } finally {
      setLoadingQuery(false);
    }
  };

  const runNsql = async () => {
    setLoadingNsql(true);
    setError('');
    setNsqlProxyResult(null);
    setNsqlDirectResult(null);
    try {
      // Call both endpoints in parallel
      const [proxyResult, directResult] = await Promise.allSettled([
        proxyClient.nsql(nsqlQuery),
        directClient.nsql(nsqlQuery),
      ]);

      setNsqlProxyResult(
        proxyResult.status === 'fulfilled'
          ? proxyResult.value
          : { error: proxyResult.reason?.toString() },
      );
      setNsqlDirectResult(
        directResult.status === 'fulfilled'
          ? directResult.value
          : { error: directResult.reason?.toString() },
      );
    } catch (err) {
      const errorDetails = getErrorDetails(err, 'NSQL query');
      const fullError = `Natural language query: ${nsqlQuery}\n\n${errorDetails}`;
      setError(fullError);
      setNsqlProxyResult(null);
      setNsqlDirectResult(null);
    } finally {
      setLoadingNsql(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: '800px',
        margin: '0 auto',
        padding: '20px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ marginBottom: '20px' }}>
        <Link
          href="/"
          style={{
            color: '#0070f3',
            textDecoration: 'none',
            fontSize: '14px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          ← Back to Home
        </Link>
      </div>

      <h1 style={{ borderBottom: '2px solid #0070f3', paddingBottom: '10px' }}>
        🌶️ Spice.js Browser Test
      </h1>

      <div
        style={{
          background: '#f5f5f5',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px',
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Configuration</h3>

        <form onSubmit={(e) => e.preventDefault()}>
          <div style={{ marginBottom: '10px' }}>
            <label
              htmlFor="apiKey"
              style={{
                display: 'block',
                marginBottom: '5px',
                fontSize: '14px',
                fontWeight: '600',
              }}
            >
              API Key:
            </label>
            <input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your Spice.ai API key"
              autoComplete="off"
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '14px',
                border: '1px solid #ddd',
                borderRadius: '5px',
                fontFamily: 'monospace',
              }}
            />
            <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#666' }}>
              Your API key is only used in your browser and never sent to this
              server.
            </p>
          </div>
        </form>

        <div
          style={{
            marginTop: '15px',
            padding: '10px',
            background: '#fff',
            borderRadius: '5px',
            fontSize: '13px',
          }}
        >
          <div style={{ marginBottom: '5px' }}>
            <strong>Environment:</strong> Browser (Next.js App Router)
          </div>
          <div style={{ marginBottom: '5px' }}>
            <strong>API Key Status:</strong>{' '}
            {apiKey ? '✓ Configured' : '✗ Not set'}
          </div>
        </div>
      </div>

      {error && (
        <div
          style={{
            background: '#fee',
            border: '2px solid #c00',
            borderRadius: '8px',
            marginBottom: '20px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              background: '#c00',
              color: 'white',
              padding: '12px 15px',
              fontWeight: '600',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>🚨 Test Failure - Diagnostic Information</span>
            <button
              onClick={() => setError('')}
              style={{
                background: 'transparent',
                border: '1px solid white',
                color: 'white',
                padding: '4px 12px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              Dismiss
            </button>
          </div>
          <pre
            style={{
              margin: 0,
              padding: '15px',
              color: '#c00',
              fontSize: '12px',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflowX: 'auto',
              maxHeight: '400px',
              overflowY: 'auto',
            }}
          >
            {error}
          </pre>
          <div
            style={{
              padding: '10px 15px',
              background: '#fff5f5',
              fontSize: '12px',
              color: '#666',
              borderTop: '1px solid #fcc',
            }}
          >
            💡 <strong>Tip:</strong> Copy this error information when reporting
            issues or debugging.
          </div>
        </div>
      )}

      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '20px',
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: '15px' }}>
          Health & Readiness Checks
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '20px',
          }}
        >
          <div>
            <h3 style={{ marginTop: 0, fontSize: '18px' }}>Health Check</h3>
            <p style={{ fontSize: '14px', color: '#666', marginTop: '8px' }}>
              Tests the /health endpoint
            </p>
            <button
              onClick={checkHealth}
              disabled={loadingHealth}
              style={{
                background: '#0070f3',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '5px',
                cursor: loadingHealth ? 'not-allowed' : 'pointer',
                opacity: loadingHealth ? 0.6 : 1,
                fontSize: '14px',
                fontWeight: '600',
                width: '100%',
              }}
            >
              {loadingHealth ? 'Checking...' : 'Check Health'}
            </button>
            <div
              style={{
                marginTop: '15px',
                fontSize: '18px',
                fontWeight: '600',
                textAlign: 'center',
              }}
            >
              {healthStatus}
            </div>
          </div>

          <div>
            <h3 style={{ marginTop: 0, fontSize: '18px' }}>Ready Check</h3>
            <p style={{ fontSize: '14px', color: '#666', marginTop: '8px' }}>
              Tests the /v1/ready endpoint
            </p>
            <button
              onClick={checkReady}
              disabled={loadingReady}
              style={{
                background: '#0070f3',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '5px',
                cursor: loadingReady ? 'not-allowed' : 'pointer',
                opacity: loadingReady ? 0.6 : 1,
                fontSize: '14px',
                fontWeight: '600',
                width: '100%',
              }}
            >
              {loadingReady ? 'Checking...' : 'Check Ready'}
            </button>
            <div
              style={{
                marginTop: '15px',
                fontSize: '18px',
                fontWeight: '600',
                textAlign: 'center',
              }}
            >
              {readyStatus}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gap: '15px',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '20px',
          }}
        >
          <h2 style={{ marginTop: 0 }}>client.refreshAcceleration()</h2>
          <p style={{ fontSize: '14px', color: '#666' }}>
            Triggers dataset refresh: eth.recent_blocks
          </p>
          <button
            onClick={runRefresh}
            disabled={loadingRefresh}
            style={{
              background: '#0070f3',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '5px',
              cursor: loadingRefresh ? 'not-allowed' : 'pointer',
              opacity: loadingRefresh ? 0.6 : 1,
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            {loadingRefresh ? 'Refreshing...' : 'Refresh Dataset'}
          </button>
          {refreshProxyResult && refreshDirectResult && (
            <DiffViewer
              proxyResult={refreshProxyResult}
              directResult={refreshDirectResult}
              title="Refresh Results"
            />
          )}
        </div>

        <div
          style={{
            border: '2px solid #0070f3',
            borderRadius: '8px',
            padding: '20px',
            background: '#f0f9ff',
          }}
        >
          <h2 style={{ marginTop: 0, color: '#0070f3' }}>Custom Query 🔍</h2>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>
            Execute your own SQL query using <code>client.sql()</code> or{' '}
            <code>client.sqlJson()</code>
          </p>

          <div style={{ marginBottom: '15px' }}>
            <label
              htmlFor="customQuery"
              style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '600',
              }}
            >
              SQL Query:
            </label>
            <textarea
              id="customQuery"
              value={customQuery}
              onChange={(e) => setCustomQuery(e.target.value)}
              placeholder="Enter SQL query..."
              rows={3}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '14px',
                border: '1px solid #ddd',
                borderRadius: '5px',
                fontFamily: 'monospace',
                resize: 'vertical',
              }}
            />
          </div>

          <div
            style={{
              marginBottom: '15px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={useJsonFormat}
                onChange={(e) => setUseJsonFormat(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Use{' '}
              <code
                style={{
                  background: '#e0e0e0',
                  padding: '2px 6px',
                  borderRadius: '3px',
                }}
              >
                sqlJson()
              </code>{' '}
              format (includes metadata)
            </label>
          </div>

          <button
            onClick={runCustomQuery}
            disabled={loadingQuery || !customQuery.trim()}
            style={{
              background:
                loadingQuery || !customQuery.trim() ? '#ccc' : '#0070f3',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '5px',
              cursor:
                loadingQuery || !customQuery.trim() ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            {loadingQuery ? 'Executing...' : '▶ Execute Query'}
          </button>

          {queryProxyResult && queryDirectResult && (
            <DiffViewer
              proxyResult={queryProxyResult}
              directResult={queryDirectResult}
              title={`Query Results (${useJsonFormat ? 'JSON' : 'Arrow Table'})`}
            />
          )}
        </div>
      </div>

      <div
        style={{
          background: '#fff',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        <h2
          style={{
            marginTop: 0,
            marginBottom: '15px',
            fontSize: '18px',
            color: '#333',
          }}
        >
          Natural Language Query (NSQL)
        </h2>
        <div style={{ marginBottom: '15px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '500',
              color: '#555',
            }}
          >
            Natural Language Query:
          </label>
          <textarea
            value={nsqlQuery}
            onChange={(e) => setNsqlQuery(e.target.value)}
            placeholder="e.g., Show me the first 5 rows"
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '5px',
              border: '1px solid #ddd',
              fontSize: '14px',
              fontFamily: 'monospace',
              minHeight: '60px',
              resize: 'vertical',
            }}
          />
        </div>

        <button
          onClick={runNsql}
          disabled={loadingNsql || !nsqlQuery.trim()}
          style={{
            background: loadingNsql || !nsqlQuery.trim() ? '#ccc' : '#10b981',
            color: 'white',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '5px',
            cursor:
              loadingNsql || !nsqlQuery.trim() ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '600',
          }}
        >
          {loadingNsql ? 'Processing...' : '🤖 Ask Natural Language Question'}
        </button>

        {nsqlProxyResult && nsqlDirectResult && (
          <DiffViewer
            proxyResult={nsqlProxyResult}
            directResult={nsqlDirectResult}
            title="NSQL Results"
          />
        )}
      </div>

      <div
        style={{
          background: '#f0f9ff',
          border: '1px solid #bae6fd',
          padding: '15px',
          borderRadius: '8px',
          fontSize: '14px',
        }}
      >
        <strong>ℹ️ Note:</strong> This page uses the browser build of
        SpiceClient. All requests are made directly from the browser using fetch
        API.
      </div>
    </div>
  );
}
