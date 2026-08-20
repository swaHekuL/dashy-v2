import { useState, useEffect, useCallback, useRef } from 'react';

const CAM_META = {
  tapo: { label: 'BACK PATIO', badge: 'LIVE' },
  ring: { label: 'FRONT DOOR', badge: '7s'   },
};

export default function Camera({ activeCam = 'tapo' }) {
  const [loaded, setLoaded] = useState(false);
  const [key, setKey]       = useState(0);
  const intervalRef         = useRef(null);
  const meta                = CAM_META[activeCam] ?? CAM_META.tapo;

  useEffect(() => {
    setLoaded(false);
    setKey(k => k + 1);
    clearInterval(intervalRef.current);

    if (activeCam === 'ring') {
      intervalRef.current = setInterval(() => setKey(k => k + 1), 7000);
    }

    return () => clearInterval(intervalRef.current);
  }, [activeCam]);

  const handleError = useCallback(() => {
    setLoaded(false);
    setTimeout(() => setKey(k => k + 1), 1000);
  }, []);

  const src = activeCam === 'tapo'
    ? '/api/camera'
    : `/api/ring-snapshot?t=${key}`;

  return (
    <div style={{ width: '100%', height: '100%', background: '#000', position: 'relative' }}>
      {!loaded && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'monospace', fontSize: 13, color: '#444', letterSpacing: 3,
        }}>
          CONNECTING...
        </div>
      )}
      <img
        key={key}
        src={src}
        onLoad={() => setLoaded(true)}
        onError={handleError}
        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: loaded ? 1 : 0 }}
        alt=""
      />
      {loaded && (
        <div style={{
          position: 'absolute', top: 8, right: 12,
          fontFamily: 'monospace', fontSize: 11, color: '#f33',
          fontWeight: 700, letterSpacing: 2,
          textShadow: '0 0 6px rgba(255,51,51,0.6)',
        }}>
          ● {meta.badge}
        </div>
      )}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'rgba(0,0,0,0.55)', padding: '6px 0',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        fontFamily: 'monospace', fontSize: 13, color: '#ccc', letterSpacing: 2,
      }}>
        ← {meta.label} →
      </div>
    </div>
  );
}
