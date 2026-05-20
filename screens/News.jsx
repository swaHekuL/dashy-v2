export default function News({ data }) {
  if (!data) return <PanelLoading label="NEWS" />;

  const headlines = data?.headlines ?? [];
  if (!headlines.length) return <PanelLoading label="NEWS" />;

  return (
    <div style={{
      width: '100%', height: '100%', background: '#000',
      padding: '3vh 5vw', display: 'flex', flexDirection: 'column', gap: '1.8vh',
      fontFamily: 'Georgia, serif',
    }}>
      <div style={{
        color: '#aaa', fontSize: '2vw', letterSpacing: '0.15em',
        textTransform: 'uppercase', fontFamily: 'Arial, sans-serif', marginBottom: '0.5vh',
      }}>
        Top Stories
      </div>
      {headlines.map((h, i) => (
        <div key={h.title} style={{
          borderLeft: `3px solid ${i === 0 ? '#e63946' : '#333'}`,
          paddingLeft: '2vw',
        }}>
          <div style={{
            color: i === 0 ? '#f5f5f5' : '#ccc',
            fontSize: i === 0 ? '3.2vw' : '2.8vw',
            lineHeight: 1.35,
          }}>
            {h.title}
          </div>
        </div>
      ))}
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
