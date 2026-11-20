import net from 'node:net';
import settings from '../../config/settings.json';
import { getHost, getContainers } from '../../lib/proxmox';
import mock from './ops-mock';

const MAX_CARDS = 10;
// A failed Proxmox call keeps showing the last good numbers for a while instead of blanking the rings.
const STALE_MS = 2 * 60 * 1000;
const lastGood = { host: null, cts: null };
// Log each failure once when it starts, not on every 5s poll while it lasts.
const lastError = {};

function report(part, result) {
  const msg = result.status === 'rejected' ? (result.reason?.message ?? String(result.reason)) : null;
  if (msg && msg !== lastError[part]) console.error(`[ops] ${part}: ${msg}`);
  if (!msg && lastError[part]) console.log(`[ops] ${part}: recovered`);
  lastError[part] = msg;
}

function tcpUp(host, port, timeoutMs = 1500) {
  return new Promise(resolve => {
    const s = net.connect({ host, port, timeout: timeoutMs });
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('timeout', () => { s.destroy(); resolve(false); });
    s.on('error', () => resolve(false));
  });
}

async function fetchAgent(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
  if (!res.ok) throw new Error(`ops-agent HTTP ${res.status}`);
  return res.json();
}

const pct = (used, max) => (max > 0 ? Math.round((used / max) * 100) : null);
const worst = (a, b) => ['ok', 'warn', 'down'][Math.max(['ok', 'warn', 'down'].indexOf(a), ['ok', 'warn', 'down'].indexOf(b))];

function containerChip(name, ct) {
  if (!ct) return { name, state: 'down', note: 'not found' };
  if (ct.status !== 'running') return { name, state: 'down', note: ct.status };
  const mem = pct(ct.memUsed, ct.memMax);
  const disk = pct(ct.diskUsed, ct.diskMax);
  if (mem >= 90) return { name, state: 'warn', note: `RAM ${mem}%` };
  if (disk >= 90) return { name, state: 'warn', note: `disk ${disk}%` };
  return { name, state: 'ok', note: null };
}

// Only sessions that need attention or are in use get a tile; idle ones are just counted, so the
// panel is as full as the work is. Needs-you first (the agent already sorts them that way).
function toCards(sessions) {
  const active = sessions.filter(s => s.state !== 'idle');
  return {
    cards: active.slice(0, MAX_CARDS).map(s => ({ project: s.project, title: s.title, state: s.state })),
    idle: sessions.length - active.length + Math.max(0, active.length - MAX_CARDS),
  };
}

export default async function handler(req, res) {
  const ref = req.headers.referer ?? '';
  if (req.query.state || /[?&]ops=(mock|problems)/.test(ref)) return mock(req, res);

  const cfg = settings.ops;
  if (!cfg?.agentUrl) return res.status(503).json({ error: 'ops not configured' });

  const [host, cts, agent, printer] = await Promise.allSettled([
    getHost(),
    getContainers(),
    fetchAgent(cfg.agentUrl),
    tcpUp(cfg.printer.host, cfg.printer.port),
  ]);
  report('proxmox-host', host);
  report('proxmox-ct', cts);
  report('agent', agent);

  if (host.status === 'fulfilled') lastGood.host = { v: host.value, at: Date.now() };
  if (cts.status === 'fulfilled') lastGood.cts = { v: cts.value, at: Date.now() };
  const fresh = (x) => (x && Date.now() - x.at < STALE_MS ? x.v : null);
  const cards = agent.status === 'fulfilled' ? toCards(agent.value.sessions) : null;
  const h = fresh(lastGood.host);
  const list = fresh(lastGood.cts);
  const services = [
    ...cfg.containers.map(n => list ? containerChip(n, list.find(c => c.name === n)) : { name: n, state: 'warn', note: 'no data' }),
    ...(agent.status === 'fulfilled' ? agent.value.services : []),
    { name: 'printer', state: printer.value ? 'ok' : 'down', note: printer.value ? null : 'offline' },
    { name: 'dashy-pi', state: 'ok', note: null },
  ];
  // If the agent is unreachable, say so on a chip instead of showing an empty agents column as "all fine".
  if (agent.status !== 'fulfilled') services.push({ name: 'ops-agent', state: 'down', note: 'unreachable' });

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    at: Date.now(),
    host: h ? {
      cpu: Math.round(h.cpuPct),
      mem: pct(h.memUsed, h.memMax),
      disk: pct(h.diskUsed, h.diskMax),
      uptimeSec: h.uptime,
    } : null,
    services,
    sessions: agent.status === 'fulfilled' ? cards.cards : null,
    idle: agent.status === 'fulfilled' ? cards.idle : 0,
  });
}
