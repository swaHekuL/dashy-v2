import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const DEFAULT_PATH = join(process.cwd(), 'data', 'mc-history.json');

export function emptyState() {
  return { online: {}, peak: { date: null, count: 0 }, lastSeen: null };
}

export function localDate(nowMs, timeZone = 'America/Denver') {
  return new Date(nowMs).toLocaleDateString('en-CA', { timeZone });
}

// Pure: returns the next state and whether anything worth persisting changed.
export function update(state, players, nowMs) {
  const next = { online: {}, peak: { ...state.peak }, lastSeen: state.lastSeen };
  let changed = false;

  for (const p of players) {
    const prev = state.online[p.uuid];
    next.online[p.uuid] = { name: p.name, since: prev ? prev.since : nowMs };
    if (!prev) changed = true;
  }
  for (const [uuid, info] of Object.entries(state.online)) {
    if (!next.online[uuid]) {
      next.lastSeen = { name: info.name, at: nowMs };
      changed = true;
    }
  }

  const today = localDate(nowMs);
  if (next.peak.date !== today) {
    next.peak = { date: today, count: players.length };
    changed = true;
  } else if (players.length > next.peak.count) {
    next.peak.count = players.length;
    changed = true;
  }

  return { state: next, changed };
}

export function peakToday(state, nowMs) {
  return state.peak.date === localDate(nowMs) ? state.peak.count : 0;
}

export function load(path = DEFAULT_PATH) {
  try {
    const s = JSON.parse(readFileSync(path, 'utf8'));
    if (!s || typeof s.online !== 'object' || Array.isArray(s.online) || typeof s.peak !== 'object') {
      return emptyState();
    }
    return { online: s.online, peak: s.peak, lastSeen: s.lastSeen ?? null };
  } catch {
    return emptyState();
  }
}

// tmp-then-rename so a power cut can't leave a half-written file.
export function save(state, path = DEFAULT_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path + '.tmp', JSON.stringify(state));
  renameSync(path + '.tmp', path);
}
