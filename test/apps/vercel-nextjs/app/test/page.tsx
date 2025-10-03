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
  const [queryResult, setQueryResult] = useState<string>('');
  const [sqlResult, setSqlResult] = useState<string>('');
  const [sqlJsonResult, setSqlJsonResult] = useState<string>('');
  const [refreshResult, setRefreshResult] = useState<string>('');
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

  const runQuery = async () => {
    setLoading(true);
    setError('');
    setQueryResult('');
    try {
      const result = await client.query('SELECT 1 as test');
      // Convert Arrow Table to array of row objects
      const rows = result.toArray();
      setQueryResult(JSON.stringify(rows, null, 2));
    } catch (err) {
      setError(
        `Query failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
      setQueryResult('');
    } finally {
      setLoading(false);
    }
  };

  const runSql = async () => {
    setLoading(true);
    setError('');
    setSqlResult('');
    try {
      const result = await client.sql('SELECT 1 as test, 2 as value');
      // Convert Arrow Table to array of row objects
      const rows = result.toArray();
      setSqlResult(JSON.stringify(rows, null, 2));
    } catch (err) {
      setError(
        `SQL failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
      setSqlResult('');
    } finally {
      setLoading(false);
    }
  };

  const runSqlJson = async () => {
    setLoading(true);
    setError('');
    setSqlJsonResult('');
    try {
      const result = await client.sqlJson(
        'SELECT 1 as test, 2 as value, 3 as another',
      );
      setSqlJsonResult(JSON.stringify(result, null, 2));
    } catch (err) {
      setError(
        `SQL JSON failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
      setSqlJsonResult('');
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
          <h2 style={{ marginTop: 0 }}>
            SQL Query{' '}
            <span style={{ fontSize: '14px', color: '#999' }}>
              (deprecated)
            </span>
          </h2>
          <p style={{ fontSize: '14px', color: '#666' }}>
            Runs a simple SQL query using <code>client.query()</code>: SELECT 1
            as test
          </p>
          <button
            onClick={runQuery}
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
            {loading ? 'Running...' : 'Run Query'}
          </button>
          {queryResult && (
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
              {queryResult}
            </pre>
          )}
        </div>

        <div
          style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '20px',
          }}
        >
          <h2 style={{ marginTop: 0 }}>client.sql()</h2>
          <p style={{ fontSize: '14px', color: '#666' }}>
            Executes SQL and returns Arrow Table: SELECT 1 as test, 2 as value
          </p>
          <button
            onClick={runSql}
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
            {loading ? 'Running...' : 'Run SQL'}
          </button>
          {sqlResult && (
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
              {sqlResult}
            </pre>
          )}
        </div>

        <div
          style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '20px',
          }}
        >
          <h2 style={{ marginTop: 0 }}>client.sqlJson()</h2>
          <p style={{ fontSize: '14px', color: '#666' }}>
            Executes SQL and returns JSON with schema metadata: SELECT 1 as
            test, 2 as value, 3 as another
          </p>
          <button
            onClick={runSqlJson}
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
            {loading ? 'Running...' : 'Run SQL JSON'}
          </button>
          {sqlJsonResult && (
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
              {sqlJsonResult}
            </pre>
          )}
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
