import { useState, useEffect, useRef } from 'react';
import {
  comboStep, isKeyboardToggle, describeKey, pushLimited, fmtAge,
  resolveDebugFlag, seriesCounts, KEY_LOG_SIZE,
} from '../lib/debugOverlay';
import { getDebugStore, hookErrors } from '../lib/debugStore';

const STORAGE_KEY = 'dashy-debug';

const mods = (e) => [e.ctrlKey && 'ctrl', e.shiftKey && 'shift', e.altKey && 'alt', e.metaKey && 'meta'].filter(Boolean).join('+');
const sendLog = (body) => {
  fetch('/api/debug', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
};

// Hidden by default. Toggle: Left x3 then Right x3 (remote), Ctrl+Shift+D (keyboard),
// or ?debug=1 / ?debug=0 in the address (saved in the browser). Never takes input or touches.
// getState() returns { panel, panelIndex, panelCount, rotating, camera, data }.
export default function DebugOverlay({ getState }) {
  const [on, setOn] = useState(false);
  const [keys, setKeys] = useState([]);
  const [, tick] = useState(0);
  const [pi, setPi] = useState(null);
  const combo = useRef({ n: 0, startedAt: 0 });

  const persist = (v) => { try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch {} };

  useEffect(() => {
    hookErrors();
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch {}
    const flag = resolveDebugFlag(window.location.search, saved);
    setOn(flag);
    if (/[?&]debug=[01]\b/.test(window.location.search)) persist(flag);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      const now = Date.now();
      sendLog({ ev: 'keydown', key: e.key, code: e.code, keyCode: e.keyCode, mods: mods(e) });
      const r = comboStep(combo.current, e.key, now);
      combo.current = r.state;
      if (r.fired || isKeyboardToggle(e)) {
        setOn(v => { persist(!v); return !v; });
        return;
      }
      setKeys(k => pushLimited(k, describeKey(e, now), KEY_LOG_SIZE));
    };
    const onUp = (e) => sendLog({ ev: 'keyup', key: e.key, code: e.code, keyCode: e.keyCode, mods: mods(e) });
    // Record every page load and how it started (reload vs navigate), so a button that
    // refreshes the page leaves a trace even though the page's own key list is wiped.
    const nav = performance.getEntriesByType?.('navigation')?.[0];
    sendLog({ ev: 'pageload', note: nav?.type ?? 'unknown' });
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onUp, true);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onUp, true); };
  }, []);

  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [on]);

  useEffect(() => {
    if (!on) return;
    let dead = false;
    const load = async () => {
      try {
        const r = await fetch('/api/debug');
        if (r.ok && !dead) setPi(await r.json());
      } catch {}
    };
    load();
    const id = setInterval(load, 5000);
    return () => { dead = true; clearInterval(id); };
  }, [on]);

  if (!on) return null;

  const st = getState();
  const store = getDebugStore();
  const now = Date.now();
  const mono = { fontFamily: 'monospace', fontSize: '1.15vw', lineHeight: 1.3, color: '#cfe8cf' };
  const head = { color: '#ffd54f', fontWeight: 700 };
  const mcCounts = seriesCounts(st.data?.minecraft?.charts);
  const pfCharts = st.data?.portfolio?.charts;

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, zIndex: 9999, width: '38vw', maxHeight: '100vh', overflow: 'hidden',
      background: 'rgba(0,0,0,0.82)', border: '1px solid #3a3a3a', padding: '0.6vh 0.8vw',
      pointerEvents: 'none', whiteSpace: 'pre', ...mono,
    }}>
      <div style={head}>DEBUG  (L×3 R×3 to hide)</div>
      <div>{`panel ${st.panel} ${st.panelIndex + 1}/${st.panelCount}  rot ${st.rotating ? 'on' : 'paused'}  cam ${st.camera ? 'on' : 'off'}`}</div>
      <div>{`view ${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}  up ${fmtAge(store.loadedAt ? now - store.loadedAt : null)}`}</div>
      <div style={head}>PI</div>
      {pi ? (
        <>
          <div>{`commit ${pi.commit}  build ${pi.buildId ?? '—'}`}</div>
          <div>{`temp ${pi.tempC ?? '—'}C  load ${pi.load.join(' ')}`}</div>
          <div>{`mem free ${pi.memFreeMB}/${pi.memTotalMB}M  up ${fmtAge(pi.uptimeSec * 1000)}`}</div>
        </>
      ) : <div>loading…</div>}
      <div style={head}>DATA AGE</div>
      {Object.entries(store.fetches).map(([name, f]) => (
        <div key={name} style={f.ok ? undefined : { color: '#ff8a80' }}>
          {`${name.padEnd(12)} ${fmtAge(now - f.at).padStart(5)} ${f.ok ? 'ok' : `FAIL ${f.status ?? ''}`}`}
        </div>
      ))}
      <div style={head}>CHARTS</div>
      <div>{`jkmc ${mcCounts ? Object.entries(mcCounts).map(([k, v]) => `${k.replace(/^(mc|ct)_/, '')}:${v}`).join(' ') : 'none'}`}</div>
      <div>{`portfolio ${pfCharts ? `total:${pfCharts.total?.length ?? 0}` : 'none'}`}</div>
      <div style={head}>KEYS (newest last)</div>
      {keys.length === 0 ? <div>press a button…</div> : keys.map((k, i) => (
        <div key={i}>{`${String(k.key).padEnd(12)} ${String(k.code).padEnd(11)} ${k.keyCode}  ${fmtAge(now - k.t)}`}</div>
      ))}
      <div style={head}>ERRORS</div>
      {store.errors.length === 0 ? <div>none</div> : store.errors.map((e, i) => (
        <div key={i} style={{ color: '#ff8a80' }}>{`${fmtAge(now - e.at)} ${e.msg}`.slice(0, 60)}</div>
      ))}
    </div>
  );
}
