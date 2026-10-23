import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { openDb } from './db.mjs';
import { getSeries, getPortfolio, parseIngest } from './api.mjs';
import { pollOnce } from './poll.mjs';

export function authorized(header, token) {
  const given = Buffer.from((header ?? '').replace(/^Bearer /, ''));
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want);
}

export function makeHandler(db, token, clock = () => Math.floor(Date.now() / 1000)) {
  return async (req, res) => {
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (!authorized(req.headers.authorization, token)) return send(401, { error: 'unauthorized' });
    const url = new URL(req.url, 'http://x');
    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        const last = db.lastTs();
        return send(200, { ok: true, lastSampleAgeSec: last == null ? null : clock() - last });
      }
      if (req.method === 'GET' && url.pathname === '/series') return send(200, getSeries(db, url.searchParams, clock()));
      if (req.method === 'GET' && url.pathname === '/portfolio') return send(200, getPortfolio(db, url.searchParams, clock()));
      if (req.method === 'POST' && url.pathname === '/ingest/portfolio') {
        let raw = '';
        for await (const c of req) { raw += c; if (raw.length > 64 * 1024) return send(413, { error: 'too large' }); }
        let parsed;
        try { parsed = parseIngest(JSON.parse(raw)); } catch (e) { return send(400, { error: e.message }); }
        db.addPortfolio(parsed.ts, parsed.accounts);
        return send(200, { ok: true });
      }
      send(404, { error: 'not found' });
    } catch (e) {
      console.error('[collector] request failed:', e.message);
      send(500, { error: 'internal' });
    }
  };
}

// Run as a service: node collector/server.mjs (from the repo root, env from the systemd unit).
if (import.meta.url === `file://${process.argv[1]}`) {
  const { HISTORY_TOKEN, HISTORY_DB = './history.sqlite', HISTORY_BIND = '0.0.0.0', HISTORY_PORT = '8787', RAW_DAYS = '14' } = process.env;
  if (!HISTORY_TOKEN) { console.error('HISTORY_TOKEN not set'); process.exit(1); }
  const cfg = JSON.parse(readFileSync('config/settings.json', 'utf8')).minecraft;
  const db = openDb(HISTORY_DB);
  const tick = async () => {
    try {
      const values = await pollOnce(cfg);
      db.addSamples(Math.floor(Date.now() / 1000), values);
    } catch (e) { console.error('[collector] write failed:', e.message); process.exit(1); }
  };
  tick();
  setInterval(tick, 30_000);
  const prune = () => db.prune(Math.floor(Date.now() / 1000) - Number(RAW_DAYS) * 86400);
  prune();
  setInterval(prune, 6 * 3600_000);
  http.createServer(makeHandler(db, HISTORY_TOKEN)).listen(Number(HISTORY_PORT), HISTORY_BIND,
    () => console.log(`[collector] listening on ${HISTORY_BIND}:${HISTORY_PORT}`));
}
