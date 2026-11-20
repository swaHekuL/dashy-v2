const GREEN = '#4caf50';
const AMBER = '#ffb300';
const RED = '#f44336';
const BLUE = '#42a5f5';
const GRAY = '#555';
const LABEL = { color: '#9aa0a6', fontSize: '1.8vw', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' };

const loadColor = (pct) => (pct >= 90 ? RED : pct >= 75 ? AMBER : GREEN);
const SERVICE_COLOR = { ok: GREEN, warn: AMBER, down: RED };
const SESSION = {
  blocked: { color: AMBER, label: 'NEEDS YOU', rank: 0 },
  failed:  { color: RED,   label: 'FAILED',    rank: 1 },
  working: { color: GREEN, label: 'working',   rank: 2 },
  review:  { color: BLUE,  label: 'ready',     rank: 3 },
  idle:    { color: GRAY,  label: 'idle',      rank: 4 },
};

function fmtUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

function Ring({ label, pct, text }) {
  const color = pct == null ? GRAY : loadColor(pct);
  const C = 2 * Math.PI * 40;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6vh' }}>
      <div style={{ position: 'relative', width: '11vw', height: '11vw' }}>
        <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r="40" fill="none" stroke="#222" strokeWidth="10" />
          {pct != null && (
            <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={`${(C * Math.min(pct, 100)) / 100} ${C}`} />
          )}
        </svg>
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '2.6vw', fontWeight: 700 }}>
          {text ?? `${pct}%`}
        </span>
      </div>
      <span style={LABEL}>{label}</span>
    </div>
  );
}

function ServiceChip({ s }) {
  const color = SERVICE_COLOR[s.state] ?? GRAY;
  const bad = s.state !== 'ok';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8vw', minWidth: 0, background: '#111', borderRadius: '6px', padding: '0 1vw', border: `1px solid ${bad ? color : 'transparent'}` }}>
      <span style={{ width: '1.4vw', height: '1.4vw', borderRadius: '50%', background: color, flexShrink: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ color: '#fff', fontSize: '2vw', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
        {s.note && <span style={{ color, fontSize: '1.5vw', fontWeight: 700, whiteSpace: 'nowrap' }}>{s.note}</span>}
      </div>
    </div>
  );
}

// Text sizes follow how many tiles share the column, so a few tiles get big, readable titles.
function tier(n) {
  if (n <= 2) return { title: '3.4vw', sub: '2vw', lines: 3 };
  if (n <= 4) return { title: '2.8vw', sub: '1.8vw', lines: 2 };
  if (n <= 6) return { title: '2.3vw', sub: '1.5vw', lines: 2 };
  if (n <= 8) return { title: '1.9vw', sub: '1.4vw', lines: 2 };
  return { title: '1.8vw', sub: '1.4vw', lines: 1 };
}

function SessionCard({ s, t, wide }) {
  const meta = SESSION[s.state] ?? SESSION.idle;
  const hot = s.state === 'blocked' || s.state === 'failed';
  const title = s.title || s.project;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center',
      gap: '0.5vh', minWidth: 0, minHeight: 0, overflow: 'hidden',
      background: '#111', borderRadius: '8px', padding: '0 1.2vw',
      border: `2px solid ${hot ? meta.color : '#1a1a1a'}`,
      boxShadow: hot ? `0 0 14px ${meta.color}55` : 'none',
      gridColumn: wide ? 'span 2' : undefined,
    }}>
      <span style={{
        color: '#fff', fontSize: t.title, fontWeight: 600, lineHeight: 1.15,
        display: '-webkit-box', WebkitLineClamp: t.lines, WebkitBoxOrient: 'vertical', overflow: 'hidden', maxWidth: '100%',
      }}>{title}</span>
      {title.toLowerCase() !== s.project.toLowerCase() && <span style={{ color: '#9aa0a6', fontSize: t.sub, lineHeight: 1.1, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.project}</span>}
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.7vw', fontSize: t.sub, lineHeight: 1.1 }}>
        <span style={{ width: '1.3vw', height: '1.3vw', borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
        <span style={{ color: meta.color, fontWeight: 700, letterSpacing: hot ? '0.08em' : 0 }}>{meta.label}</span>
      </span>
    </div>
  );
}

export default function Ops({ data }) {
  if (!data) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', paddingLeft: '4vw' }}>
        <span style={{ color: '#333', fontFamily: 'monospace', fontSize: '2vw', letterSpacing: '0.2em' }}>OPS</span>
      </div>
    );
  }

  const { host, services } = data;
  const sessions = data.sessions ?? [];
  const sorted = [...sessions].sort((a, b) => (SESSION[a.state]?.rank ?? 9) - (SESSION[b.state]?.rank ?? 9));
  const count = (st) => sessions.filter(s => s.state === st).length;
  const idle = data.idle ?? 0;
  const needs = count('blocked') + count('failed');
  const summary = [`${count('working')} working`, needs ? `${needs} need${needs === 1 ? 's' : ''} you` : null, idle ? `${idle} idle` : null].filter(Boolean);
  const sick = services.filter(s => s.state !== 'ok').length;

  // 1 column up to 3 tiles, then 2; the rows stretch so the tiles always fill the column.
  const cols = sorted.length <= 3 ? 1 : 2;
  const rows = Math.max(1, Math.ceil(sorted.length / cols));
  const col = { display: 'flex', flexDirection: 'column', gap: '2vh', minHeight: 0, minWidth: 0 };
  return (
    <div style={{ width: '100%', height: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2vw', padding: '2vh 2vw', boxSizing: 'border-box', fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <div style={col}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={LABEL}>Server</span>
          <span style={{ ...LABEL, color: sick ? AMBER : GREEN }}>{sick ? `${sick} issue${sick === 1 ? '' : 's'}` : 'all ok'}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5vh 0', justifyItems: 'center', background: '#0b0b0b', borderRadius: '8px', padding: '1.5vh 0' }}>
          <Ring label="CPU" pct={host?.cpu} text={host ? undefined : '—'} />
          <Ring label="RAM" pct={host?.mem} text={host ? undefined : '—'} />
          <Ring label="Disk" pct={host?.disk} text={host ? undefined : '—'} />
          <Ring label="Uptime" pct={null} text={host ? fmtUptime(host.uptimeSec) : '—'} />
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gridAutoRows: '1fr', gap: '1vh 1vw' }}>
          {services.map(s => <ServiceChip key={s.name} s={s} />)}
        </div>
      </div>
      <div style={col}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={LABEL}>Agents</span>
          <span style={{ ...LABEL, color: needs ? AMBER : '#9aa0a6' }}>{summary.join(' · ')}</span>
        </div>
        {sorted.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ ...LABEL, color: data.sessions == null ? RED : '#555', fontSize: '2.4vw' }}>
              {data.sessions == null ? 'no session data' : 'all quiet'}
            </span>
          </div>
        ) : (
          <div style={{
            flex: 1, minHeight: 0, display: 'grid', gap: '1vh 1vw',
            gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)`,
          }}>
            {sorted.map((s, i) => <SessionCard key={s.project + i} s={s} t={tier(sorted.length)} wide={cols === 2 && sorted.length % 2 === 1 && i === sorted.length - 1} />)}
          </div>
        )}
      </div>
    </div>
  );
}
