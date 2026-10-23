import { useState, useEffect } from 'react';
import Sparkline from '../components/Sparkline';
import { fmtDuration, fmtAgo, fmtGB, tpsColor } from '../lib/mcFormat';

const GREEN = '#4caf50';
const RED = '#f44336';
const GRAY = '#444';
const LABEL = { color: '#9aa0a6', fontSize: '1.8vw', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' };

function PanelLoading() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', paddingLeft: '4vw' }}>
      <span style={{ color: '#333', fontFamily: 'monospace', fontSize: '2vw', letterSpacing: '0.2em' }}>JKMC</span>
    </div>
  );
}

function Avatar({ player, size = '6vh' }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: '4px', flexShrink: 0 };
  if (player.bedrock || failed) return <div style={{ ...box, background: '#2a2a2a' }} />;
  return (
    <img
      src={`https://mc-heads.net/avatar/${player.uuid}/32`}
      alt=""
      onError={() => setFailed(true)}
      style={{ ...box, imageRendering: 'pixelated' }}
    />
  );
}

const BeBadge = () => (
  <span style={{ color: '#000', background: '#9aa0a6', fontSize: '1.3vw', fontWeight: 700, padding: '0 0.5vw', borderRadius: '3px' }}>BE</span>
);

// Two-column layout (6+ players): name gets the full width, time + badge go underneath.
function CompactPlayerRow({ player, now }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8vw', minWidth: 0 }}>
      <Avatar player={player} size="5.5vh" />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ color: '#fff', fontSize: '1.8vw', fontWeight: 500, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {player.name}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.6vw', color: '#9aa0a6', fontSize: '1.4vw', lineHeight: 1.15 }}>
          {now ? fmtDuration(now - player.onlineSince) : ''}
          {player.bedrock && <BeBadge />}
        </span>
      </div>
    </div>
  );
}

function PlayerRow({ player, now }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1vw', minWidth: 0 }}>
      <Avatar player={player} />
      <span style={{ color: '#fff', fontSize: '2.2vw', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {player.name}
      </span>
      {player.bedrock && <BeBadge />}
      <span style={{ marginLeft: 'auto', color: '#9aa0a6', fontSize: '1.8vw', flexShrink: 0 }}>
        {now ? fmtDuration(now - player.onlineSince) : ''}
      </span>
    </div>
  );
}

function LastSeen({ lastSeen, now }) {
  if (!lastSeen || !now) return null;
  return (
    <div style={{ color: '#9aa0a6', fontSize: '1.8vw' }}>
      last seen: {lastSeen.name} · {fmtAgo(now - lastSeen.at)}
    </div>
  );
}

function Players({ mc, history, now }) {
  const card = { background: '#111', borderRadius: '8px', padding: '2vh 1.5vw', display: 'flex', flexDirection: 'column', gap: '1.5vh', minHeight: 0 };

  if (!mc.online) {
    return (
      <div style={{ ...card, justifyContent: 'center' }}>
        <div style={{ color: RED, fontSize: '4.5vw', fontWeight: 700, letterSpacing: '0.08em' }}>OFFLINE</div>
        <LastSeen lastSeen={history.lastSeen} now={now} />
      </div>
    );
  }
  if (mc.players.length === 0) {
    return (
      <div style={{ ...card, justifyContent: 'center' }}>
        <div style={{ color: '#fff', fontSize: '2.8vw', fontWeight: 500 }}>Nobody&apos;s on</div>
        <LastSeen lastSeen={history.lastSeen} now={now} />
      </div>
    );
  }
  const compact = mc.players.length > 5;
  const Row = compact ? CompactPlayerRow : PlayerRow;
  return (
    <div style={{
      ...card,
      display: 'grid', alignContent: 'start', columnGap: '1.5vw',
      rowGap: compact ? '1vh' : '1.5vh',
      gridTemplateColumns: compact ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)',
    }}>
      {mc.players.map(p => <Row key={p.uuid} player={p} now={now} />)}
    </div>
  );
}

