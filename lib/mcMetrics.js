// Minimal Prometheus text-format parser: enough for the Paper exporter's output.
export function parsePrometheus(text) {
  const out = new Map();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([a-zA-Z_:][\w:]*)(?:\{(.*)\})?\s+(\S+)/);
    if (!m) continue;
    const [, name, labelStr, valStr] = m;
    const labels = {};
    if (labelStr) {
      for (const lm of labelStr.matchAll(/(\w+)="((?:[^"\\]|\\.)*)"/g)) {
        labels[lm[1]] = lm[2].replace(/\\(.)/g, '$1');
      }
    }
    if (!out.has(name)) out.set(name, []);
    out.get(name).push({ labels, value: Number(valStr) });
  }
  return out;
}

// Ticks-per-second from mc_server_tick_rate's cumulative sum/count.
export function computeTps(prev, curr) {
  if (prev && curr.count > prev.count && curr.sum >= prev.sum) {
    return (curr.sum - prev.sum) / (curr.count - prev.count);
  }
  return curr.count > 0 ? curr.sum / curr.count : null;
}

const sumOf = (m, name) => (m.get(name) ?? []).reduce((a, s) => a + s.value, 0);
const single = (m, name) => m.get(name)?.[0]?.value ?? 0;

// Previous counters, so TPS reflects the last poll interval rather than all-time.
let lastTick = null;

export async function scrape({ url, timeoutMs = 3000 }) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let text;
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) throw new Error(`exporter HTTP ${res.status}`);
    text = await res.text();
  } finally {
    clearTimeout(timer);
  }

  const m = parsePrometheus(text);
  const curr = { sum: single(m, 'mc_server_tick_rate_sum'), count: single(m, 'mc_server_tick_rate_count') };
  const tps = computeTps(lastTick, curr);
  lastTick = curr;

  return {
    tps,
    chunks: sumOf(m, 'mc_dimension_chunks_loaded'),
    entities: sumOf(m, 'mc_entities_total'),
    players: (m.get('mc_player_list') ?? [])
      .filter(s => s.value > 0)
      .map(s => ({ name: s.labels.name, id: s.labels.id })),
  };
}
