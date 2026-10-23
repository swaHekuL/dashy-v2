// Bucket thinning for chart series. rows: [[ts, value], ...] sorted by ts.
const AGG = {
  min: a => Math.min(...a),
  max: a => Math.max(...a),
  avg: a => a.reduce((x, y) => x + y, 0) / a.length,
  last: a => a[a.length - 1],
};

// Split [from, to] into `points` equal buckets; empty buckets are skipped (a gap, never a zero).
export function thin(rows, { from, to, points, agg = 'avg' }) {
  const fn = AGG[agg];
  if (!fn) throw new Error(`unknown agg ${agg}`);
  if (!(to > from) || points < 1) return [];
  const size = (to - from) / points;
  const buckets = new Map();
  for (const [ts, v] of rows) {
    if (ts < from || ts > to) continue;
    const i = Math.min(points - 1, Math.floor((ts - from) / size));
    if (!buckets.has(i)) buckets.set(i, []);
    buckets.get(i).push(v);
  }
  return [...buckets.keys()].sort((a, b) => a - b)
    .map(i => [Math.round(from + (i + 0.5) * size), fn(buckets.get(i))]);
}

// Sum several account series at each bucket, carrying each account's last value forward.
// Starts at the first bucket where every account has reported, so the total never undercounts.
export function sumCarried(seriesList) {
  const stamps = [...new Set(seriesList.flatMap(s => s.map(p => p[0])))].sort((a, b) => a - b);
  const idx = seriesList.map(() => 0);
  const last = seriesList.map(() => null);
  const out = [];
  for (const t of stamps) {
    seriesList.forEach((s, k) => {
      while (idx[k] < s.length && s[idx[k]][0] <= t) { last[k] = s[idx[k]][1]; idx[k]++; }
    });
    if (last.every(v => v != null)) out.push([t, last.reduce((a, b) => a + b, 0)]);
  }
  return out;
}
