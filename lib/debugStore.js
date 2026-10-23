// Tiny browser-side store the debug overlay reads. Safe to call on the server (no-ops).
import { pushLimited, ERROR_LOG_SIZE } from './debugOverlay';

const store = { fetches: {}, errors: [], loadedAt: null, hooked: false };

export function getDebugStore() {
  if (typeof window === 'undefined') return store;
  if (!window.__dashyDebug) window.__dashyDebug = store;
  return window.__dashyDebug;
}

export function recordFetch(name, ok, status) {
  const s = getDebugStore();
  s.fetches[name] = { at: Date.now(), ok, status: status ?? null };
}

export function recordError(msg) {
  const s = getDebugStore();
  s.errors = pushLimited(s.errors, { at: Date.now(), msg: String(msg).slice(0, 140) }, ERROR_LOG_SIZE);
}

export function hookErrors() {
  if (typeof window === 'undefined') return;
  const s = getDebugStore();
  if (s.hooked) return;
  s.hooked = true;
  s.loadedAt = Date.now();
  const orig = console.error;
  console.error = (...args) => {
    recordError(args.map(a => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    orig.apply(console, args);
  };
  window.addEventListener('error', e => recordError(e.message));
  window.addEventListener('unhandledrejection', e => recordError(e.reason?.message ?? e.reason));
}
