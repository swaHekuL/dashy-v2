import { useState, useCallback } from 'react';

export default function Camera() {
  const [loaded, setLoaded] = useState(false);

  // Force a fresh stream URL on retry so the browser re-requests
  const [key, setKey] = useState(0);

  const handleError = useCallback(() => {
    setLoaded(false);
    setTimeout(() => setKey(k => k + 1), 1000);
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', background: '#000', position: 'relative' }}>
      {!loaded && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'monospace',
          fontSize: 13,
          color: '#444',
          letterSpacing: 3,
        }}>
          CONNECTING...
        </div>
      )}
      <img
        key={key}
        src="/api/camera"
        onLoad={() => setLoaded(true)}
        onError={handleError}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: loaded ? 1 : 0,
        }}
        alt=""
      />
      {loaded && (
        <div style={{
          position: 'absolute',
          top: 8,
          right: 12,
          fontFamily: 'monospace',
          fontSize: 11,
          color: '#f33',
          fontWeight: 700,
          letterSpacing: 2,
          textShadow: '0 0 6px rgba(255,51,51,0.6)',
        }}>
          ● LIVE
        </div>
      )}
    </div>
  );
}
