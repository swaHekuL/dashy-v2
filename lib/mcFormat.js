const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;

export function fmtDuration(ms) {
  if (ms < MIN) return '<1m';
  if (ms < HOUR) return `${Math.floor(ms / MIN)}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h${Math.floor((ms % HOUR) / MIN)}m`;
  return `${Math.floor(ms / DAY)}d ${Math.floor((ms % DAY) / HOUR)}h`;
}

export function fmtAgo(ms) {
  if (ms < MIN) return 'just now';
  if (ms < HOUR) return `${Math.floor(ms / MIN)}m ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h ago`;
  return `${Math.floor(ms / DAY)}d ago`;
}

export function fmtGB(bytes) {
  return (bytes / 1024 ** 3).toFixed(1);
}

export function tpsColor(tps) {
  if (tps == null) return null;
  if (tps >= 19) return '#4caf50';
  if (tps >= 15) return '#ffc107';
  return '#f44336';
}
