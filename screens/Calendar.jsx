import { Roboto } from 'next/font/google';

const roboto = Roboto({ weight: ['300', '400', '500'], subsets: ['latin'] });

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function dateLabel(dateStr) {
  const today = localDateStr(new Date());
  const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1);
  const tomorrow = localDateStr(tmrw);
  const d = new Date(dateStr + 'T12:00:00'); // noon avoids DST edge cases
  const formatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  if (dateStr === today) return `TODAY — ${formatted}`;
  if (dateStr === tomorrow) return `TOMORROW — ${formatted}`;
  return formatted;
}

export default function Calendar({ data }) {
  if (!data) return <PanelLoading label="CALENDAR" />;

  const events = data.events ?? [];

  const groups = [];
  const byDate = {};
  for (const ev of events) {
    if (!byDate[ev.date]) {
      byDate[ev.date] = [];
      groups.push({ date: ev.date, events: byDate[ev.date] });
    }
    byDate[ev.date].push(ev);
  }

  return (
    <div className={roboto.className} style={{
      width: '100%', height: '100%', background: '#000',
      padding: '3vh 5vw', display: 'flex', flexDirection: 'column', gap: '1.5vh',
    }}>
      {events.length === 0 && (
        <div style={{ color: '#9aa0a6', fontSize: '3vw', marginTop: '2vh' }}>No upcoming events</div>
      )}
      {groups.map(({ date, events: evs }) => (
        <div key={date} style={{ display: 'flex', flexDirection: 'column', gap: '1.5vh' }}>
          <div style={{ color: '#8ab4f8', fontSize: '2vw', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {dateLabel(date)}
          </div>
          {evs.map(ev => (
            <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: '2vw' }}>
              <div style={{ width: '4px', height: '5vh', background: ev.color, borderRadius: '2px', flexShrink: 0 }} />
              <div>
                <div style={{ color: '#e8eaed', fontSize: '3.5vw', fontWeight: 500 }}>{ev.title}</div>
                <div style={{ color: '#9aa0a6', fontSize: '2.2vw', marginTop: '0.3vh' }}>{ev.time}</div>
              </div>
            </div>
          ))}
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
