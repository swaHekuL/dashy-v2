import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {
  writeVarInt, readVarInt, buildPacket, decodeStatusPacket,
  flattenMotd, parseStatusResponse, ping,
} from '../slp.js';

test('VarInt round-trips small, large and negative values', () => {
  for (const n of [0, 1, 127, 128, 255, 25565, 2097151, 2147483647, -1]) {
    const buf = writeVarInt(n);
    assert.deepEqual(readVarInt(buf), { value: n, size: buf.length });
  }
  assert.deepEqual([...writeVarInt(-1)], [0xff, 0xff, 0xff, 0xff, 0x0f]);
});

test('readVarInt returns null on incomplete input', () => {
  assert.equal(readVarInt(Buffer.from([0x80])), null);
  assert.equal(readVarInt(Buffer.alloc(0)), null);
});

const STATUS = {
  version: { name: '26.2', protocol: 999 },
  players: { max: 10, online: 2, sample: [{ name: 'swaHekuL', id: 'ab640061-0000-0000-0000-000000000001' }] },
  description: { text: '', extra: [{ text: 'JK', color: 'green' }, { text: 'MC' }] },
};

function statusPacket(obj) {
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  return buildPacket(0x00, Buffer.concat([writeVarInt(json.length), json]));
}

test('decodeStatusPacket returns JSON once the full packet is present', () => {
  const pkt = statusPacket(STATUS);
  assert.equal(decodeStatusPacket(pkt.subarray(0, 5)), null);
  assert.deepEqual(JSON.parse(decodeStatusPacket(pkt)), STATUS);
});

test('flattenMotd handles strings, components and section codes', () => {
  assert.equal(flattenMotd('§aJK§rMC'), 'JKMC');
  assert.equal(flattenMotd(STATUS.description), 'JKMC');
  assert.equal(flattenMotd(undefined), '');
});

test('parseStatusResponse maps fields and defaults a missing sample', () => {
  assert.deepEqual(parseStatusResponse(JSON.stringify(STATUS)), {
    version: '26.2', motd: 'JKMC', playersOnline: 2, playersMax: 10,
    sample: [{ name: 'swaHekuL', id: 'ab640061-0000-0000-0000-000000000001' }],
  });
  const noSample = { ...STATUS, players: { max: 10, online: 3 } };
  assert.deepEqual(parseStatusResponse(JSON.stringify(noSample)).sample, []);
});

function fakeServer(onConnection) {
  return new Promise(resolve => {
    const srv = net.createServer(onConnection);
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

test('ping reassembles a response split across TCP chunks', async () => {
  const pkt = statusPacket(STATUS);
  const srv = await fakeServer(sock => {
    sock.once('data', () => {
      sock.write(pkt.subarray(0, 3));
      setTimeout(() => sock.write(pkt.subarray(3)), 20);
    });
  });
  try {
    const res = await ping({ host: '127.0.0.1', port: srv.address().port, timeoutMs: 1000 });
    assert.equal(res.version, '26.2');
    assert.equal(res.playersOnline, 2);
  } finally { srv.close(); }
});

test('ping rejects at the timeout when the server never answers', async () => {
  const sockets = [];
  const srv = await fakeServer(sock => sockets.push(sock));
  const started = Date.now();
  try {
    await assert.rejects(ping({ host: '127.0.0.1', port: srv.address().port, timeoutMs: 200 }), /timeout/);
    assert.ok(Date.now() - started < 1000);
  } finally { sockets.forEach(s => s.destroy()); srv.close(); }
});

test('ping rejects when the connection is refused', async () => {
  const srv = await fakeServer(() => {});
  const { port } = srv.address();
  await new Promise(r => srv.close(r));
  await assert.rejects(ping({ host: '127.0.0.1', port, timeoutMs: 1000 }));
});
