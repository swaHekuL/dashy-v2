import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtDuration, fmtAgo, fmtGB, tpsColor } from '../mcFormat.js';

const M = 60 * 1000, H = 60 * M, D = 24 * H;

test('fmtDuration', () => {
  assert.equal(fmtDuration(30 * 1000), '<1m');
  assert.equal(fmtDuration(5 * M), '5m');
  assert.equal(fmtDuration(H + 12 * M), '1h12m');
  assert.equal(fmtDuration(2 * H), '2h0m');
  assert.equal(fmtDuration(3 * D + 4 * H + 5 * M), '3d 4h');
  assert.equal(fmtDuration(-5000), '<1m');
});

test('fmtAgo', () => {
  assert.equal(fmtAgo(20 * 1000), 'just now');
  assert.equal(fmtAgo(5 * M), '5m ago');
  assert.equal(fmtAgo(2 * H + 59 * M), '2h ago');
  assert.equal(fmtAgo(3 * D), '3d ago');
});

test('fmtGB', () => {
  assert.equal(fmtGB(5476083712), '5.1');
  assert.equal(fmtGB(8589934592), '8.0');
});

test('tpsColor thresholds', () => {
  assert.equal(tpsColor(20), '#4caf50');
  assert.equal(tpsColor(19), '#4caf50');
  assert.equal(tpsColor(18.9), '#ffc107');
  assert.equal(tpsColor(15), '#ffc107');
  assert.equal(tpsColor(14.9), '#f44336');
  assert.equal(tpsColor(null), null);
});
