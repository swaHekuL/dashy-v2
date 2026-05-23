const WMO_EMOJI = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '🌨️', 73: '❄️', 75: '❄️', 77: '❄️',
  80: '🌦️', 81: '🌧️', 82: '⛈️',
  85: '🌨️', 86: '🌨️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
};

export default function Weather({ data }) {
  if (!data) return <PanelLoading label="WEATHER" />;

  const { temp, condition, high, low, wind, forecast = [] } = data;

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
        <div style={{ color: '#7ec8e3', fontSize: '3vw', marginTop: '1vh', textTransform: 'capitalize', letterSpacing: '0.05em' }}>
          {condition}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5vh', marginTop: '1.5vh' }}>
          {high !== null && <Row label="High / Low" value={`${high}° / ${low}°`} />}
          <Row label="Wind" value={`${wind} mph`} />
        </div>
      </div>

      <div style={{ width: '1px', height: '50%', background: '#222', flexShrink: 0 }} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5vh' }}>
        <div style={{ color: '#9aa0a6', fontSize: '1.8vw', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Next 12 Hours
        </div>
        <div style={{ display: 'flex', gap: '1.5vw' }}>
          {forecast.map((slot, i) => (
            <div key={i} style={{
              flex: 1, background: '#111', borderRadius: '8px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '2.5vh 0', gap: '0.4vh',
            }}>
              <span style={{ color: '#9aa0a6', fontSize: '1.8vw', letterSpacing: '0.03em' }}>{slot.time}</span>
              <span style={{ color: '#fff', fontSize: '3.5vw', fontWeight: 700, lineHeight: 1.1 }}>{slot.temp}°</span>
              <span style={{ color: '#9aa0a6', fontSize: '1.5vw' }}>{slot.wind} mph</span>
              <span style={{ fontSize: '2.8vw', marginTop: '1vh' }}>{WMO_EMOJI[slot.conditionCode] ?? '🌡️'}</span>
            </div>
          ))}
        </div>
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
