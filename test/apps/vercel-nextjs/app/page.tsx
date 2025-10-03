import Link from 'next/link';

export default function Home() {
  return (
    <div
      style={{
        maxWidth: '800px',
        margin: '0 auto',
        padding: '40px 20px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1
          style={{
            fontSize: '48px',
            marginBottom: '10px',
            background: 'linear-gradient(135deg, #0070f3 0%, #ff4081 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          🌶️ Spice.js
        </h1>
        <p style={{ fontSize: '18px', color: '#666', marginTop: 0 }}>
          Next.js Test Application
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '15px',
          alignItems: 'center',
        }}
      >
        <Link
          href="/test"
          style={{
            background: '#0070f3',
            color: 'white',
            padding: '15px 30px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontSize: '16px',
            fontWeight: '600',
            display: 'inline-block',
            minWidth: '200px',
          }}
        >
          Browser Test Page →
        </Link>

        <div
          style={{
            marginTop: '20px',
            padding: '20px',
            background: '#f5f5f5',
            borderRadius: '8px',
            textAlign: 'left',
            width: '100%',
            maxWidth: '600px',
          }}
        >
          <h3 style={{ marginTop: 0 }}>API Endpoints:</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            <li style={{ padding: '8px 0' }}>
              <a
                href="/api/health"
                style={{ color: '#0070f3', textDecoration: 'none' }}
              >
                /api/health
              </a>
              {' - Health check endpoint'}
            </li>
            <li style={{ padding: '8px 0' }}>
              <a
                href="/api/v1/ready"
                style={{ color: '#0070f3', textDecoration: 'none' }}
              >
                /api/v1/ready
              </a>
              {' - Ready check endpoint'}
            </li>
            <li style={{ padding: '8px 0' }}>
              <code
                style={{
                  background: '#e0e0e0',
                  padding: '2px 6px',
                  borderRadius: '3px',
                }}
              >
                /api/v1/sql
              </code>
              {' - SQL query endpoint (POST)'}
            </li>
          </ul>
        </div>
      </div>

      <footer style={{ marginTop: '60px', color: '#999', fontSize: '14px' }}>
        <p>
          <a
            href="https://github.com/spiceai/spice.js"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#0070f3', textDecoration: 'none' }}
          >
            GitHub
          </a>
          {' · '}
          <a
            href="https://spice.ai"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#0070f3', textDecoration: 'none' }}
          >
            spice.ai
          </a>
        </p>
      </footer>
    </div>
  );
}
