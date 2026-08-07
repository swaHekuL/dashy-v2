export default function Camera() {
  return (
    <div style={{ width: '100%', height: '100%', background: '#000', position: 'relative' }}>
      <img
        src="/api/camera"
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        alt="Live camera feed"
      />
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
    </div>
  );
}
