const SEGMENT_MAP = {
  weather:          { segment: 'WEATHER' },
  calendar:         { segment: 'CALENDAR' },
  gmail:            { segment: 'GMAIL' },
  'news-world':     { segment: 'NEWS', sub: 'WORLD' },
  'news-gaming':    { segment: 'NEWS', sub: 'GAMING' },
  'news-tech':      { segment: 'NEWS', sub: 'TECH' },
  'news-sports':    { segment: 'NEWS', sub: 'SPORTS' },
  'news-utah':      { segment: 'NEWS', sub: 'UTAH' },
  'steam-sales':    { segment: 'STEAM', sub: 'SALES' },
  'steam-releases': { segment: 'STEAM', sub: 'RELEASES' },
  stocks:           { segment: 'STOCKS' },
  gas:              { segment: 'GAS' },
};

const SEGMENTS = ['WEATHER', 'CALENDAR', 'GMAIL', 'NEWS', 'STEAM', 'STOCKS', 'GAS'];

export default function StatusBar({ currentPanel }) {
  const active = SEGMENT_MAP[currentPanel] ?? { segment: 'WEATHER' };

  return (
    <div style={{
      height: '28px',
      background: '#000',
      display: 'flex',
      gap: '4px',
      padding: '4px',
      flexShrink: 0,
      borderTop: '1px solid #1a1a1a',
    }}>
      {SEGMENTS.map(seg => {
        const isActive = active.segment === seg;
        return (
          <div key={seg} style={{
            flex: 1,
            background: isActive ? '#fff' : '#111',
            borderRadius: '2px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{
              fontFamily: 'monospace',
              fontSize: '6px',
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: isActive ? '#000' : '#555',
              textTransform: 'uppercase',
              lineHeight: 1,
            }}>
              {seg}
            </span>
            {isActive && active.sub && (
              <span style={{
                fontFamily: 'monospace',
                fontSize: '5px',
                letterSpacing: '0.08em',
                color: '#444',
                textTransform: 'uppercase',
                marginTop: '1px',
                lineHeight: 1,
              }}>
                {active.sub}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
