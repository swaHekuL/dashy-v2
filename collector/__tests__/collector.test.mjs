import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { thin, sumCarried } from '../thin.mjs';
import { openDb } from '../db.mjs';
import { parseIngest, getSeries, getPortfolio } from '../api.mjs';
import { toValues } from '../poll.mjs';
import { authorized, makeHandler } from '../server.mjs';

test('thin: min keeps dips, max keeps spikes, avg averages, gaps are skipped', () => {
  const rows = [[0, 20], [1, 5], [2, 20], [30, 20]];
  const o = { from: 0, to: 40, points: 4 };
  assert.deepEqual(thin(rows, { ...o, agg: 'min' }).map(p => p[1]), [5, 20]);
  assert.deepEqual(thin(rows, { ...o, agg: 'max' }).map(p => p[1]), [20, 20]);
  assert.equal(thin(rows, { ...o, agg: 'avg' })[0][1], 15);
  assert.equal(thin(rows, { ...o, agg: 'last' })[0][1], 20);
  assert.equal(thin(rows, { ...o, agg: 'min' }).length, 2);
});

test('thin: ignores out-of-range rows and rejects bad args', () => {
  assert.deepEqual(thin([[100, 1]], { from: 0, to: 10, points: 5 }), []);
  assert.deepEqual(thin([[1, 1]], { from: 5, to: 5, points: 5 }), []);
  assert.throws(() => thin([], { from: 0, to: 1, points: 1, agg: 'bogus' }));
});

test('sumCarried: carries last value and starts when every account has reported', () => {
  const a = [[1, 10], [3, 12]];
  const b = [[2, 100], [3, 110]];
  assert.deepEqual(sumCarried([a, b]), [[2, 110], [3, 122]]);
  assert.deepEqual(sumCarried([]), []);
});

test('db: round trip, skips non-finite values, prunes raw but keeps portfolio', () => {
  const db = openDb(':memory:');
  assert.equal(db.addSamples(100, { mc_tps: 20, mc_chunks: NaN, ct_cpu_pct: null }), 1);
  db.addPortfolio(100, [{ id: 'a1', name: 'Test', value: 5 }]);
  assert.deepEqual(db.series('mc_tps', 0, 200), [[100, 20]]);
  assert.equal(db.prune(150), 1);
  assert.deepEqual(db.series('mc_tps', 0, 200), []);
  assert.deepEqual(db.series('pf_total:a1', 0, 200), [[100, 5]]);
  assert.deepEqual(db.accounts(), [{ id: 'a1', name: 'Test' }]);
  assert.equal(db.lastTs(), 100);
  db.addPortfolio(100, [{ id: 'a1', name: 'Test', value: 6 }]);   // idempotent per (metric, ts)
  assert.deepEqual(db.series('pf_total:a1', 0, 200), [[100, 6]]);
  db.close();
});

test('api: series ignores unknown metrics; portfolio total sums accounts', () => {
  const db = openDb(':memory:');
  const now = 1_000_000;
  db.addSamples(now - 60, { mc_tps: 19 });
  db.addPortfolio(now - 3600, [{ id: 'a', name: 'A', value: 100 }, { id: 'b', name: 'B', value: 50 }]);
  const s = getSeries(db, new URLSearchParams('metrics=mc_tps,evil&hours=1'), now);
  assert.deepEqual(Object.keys(s.series), ['mc_tps']);
  const p = getPortfolio(db, new URLSearchParams('days=1'), now);
  assert.equal(p.total.at(-1)[1], 150);
  assert.equal(p.accounts.a.name, 'A');
  assert.deepEqual(getPortfolio(openDb(':memory:'), new URLSearchParams(), now).total, []);
});

test('parseIngest validates input', () => {
  assert.throws(() => parseIngest({}));
  assert.throws(() => parseIngest({ ts: 1, accounts: [{ id: 'a', name: 'A', value: 'x' }] }));
  assert.throws(() => parseIngest({ accounts: [{ id: 'a', name: 'A', value: 1 }] }));
  assert.equal(parseIngest({ ts: 1.7, accounts: [{ id: 'a', name: 'A', value: 1 }] }).ts, 1);
});

test('toValues omits failed sources instead of writing zeros', () => {
  assert.deepEqual(toValues({}), {});
  const v = toValues({ slp: { playersOnline: 2 }, metrics: { tps: 19.9, chunks: 5, entities: 7 } });
  assert.deepEqual(v, { mc_tps: 19.9, mc_chunks: 5, mc_entities: 7, mc_players: 2 });
});

test('authorized compares bearer tokens', () => {
  assert.equal(authorized('Bearer secret', 'secret'), true);
  assert.equal(authorized('Bearer wrong!', 'secret'), false);
  assert.equal(authorized(undefined, 'secret'), false);
});

test('http: rejects without token, ingests and serves with token', async () => {
  const db = openDb(':memory:');
  const server = http.createServer(makeHandler(db, 'tok', () => 2000));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const h = { authorization: 'Bearer tok' };
  try {
    assert.equal((await fetch(`${base}/series`)).status, 401);
    const bad = await fetch(`${base}/ingest/portfolio`, { method: 'POST', headers: h, body: '{}' });
    assert.equal(bad.status, 400);
    const ok = await fetch(`${base}/ingest/portfolio`, { method: 'POST', headers: h,
      body: JSON.stringify({ ts: 1900, accounts: [{ id: 'a', name: 'A', value: 10 }] }) });
    assert.equal(ok.status, 200);
    const p = await (await fetch(`${base}/portfolio?days=1`, { headers: h })).json();
    assert.deepEqual(p.total.at(-1)[1], 10);
    assert.equal((await fetch(`${base}/nope`, { headers: h })).status, 404);
    assert.equal((await (await fetch(`${base}/health`, { headers: h })).json()).lastSampleAgeSec, 100);
  } finally { server.close(); }
});