// One wide row per metric: number + detail on the left, 72 h chart on the right.
function Row({ label, value, sub, accent, points, min, max, color }) {
  return (
    <div style={{ background: '#111', borderRadius: '8px', overflow: 'hidden', display: 'flex', minHeight: 0 }}>
      <div style={{ width: '5px', flexShrink: 0, background: accent ?? GRAY }} />
      <div style={{ width: '38%', padding: '0 1.2vw', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.4vh', minWidth: 0 }}>
        <div style={{ ...LABEL, fontSize: '1.5vw' }}>{label}</div>
        <div style={{ color: '#fff', fontSize: '2.8vw', fontWeight: 500, lineHeight: 1, whiteSpace: 'nowrap' }}>{value}</div>
        {sub && <div style={{ color: '#9aa0a6', fontSize: '1.3vw', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
      </div>
      {points !== undefined && (
        <div style={{ flex: 1, padding: '1.2vh 1vw 1.2vh 0', minWidth: 0 }}>
          <Sparkline points={points} min={min} max={max} color={color ?? accent ?? GREEN} fill />
        </div>
      )}
    </div>
  );
}

function Stats({ tps, ct, host, charts }) {
  const dash = '—';
  const memFrac = ct ? ct.memUsed / ct.memMax : null;
  const hostMemFrac = host ? host.memUsed / host.memMax : null;
  const cpuSub = [ct && `${ct.cpus}c`, host && `host ${Math.round(host.cpuPct)}%`].filter(Boolean).join(' · ') || null;
  const ramSub = host ? `host ${fmtGB(host.memUsed)}/${fmtGB(host.memMax)}G` : null;
  const s = charts?.series;
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'repeat(4, 1fr)', gap: '8px', minHeight: 0 }}>
      <Row label="TPS" value={tps?.tps != null ? tps.tps.toFixed(1) : dash} accent={tpsColor(tps?.tps)}
        points={s ? s.mc_tps : undefined} min={0} max={20.5} />
      <Row label="CPU" value={ct ? `${Math.round(ct.cpuPct)}%` : dash} sub={cpuSub} accent={ct ? GREEN : null}
        points={s ? s.ct_cpu_pct : undefined} min={0} max={100} />
      <Row label="RAM" value={ct ? `${fmtGB(ct.memUsed)}/${fmtGB(ct.memMax)}G` : dash} sub={ramSub}
        accent={ct ? (memFrac > 0.9 || hostMemFrac > 0.9 ? RED : GREEN) : null}
        points={s ? s.ct_mem_used : undefined} min={0} max={ct?.memMax} />
      <Row label="World" value={tps ? `${tps.chunks} ch` : dash} sub={tps ? `${tps.entities} entities` : null}
        accent={tps ? GREEN : null} points={s ? s.mc_chunks : undefined} />
    </div>
  );
}

function Footer({ ct, host }) {
  const muted = { color: '#9aa0a6' };
  const alert = { color: RED, fontWeight: 700 };
  const pct = (used, max) => Math.round((used / max) * 100);

  let ctPart = <span style={{ color: '#555' }}>CT —</span>;
  if (ct) {
    const running = ct.status === 'running';
    ctPart = (
      <span style={running ? muted : alert}>
        {running ? `CT up ${fmtDuration(ct.uptime * 1000)}` : `CT ${ct.status.toUpperCase()}`} · disk {pct(ct.diskUsed, ct.diskMax)}%
      </span>
    );
  }

  let hostPart = <span style={{ color: '#555' }}>host —</span>;
  if (host) {
    const diskPct = pct(host.diskUsed, host.diskMax);
    hostPart = (
      <span style={diskPct > 90 ? alert : muted}>
        host up {fmtDuration(host.uptime * 1000)} · disk {diskPct}%
      </span>
    );
  }

  return (
    <div style={{ fontSize: '1.6vw', whiteSpace: 'nowrap', overflow: 'hidden' }}>
      {ctPart}<span style={muted}> · </span>{hostPart}
    </div>
  );
}

export default function Minecraft({ data }) {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  if (!data) return <PanelLoading />;
  const { mc, tps, ct, host, history, charts } = data;

  return (
    <div style={{
      width: '100%', height: '100%', background: '#000',
      padding: '3vh 5vw', display: 'flex', flexDirection: 'column', gap: '1.5vh',
      fontFamily: 'Arial, Helvetica, sans-serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '1.5vw' }}>
        <span style={{ ...LABEL, fontSize: '2vw', letterSpacing: '0.12em' }}>JKMC</span>
        <span style={{ color: mc.online ? GREEN : RED, fontSize: '1.8vw', fontWeight: 700 }}>
          ● {mc.online ? 'ONLINE' : 'OFFLINE'}
        </span>
        {mc.online && <span style={{ color: '#9aa0a6', fontSize: '1.8vw' }}>{mc.version}</span>}
        {data.chartRange && <span style={{ color: '#ffd54f', fontSize: '1.8vw', fontWeight: 700 }}>charts {data.chartRange}</span>}
        <span style={{ marginLeft: 'auto', color: '#fff', fontSize: '2vw', fontWeight: 500 }}>
          {mc.online ? `${mc.playersOnline}/${mc.playersMax}` : ''}
          <span style={{ color: '#9aa0a6', fontWeight: 400 }}>{mc.online ? ' · ' : ''}peak {history.peakToday}</span>
        </span>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', minHeight: 0 }}>
        <Players mc={mc} history={history} now={now} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1vh', minHeight: 0 }}>
          <div style={{ flex: 1, display: 'grid', minHeight: 0 }}><Stats tps={tps} ct={ct} host={host} charts={charts} /></div>
          <Footer ct={ct} host={host} />
        </div>
      </div>
    </div>
  );
}
