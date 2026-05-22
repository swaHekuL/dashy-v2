export default function SteamReleases({ data }) {
  if (!data) return <PanelLoading label="NEW RELEASES" />;

  const newReleases = data.newReleases ?? [];

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
        New Releases
      </div>
      {newReleases.length === 0 && (
        <div style={{ color: '#8f98a0', fontSize: '2.8vw' }}>No new releases available</div>
      )}
      {newReleases.map(r => (
        <div key={r.name} style={{ paddingBottom: '1vh' }}>
          <span style={{ color: '#c6d4df', fontSize: '3vw' }}>&#9658; {r.name}</span>
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
