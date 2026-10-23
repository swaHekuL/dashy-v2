import { thin, sumCarried } from './thin.mjs';

const AGG_FOR = { mc_tps: 'min', ct_cpu_pct: 'max', host_cpu_pct: 'max' };
export const METRICS = [
  'mc_tps', 'mc_chunks', 'mc_entities', 'mc_players',
  'ct_cpu_pct', 'ct_mem_used', 'ct_mem_max', 'ct_disk_used',
  'host_cpu_pct', 'host_mem_used', 'host_disk_used',
];
const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

export function getSeries(db, q, now) {
  const hours = clamp(q.get('hours'), 1, 24 * 14, 72);
  const points = clamp(q.get('points'), 2, 500, 120);
  const wanted = (q.get('metrics') ?? '').split(',').filter(m => METRICS.includes(m));
  const to = now, from = now - hours * 3600;
  const series = {};
  for (const m of wanted) series[m] = thin(db.series(m, from, to), { from, to, points, agg: AGG_FOR[m] ?? 'avg' });
  return { from, to, series };
}

export function getPortfolio(db, q, now) {
  const days = clamp(q.get('days'), 1, 3650, 30);
  const points = clamp(q.get('points'), 2, 500, 120);
  const to = now, from = now - days * 86400;
  const accounts = {};
  for (const a of db.accounts()) {
    accounts[a.id] = { name: a.name, series: thin(db.series(`pf_total:${a.id}`, from, to), { from, to, points, agg: 'last' }) };
  }
  const list = Object.values(accounts).map(a => a.series).filter(s => s.length);
  return { from, to, total: list.length ? sumCarried(list) : [], accounts };
}

export function parseIngest(body) {
  if (!body || !Array.isArray(body.accounts) || !body.accounts.length) throw new Error('accounts required');
  const ts = Number.isFinite(body.ts) ? Math.floor(body.ts) : null;
  if (ts == null) throw new Error('ts required');
  const accounts = body.accounts.map(a => {
    if (typeof a?.id !== 'string' || !a.id || typeof a.name !== 'string' || !Number.isFinite(a.value)) throw new Error('bad account');
    return { id: a.id, name: a.name, value: a.value };
  });
  return { ts, accounts };
}
