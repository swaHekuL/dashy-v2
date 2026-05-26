function formatDelta(delta) {
  if (delta === null) return null;
  if (delta === 0) return { text: '— no change', color: '#666' };
  const abs = Math.abs(delta).toFixed(2);
  return delta < 0
    ? { text: `▼ $${abs} from prev`, color: '#3a7d44' }
    : { text: `▲ $${abs} from prev`, color: '#c0392b' };
}

function formatTime(updatedAt) {
  if (!updatedAt) return null;
  return new Date(updatedAt).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function StationCard({ label, price, delta, updatedAt }) {
  const deltaInfo = formatDelta(delta);
  const timeStr = formatTime(updatedAt);

  return (
    <div style={{
      flex: 1,
      background: '#111',
      borderRadius: '8px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4px',
      padding: '16px 12px',
    }}>
      <span style={{
        color: '#888',
        fontSize: '1.6vw',
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        fontFamily: 'monospace',
      }}>
        {label}
      </span>
      <span style={{
        color: '#fff',
        fontSize: '6vw',
        fontWeight: 700,
        lineHeight: 1,
        fontFamily: 'Arial, Helvetica, sans-serif',
      }}>
        {price != null ? `$${price.toFixed(2)}` : '—'}
      </span>
      {deltaInfo && (
        <span style={{
          color: deltaInfo.color,
          fontSize: '1.2vw',
          letterSpacing: '0.1em',
          fontFamily: 'monospace',
        }}>
          {deltaInfo.text}
        </span>
      )}
      {timeStr && (
        <span style={{
          color: '#444',
          fontSize: '1vw',
          letterSpacing: '0.08em',
          fontFamily: 'monospace',
          marginTop: '2px',
        }}>
          as of {timeStr}
        </span>
      )}
    </div>
  );
}

function PanelLoading() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', paddingLeft: '4vw' }}>
      <span style={{ color: '#333', fontFamily: 'monospace', fontSize: '2vw', letterSpacing: '0.2em' }}>GAS</span>
    </div>
  );
}

export default function GasPrices({ data }) {
  if (!data) return <PanelLoading />;

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: '#000',
      display: 'flex',
      flexDirection: 'column',
      padding: '3vh 4vw',
      gap: '2vh',
    }}>
      <div style={{
        color: '#444',
        fontSize: '1.2vw',
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        textAlign: 'center',
        fontFamily: 'monospace',
      }}>
        MAVERIK · REGULAR UNLEADED
      </div>
      <div style={{ flex: 1, display: 'flex', gap: '4vw' }}>
        {data.map(station => (
          <StationCard key={station.label} {...station} />
        ))}
      </div>
    </div>
  );
}
