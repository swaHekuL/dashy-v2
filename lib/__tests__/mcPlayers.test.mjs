import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlayer, resolvePlayers } from '../mcPlayers.js';

test('Java player passes through', () => {
  assert.deepEqual(normalizePlayer({ name: 'swaHekuL', id: 'ab640061-1111' }),
    { name: 'swaHekuL', uuid: 'ab640061-1111', bedrock: false });
});

test('Floodgate dot-prefix marks Bedrock and is stripped', () => {
  assert.deepEqual(normalizePlayer({ name: '.FriendTag', id: 'x-1' }),
    { name: 'FriendTag', uuid: 'x-1', bedrock: true });
});

test('Floodgate UUID prefix marks Bedrock even without the dot', () => {
  assert.equal(normalizePlayer({ name: 'Pal', id: '00000000-0000-0000-0009-01f2a3b4c5d6' }).bedrock, true);
});

test('fake all-zero sample entries and nameless entries are dropped', () => {
  assert.equal(normalizePlayer({ name: '§7and 3 more', id: '00000000-0000-0000-0000-000000000000' }), null);
  assert.equal(normalizePlayer({ id: 'x' }), null);
});

test('resolvePlayers prefers the SLP sample', () => {
  const out = resolvePlayers([{ name: 'A', id: 'a' }], [{ name: 'B', id: 'b' }], 1);
  assert.deepEqual(out.map(p => p.name), ['A']);
});

test('resolvePlayers falls back to exporter when sample is empty but players are online', () => {
  const out = resolvePlayers([], [{ name: 'B', id: 'b' }], 1);
  assert.deepEqual(out.map(p => p.name), ['B']);
});

test('resolvePlayers returns [] when nobody is online, even if exporter is stale', () => {
  assert.deepEqual(resolvePlayers([], [{ name: 'B', id: 'b' }], 0), []);
});

const ANON = { name: 'Anonymous Player', id: '00000000-0000-0000-0000-000000000000' };

test('resolvePlayers uses exporter when the sample has anonymous (hidden) players', () => {
  const out = resolvePlayers([ANON, { name: 'A', id: 'a' }], [{ name: 'A', id: 'a' }, { name: 'Hidden', id: 'h' }], 2);
  assert.deepEqual(out.map(p => p.name), ['A', 'Hidden']);
});

test('resolvePlayers keeps the partial sample when exporter is unavailable', () => {
  const out = resolvePlayers([ANON, { name: 'A', id: 'a' }], null, 2);
  assert.deepEqual(out.map(p => p.name), ['A']);
});

test('resolvePlayers returns null (unknown) when players are online but none can be named', () => {
  assert.equal(resolvePlayers([], null, 2), null);
  assert.equal(resolvePlayers([ANON], null, 1), null);
  assert.equal(resolvePlayers([ANON], [], 1), null);
});
