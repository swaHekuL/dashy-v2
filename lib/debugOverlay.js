// Pure helpers for the debug overlay (no React, no DOM), so they can be unit tested.

export const COMBO = ['ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowRight', 'ArrowRight', 'ArrowRight'];
export const COMBO_WINDOW_MS = 4000;
export const KEY_LOG_SIZE = 8;
export const ERROR_LOG_SIZE = 4;

// Remote-friendly toggle: Left x3 then Right x3 within COMBO_WINDOW_MS.
// Returns { state, fired }. State is { n, startedAt }.
// Clickers often send PageUp/PageDown instead of the arrows; Dashy treats them the same.
const ALIAS = { PageUp: 'ArrowLeft', PageDown: 'ArrowRight' };

export function comboStep(state, rawKey, now) {
  const key = ALIAS[rawKey] ?? rawKey;
  let { n, startedAt } = state;
  if (n > 0 && now - startedAt > COMBO_WINDOW_MS) { n = 0; }
  if (key === COMBO[n]) {
    if (n === 0) startedAt = now;
    n += 1;
  } else {
    // Wrong key: restart, but this key may itself begin a new attempt.
    n = key === COMBO[0] ? 1 : 0;
    startedAt = now;
  }
  if (n === COMBO.length) return { state: { n: 0, startedAt: 0 }, fired: true };
  return { state: { n, startedAt }, fired: false };
}

export const isKeyboardToggle = (e) =>
  e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd');

export function pushLimited(list, item, limit) {
  return [...list, item].slice(-limit);
}

export function describeKey(e, now) {
  return { t: now, key: e.key === ' ' ? 'Space' : e.key, code: e.code || '', keyCode: e.keyCode ?? 0 };
}

export function fmtAge(ms) {
  if (ms == null) return '—';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 90) return `${s}s`;
  if (s < 5400) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

// ?debug=1 pins on, ?debug=0 pins off, otherwise keep the saved value.
export function resolveDebugFlag(search, saved) {
  const m = /[?&]debug=([01])\b/.exec(search || '');
  if (m) return m[1] === '1';
  return saved === '1';
}

export function seriesCounts(charts) {
  const s = charts?.series;
  if (!s) return null;
  return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]));
}
