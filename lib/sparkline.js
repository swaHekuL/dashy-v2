// Pure helpers for the Sparkline component. Points are [ts, value] pairs.

// Returns { d, first, last, trend } or null if fewer than 2 points.
// Viewbox is 0..100 x 0..100 (y grows downward). Gaps in time are drawn as
// a straight join, never a dip to zero.
export function sparkPath(points, { min, max, minSpan = 0 } = {}) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  const t0 = xs[0];
  const tSpan = xs[xs.length - 1] - t0 || 1;
  let lo = min ?? Math.min(...ys);
  let hi = max ?? Math.max(...ys);
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  const span = hi - lo || 1;
  const d = points
    .map(([t, v], i) => {
      const x = ((t - t0) / tSpan) * 100;
      const y = 100 - ((Math.min(Math.max(v, lo), hi) - lo) / span) * 100;
      return `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join('');
  const first = ys[0];
  const last = ys[ys.length - 1];
  return { d, first, last, trend: last > first ? 'up' : last < first ? 'down' : 'flat' };
}
