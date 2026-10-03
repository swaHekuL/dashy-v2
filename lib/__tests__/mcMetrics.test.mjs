import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { parsePrometheus, computeTps, scrape } from '../mcMetrics.js';

const SAMPLE = `# HELP mc_player_list Online players
# TYPE mc_player_list gauge
mc_player_list{id="ab640061-aaaa",name="swaHekuL",} 1.0
mc_player_list{id="00000000-0000-0000-0009-01f2",name=".BedrockPal",} 1.0
mc_entities_total{dim="overworld",dim_id="0",type="CREEPER",} 27.0
mc_entities_total{dim="overworld",dim_id="0",type="COW",} 13.0
mc_dimension_chunks_loaded{id="0",name="overworld",} 801.0
mc_dimension_chunks_loaded{id="-1",name="the_nether",} 0.0
mc_server_tick_rate_count 1520.0
mc_server_tick_rate_sum 30185.85
mc_server_tick_rate_bucket{le="+Inf",} 1520.0
`;

test('parsePrometheus reads names, labels (with trailing comma) and values', () => {
  const m = parsePrometheus(SAMPLE);
  assert.deepEqual(m.get('mc_player_list')[0], { labels: { id: 'ab640061-aaaa', name: 'swaHekuL' }, value: 1 });
  assert.equal(m.get('mc_entities_total').length, 2);
  assert.deepEqual(m.get('mc_server_tick_rate_sum'), [{ labels: {}, value: 30185.85 }]);
  assert.equal(m.get('mc_server_tick_rate_bucket')[0].labels.le, '+Inf');
  assert.equal(m.has('# HELP'), false);
});

test('computeTps uses the lifetime average on the first poll', () => {
  assert.equal(computeTps(null, { sum: 30185.85, count: 1520 }).toFixed(2), '19.86');
});

test('computeTps uses the change since the previous poll', () => {
  const prev = { sum: 1000, count: 50 };
  const curr = { sum: 1000 + 600 * 15, count: 50 + 600 };
  assert.equal(computeTps(prev, curr), 15);
});

test('computeTps falls back to lifetime average when counters reset (MC restart)', () => {
  const prev = { sum: 30185.85, count: 1520 };
  const curr = { sum: 400, count: 20 };
  assert.equal(computeTps(prev, curr), 20);
});

test('computeTps falls back to lifetime average when no ticks happened between polls', () => {
  const same = { sum: 300, count: 15 };
  assert.equal(computeTps(same, same), 20);
});

test('computeTps returns null with zero ticks ever', () => {
  assert.equal(computeTps(null, { sum: 0, count: 0 }), null);
});

test('scrape sums chunks/entities and lists players', async () => {
  const srv = http.createServer((req, res) => { res.end(SAMPLE); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  try {
    const out = await scrape({ url: `http://127.0.0.1:${srv.address().port}/metrics` });
    assert.equal(out.chunks, 801);
    assert.equal(out.entities, 40);
    assert.equal(out.tps.toFixed(2), '19.86');
    assert.deepEqual(out.players, [
      { name: 'swaHekuL', id: 'ab640061-aaaa' },
      { name: '.BedrockPal', id: '00000000-0000-0000-0009-01f2' },
    ]);
  } finally { srv.close(); }
});

test('scrape rejects on non-200', async () => {
  const srv = http.createServer((req, res) => { res.statusCode = 500; res.end('no'); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  try {
    await assert.rejects(scrape({ url: `http://127.0.0.1:${srv.address().port}/metrics` }), /500/);
  } finally { srv.close(); }
});
