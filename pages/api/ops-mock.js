// MOCK data for the Ops panel, kept for previewing the look: /api/ops?state=mock (or problems). Not used for real data.
// State comes from ?state=ok|problems, or from the page's own ?ops=problems (Referer),
// so `/?panel=ops&ops=problems` previews the warning looks.
const wobble = (base, amp, period) => Math.round(base + amp * Math.sin(Date.now() / period));

export default function handler(req, res) {
  const ref = req.headers.referer ?? '';
  const problems = (req.query.state ?? (ref.includes('ops=problems') ? 'problems' : 'ok')) === 'problems';

  const host = {
    cpu: wobble(24, 10, 4000),
    mem: wobble(61, 3, 9000),
    disk: problems ? 91 : 48,
    uptimeSec: 14 * 86400 + 3 * 3600 + Math.floor(Date.now() / 1000) % 3600,
  };

  const services = [
    { name: 'minecraft',    state: problems ? 'warn' : 'ok', note: problems ? 'RAM 91%' : null },
    { name: 'claude-agent', state: 'ok', note: null },
    { name: 'history',      state: 'ok', note: null },
    { name: 'syncthing',    state: 'ok', note: null },
    { name: 'printer',      state: problems ? 'down' : 'ok', note: problems ? 'offline' : null },
    { name: 'backups',      state: problems ? 'warn' : 'ok', note: problems ? 'no OK since Sun' : null },
    { name: 'tailscale',    state: 'ok', note: null },
    { name: 'dashy-pi',     state: 'ok', note: null },
  ];

  const sessions = [
    { project: 'dashy-v2',           state: 'working' },
    { project: 'freelance-business', state: problems ? 'blocked' : 'working' },
    { project: 'remarkable',         state: problems ? 'failed' : 'review' },
    { project: 'home-agent',         state: 'idle' },
    { project: 'workout-tracker',    state: 'idle' },
    { project: 'jkmc',               state: 'idle' },
    { project: 'recipes',            state: 'review' },
    { project: 'job-search',         state: 'working' },
    { project: 'room-projector',     state: 'idle' },
    { project: 'wedding-planning',   state: 'idle' },
    { project: 'ideas',              state: 'idle' },
    { project: 'random',             state: 'idle' },
  ];

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ mock: true, at: Date.now(), host, services, sessions });
}
