import { Roboto } from 'next/font/google';

const roboto = Roboto({ weight: ['300', '400', '500'], subsets: ['latin'] });

export default function Calendar({ data }) {
  if (!data) return <PanelLoading label="CALENDAR" />;

  const events = data?.events ?? [];
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className={roboto.className} style={{
      width: '100%', height: '100%', background: '#000',
      padding: '3vh 5vw', display: 'flex', flexDirection: 'column', gap: '1.5vh',
    }}>
      <div style={{ color: '#8ab4f8', fontSize: '2vw', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Today — {today}
      </div>
      {events.length === 0 && (
        <div style={{ color: '#9aa0a6', fontSize: '3vw', marginTop: '2vh' }}>No events today</div>
      )}
      {events.map((ev) => (
        <div key={ev.title + ev.time} style={{ display: 'flex', alignItems: 'center', gap: '2vw' }}>
          <div style={{ width: '4px', height: '5vh', background: ev.color, borderRadius: '2px', flexShrink: 0 }} />
          <div>
            <div style={{ color: '#e8eaed', fontSize: '3.5vw', fontWeight: 500 }}>{ev.title}</div>
            <div style={{ color: '#9aa0a6', fontSize: '2.2vw', marginTop: '0.3vh' }}>{ev.time}</div>
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
