import test from 'node:test';
import assert from 'node:assert/strict';
import { nextRange, defaultRange, isAllowedRange, rangeLabel } from '../chartRanges.js';

test('defaults are 72 h and 30 d', () => {
  assert.equal(defaultRange('minecraft'), 72);
  assert.equal(defaultRange('portfolio'), 30);
  assert.equal(defaultRange('weather'), null);
});
test('JKMC cycles 72 -> 24 -> 6 -> 72', () => {
  assert.equal(nextRange('minecraft', 72), 24);
  assert.equal(nextRange('minecraft', 24), 6);
  assert.equal(nextRange('minecraft', 6), 72);
});
test('portfolio cycles 30 -> 90 -> 7 -> 30', () => {
  assert.equal(nextRange('portfolio', 30), 90);
  assert.equal(nextRange('portfolio', 90), 7);
  assert.equal(nextRange('portfolio', 7), 30);
});
test('other panels do not cycle', () => assert.equal(nextRange('gmail', 1), null));
test('allowlist and label', () => {
  assert.equal(isAllowedRange('minecraft', 24), true);
  assert.equal(isAllowedRange('minecraft', 9999), false);
  assert.equal(rangeLabel('portfolio', 7), '7 d');
});
