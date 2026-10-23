// Client for the history collector (CT 103). All calls fail soft: charts are optional.
const TIMEOUT_MS = 4000;
const cache = {};
const lastError = {};

function cfg() {
  const url = process.env.HISTORY_URL;
  const token = process.env.HISTORY_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

function report(part, err) {
  const msg = err ? (err.message ?? String(err)) : null;
  if (msg && msg !== lastError[part]) console.error(`[history] ${part}: ${msg}`);
  if (!msg && lastError[part]) console.log(`[history] ${part}: recovered`);
  lastError[part] = msg;
}

async function call(part, path, init = {}) {
  const c = cfg();
  if (!c) return null;
  try {
    const res = await fetch(`${c.url}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${c.token}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    report(part, null);
    return json;
  } catch (e) {
    report(part, e);
    return null;
  }
}

async function cached(key, ttl, path) {
  const hit = cache[key];
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await call(key, path);
  // Keep the last good result if the collector blips.
  if (value) cache[key] = { at: Date.now(), value };
  else if (hit) return hit.value;
  return value;
}

export const JKMC_METRICS = ['mc_tps', 'ct_cpu_pct', 'ct_mem_used', 'mc_chunks'];

export function getJkmcSeries(hours = 72) {
  const qs = `metrics=${JKMC_METRICS.join(',')}&hours=${hours}&points=120`;
  return cached(`jkmc-${hours}`, 30 * 1000, `/series?${qs}`);
}

export function getPortfolioSeries(days = 30) {
  return cached(`portfolio-${days}`, 5 * 60 * 1000, `/portfolio?days=${days}&points=120`);
}

export async function pushPortfolio(accounts) {
  const body = JSON.stringify({
    ts: Math.floor(Date.now() / 1000),
    accounts: accounts.map(a => ({ id: a.id, name: a.name, value: a.totalValue })),
  });
  await call('push', '/ingest/portfolio', {
    method: 'POST', body, headers: { 'Content-Type': 'application/json' },
  });
}
