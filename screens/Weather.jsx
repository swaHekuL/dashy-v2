export default function Weather({ data }) {
  if (!data) return <PanelLoading label="WEATHER" />;

  const { temp, condition, high, low, wind } = data;

  return (
    <div style={{
      width: '100%', height: '100%', background: '#000',
      display: 'flex', alignItems: 'center', padding: '0 6vw', gap: '6vw',
      fontFamily: 'Arial, Helvetica, sans-serif',
    }}>
      <div>
        <div style={{ color: '#fff', fontSize: '18vw', fontWeight: 200, lineHeight: 1 }}>
          {temp}°
        </div>
        <div style={{
          color: '#7ec8e3', fontSize: '3vw', marginTop: '1vh',
          textTransform: 'capitalize', letterSpacing: '0.05em',
        }}>
          {condition}
        </div>
      </div>
      <div style={{ width: '1px', height: '50%', background: '#222', flexShrink: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5vh' }}>
        {high !== null && (
          <Row label="High / Low" value={`${high}° / ${low}°`} />
        )}
        <Row label="Wind" value={`${wind} mph`} />
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div>
      <span style={{ color: '#9aa0a6', fontSize: '2.5vw', letterSpacing: '0.05em' }}>{label} </span>
      <span style={{ color: '#fff', fontSize: '2.5vw', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function PanelLoading({ label }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', paddingLeft: '4vw' }}>
      <span style={{ color: '#333', fontFamily: 'monospace', fontSize: '2vw', letterSpacing: '0.2em' }}>{label}</span>
    </div>
  );
}
