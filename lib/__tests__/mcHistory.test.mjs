import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyState, localDate, update, peakToday, load, save } from '../mcHistory.js';

// 2026-10-02 12:00 MDT = 18:00 UTC
const NOON = Date.UTC(2026, 9, 2, 18, 0, 0);
const MIN = 60 * 1000;
const A = { name: 'swaHekuL', uuid: 'a' };
const B = { name: 'EngineerTF_2', uuid: 'b' };

test('localDate uses Denver time, not UTC', () => {
  // 2026-10-03 03:00 UTC is still Oct 2 in Denver
  assert.equal(localDate(Date.UTC(2026, 9, 3, 3, 0, 0)), '2026-10-02');
});

test('join records since, sets peak, reports changed', () => {
  const { state, changed } = update(emptyState(), [A, B], NOON);
  assert.equal(changed, true);
  assert.deepEqual(state.online, { a: { name: 'swaHekuL', since: NOON }, b: { name: 'EngineerTF_2', since: NOON } });
  assert.deepEqual(state.peak, { date: '2026-10-02', count: 2 });
  assert.equal(peakToday(state, NOON), 2);
});

test('same players later keep since and report unchanged', () => {
  const s1 = update(emptyState(), [A], NOON).state;
  const { state, changed } = update(s1, [A], NOON + 5 * MIN);
  assert.equal(changed, false);
  assert.equal(state.online.a.since, NOON);
});

test('leaving player becomes lastSeen; peak is kept', () => {
  const s1 = update(emptyState(), [A, B], NOON).state;
  const { state, changed } = update(s1, [A], NOON + 10 * MIN);
  assert.equal(changed, true);
  assert.deepEqual(state.lastSeen, { name: 'EngineerTF_2', at: NOON + 10 * MIN });
  assert.equal(state.online.b, undefined);
  assert.equal(state.peak.count, 2);
});

test('new Denver date resets peak to the current count', () => {
  const s1 = update(emptyState(), [A, B], NOON).state;
  const nextDay = NOON + 24 * 60 * MIN;
  const { state, changed } = update(s1, [A], nextDay);
  assert.equal(changed, true);
  assert.deepEqual(state.peak, { date: '2026-10-03', count: 1 });
});

test('peakToday is 0 when the stored peak is from an earlier day', () => {
  const s1 = update(emptyState(), [A], NOON).state;
  assert.equal(peakToday(s1, NOON + 24 * 60 * MIN), 0);
});

test('save then load round-trips; missing file loads empty', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mchist-'));
  const path = join(dir, 'sub', 'mc-history.json');
  assert.deepEqual(load(path), emptyState());
  const s = update(emptyState(), [A], NOON).state;
  save(s, path);
  assert.deepEqual(load(path), s);
  assert.equal(existsSync(path + '.tmp'), false);
});

test('corrupt or wrong-shaped file loads as empty state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mchist-'));
  const path = join(dir, 'mc-history.json');
  writeFileSync(path, '{"online": {"a": {"na');
  assert.deepEqual(load(path), emptyState());
  writeFileSync(path, '[1,2,3]');
  assert.deepEqual(load(path), emptyState());
  assert.ok(readFileSync(path, 'utf8')); // load never deletes the file
});
