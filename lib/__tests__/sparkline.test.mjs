import test from 'node:test';
import assert from 'node:assert/strict';
import { sparkPath } from '../sparkline.js';

test('fewer than 2 points -> null', () => {
  assert.equal(sparkPath([]), null);
  assert.equal(sparkPath([[1, 5]]), null);
  assert.equal(sparkPath(undefined), null);
});

test('maps time to x and value to inverted y', () => {
  const p = sparkPath([[0, 0], [10, 10]], {});
  assert.equal(p.d, 'M0.00 100.00L100.00 0.00');
  assert.equal(p.trend, 'up');
});

test('fixed min/max scale and clamping', () => {
  const p = sparkPath([[0, 20], [10, 40]], { min: 0, max: 20.5 });
  assert.match(p.d, /^M0\.00 2\.44L100\.00 0\.00$/);
});

test('minSpan keeps a tiny wobble flat-ish', () => {
  const p = sparkPath([[0, 100], [10, 100.1]], { minSpan: 10 });
  const ys = p.d.match(/ ([\d.]+)/g).map(Number);
  assert.ok(ys[0] - ys[1] < 5);
});

test('flat series is flat', () => {
  const p = sparkPath([[0, 5], [10, 5]], {});
  assert.equal(p.trend, 'flat');
});
