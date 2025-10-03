'use client';

import { SpiceClient } from '@spiceai/spice';
import Link from 'next/link';
import { useState, useMemo } from 'react';

export default function TestPage() {
  const [apiKey, setApiKey] = useState<string>(
    process.env.NEXT_PUBLIC_SPICEAI_API_KEY || '',
  );
  const [healthStatus, setHealthStatus] = useState<string>('Not checked');
  const [readyStatus, setReadyStatus] = useState<string>('Not checked');
  const [refreshResult, setRefreshResult] = useState<string>('');
  const [customQuery, setCustomQuery] = useState<string>(
    'SELECT 1 as num, 2 as value',
  );
  const [customQueryResult, setCustomQueryResult] = useState<string>('');
  const [useJsonFormat, setUseJsonFormat] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // Initialize SpiceClient for browser - recreate when apiKey or endpoint changes
  const client = useMemo(() => new SpiceClient(apiKey || undefined), [apiKey]);

  const checkHealth = async () => {
    setLoading(true);
    setError('');
    try {
      const isHealthy = await client.isSpiceHealthy();
      setHealthStatus(isHealthy ? '✅ Healthy' : '❌ Not Healthy');
    } catch (err) {
      setError(
        `Health check failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
      setHealthStatus('❌ Error');
    } finally {
      setLoading(false);
    }
  };

  const checkReady = async () => {
    setLoading(true);
    setError('');
    try {
      const isReady = await client.isSpiceReady();
      setReadyStatus(isReady ? '✅ Ready' : '❌ Not Ready');
    } catch (err) {
      setError(
        `Ready check failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
      setReadyStatus('❌ Error');
    } finally {
      setLoading(false);
    }
  };

  const runRefresh = async () => {
    setLoading(true);
    setError('');
    setRefreshResult('');
    try {
      // Use a test dataset - this may fail if the dataset doesn't exist
      const result = await client.refreshAcceleration('eth.recent_blocks');
      setRefreshResult(JSON.stringify(result, null, 2));
    } catch (err) {
      setError(
        `Refresh failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
      setRefreshResult('');
    } finally {
      setLoading(false);
    }
  };

  const runCustomQuery = async () => {
    setLoading(true);
    setError('');
    setCustomQueryResult('');
    try {
      if (useJsonFormat) {
        // Use sqlJson() for JSON format with metadata
        const result = await client.sqlJson(customQuery);
        setCustomQueryResult(JSON.stringify(result, null, 2));
      } else {
        // Use sql() for Arrow Table format
        const result = await client.sql(customQuery);
        const rows = result.toArray();
        setCustomQueryResult(JSON.stringify(rows, null, 2));
      }
    } catch (err) {
      setError(
        `Custom query failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
      setCustomQueryResult('');
    } finally {
      setLoading(false);
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
            border: '1px solid #fcc',
            padding: '15px',
            borderRadius: '8px',
            marginBottom: '20px',
            color: '#c00',
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

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
          <h2 style={{ marginTop: 0 }}>Health Check</h2>
          <p style={{ fontSize: '14px', color: '#666' }}>
            Tests the /health endpoint
          </p>
          <button
            onClick={checkHealth}
            disabled={loading}
            style={{
              background: '#0070f3',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '5px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            {loading ? 'Checking...' : 'Check Health'}
          </button>
          <div
            style={{ marginTop: '15px', fontSize: '18px', fontWeight: '600' }}
          >
            Status: {healthStatus}
          </div>
        </div>

        <div
          style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '20px',
          }}
        >
          <h2 style={{ marginTop: 0 }}>Ready Check</h2>
          <p style={{ fontSize: '14px', color: '#666' }}>
            Tests the /v1/ready endpoint
          </p>
          <button
            onClick={checkReady}
            disabled={loading}
            style={{
              background: '#0070f3',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '5px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            {loading ? 'Checking...' : 'Check Ready'}
          </button>
          <div
            style={{ marginTop: '15px', fontSize: '18px', fontWeight: '600' }}
          >
            Status: {readyStatus}
          </div>
        </div>

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
            disabled={loading}
            style={{
              background: '#0070f3',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '5px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            {loading ? 'Refreshing...' : 'Refresh Dataset'}
          </button>
          {refreshResult && (
            <pre
              style={{
                marginTop: '15px',
                background: '#f5f5f5',
                padding: '15px',
                borderRadius: '5px',
                overflow: 'auto',
                fontSize: '12px',
              }}
            >
              {refreshResult}
            </pre>
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
            disabled={loading || !customQuery.trim()}
            style={{
              background: loading || !customQuery.trim() ? '#ccc' : '#0070f3',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '5px',
              cursor:
                loading || !customQuery.trim() ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            {loading ? 'Executing...' : '▶ Execute Query'}
          </button>

          {customQueryResult && (
            <pre
              style={{
                marginTop: '15px',
                background: '#fff',
                padding: '15px',
                borderRadius: '5px',
                overflow: 'auto',
                fontSize: '12px',
                border: '1px solid #ddd',
                maxHeight: '400px',
              }}
            >
              {customQueryResult}
            </pre>
          )}
        </div>
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
