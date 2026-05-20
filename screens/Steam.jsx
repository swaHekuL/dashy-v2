export default function Steam({ data }) {
  if (!data) return <PanelLoading label="STEAM" />;

  const deals = data.deals ?? [];
  const { newRelease } = data;

  return (
    <div style={{
      width: '100%', height: '100%', background: '#000',
      padding: '3vh 5vw', display: 'flex', flexDirection: 'column', gap: '1.5vh',
      fontFamily: 'Arial, Helvetica, sans-serif',
    }}>
      <div style={{
        color: '#66c0f4', fontSize: '2vw', fontWeight: 700,
        letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.5vh',
      }}>
        Featured &amp; Deals
      </div>
      {deals.length === 0 && (
        <div style={{ color: '#8f98a0', fontSize: '2.8vw' }}>No featured deals right now</div>
      )}
      {deals.map((d) => (
        <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1vh' }}>
          <span style={{ color: '#c6d4df', fontSize: '3vw' }}>{d.name}</span>
          <span style={{
            background: '#4c6b22', color: '#a4d007',
            fontSize: '2.5vw', fontWeight: 700,
            padding: '0.2vh 1.2vw', borderRadius: '3px',
          }}>
            -{d.discount}%
          </span>
        </div>
      ))}
      {newRelease && (
        <div style={{ color: '#8f98a0', fontSize: '2.2vw', marginTop: '0.5vh' }}>
          ▸ New release: {newRelease}
        </div>
      )}
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
