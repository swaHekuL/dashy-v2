import test from 'node:test';
import assert from 'node:assert/strict';
import { comboStep, resolveDebugFlag, fmtAge, pushLimited, seriesCounts } from '../debugOverlay.js';

const run = (keys, gap = 300) => {
  let st = { n: 0, startedAt: 0 }, fired = false, t = 1000;
  for (const k of keys) { const r = comboStep(st, k, t); st = r.state; fired = fired || r.fired; t += gap; }
  return fired;
};
const L = 'ArrowLeft', R = 'ArrowRight';

test('combo fires on L L L R R R', () => assert.equal(run([L, L, L, R, R, R]), true));
test('combo ignores wrong order', () => assert.equal(run([L, L, R, L, R, R]), false));
test('combo times out when too slow', () => assert.equal(run([L, L, L, R, R, R], 1500), false));
test('combo recovers after a stray key', () => assert.equal(run([R, L, L, L, R, R, R]), true));

test('debug flag: url beats saved, otherwise saved', () => {
  assert.equal(resolveDebugFlag('?debug=1', '0'), true);
  assert.equal(resolveDebugFlag('?debug=0', '1'), false);
  assert.equal(resolveDebugFlag('', '1'), true);
  assert.equal(resolveDebugFlag('', null), false);
});
test('fmtAge', () => {
  assert.equal(fmtAge(null), '—');
  assert.equal(fmtAge(5000), '5s');
  assert.equal(fmtAge(10 * 60000), '10m');
  assert.equal(fmtAge(2 * 3600000), '2.0h');
});
test('pushLimited keeps the newest', () => assert.deepEqual(pushLimited([1, 2, 3], 4, 3), [2, 3, 4]));
test('seriesCounts', () => {
  assert.equal(seriesCounts(null), null);
  assert.deepEqual(seriesCounts({ series: { a: [[1, 2]], b: [] } }), { a: 1, b: 0 });
});
