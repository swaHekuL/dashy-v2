# JKMC Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a rotating `minecraft` panel (StatusBar segment **JKMC**). The left half shows who's playing on the Minecraft server; the right half shows TPS and the `minecraft` container's CPU/RAM/disk/uptime, with the Proxmox host's CPU/RAM/disk/uptime beneath each.

**Architecture:** One ESM API route, `pages/api/minecraft.js`, runs three independent fetches with `Promise.allSettled`: a hand-rolled Server List Ping (`lib/slp.js`), a Prometheus exporter scrape (`lib/mcMetrics.js`) and two read-only Proxmox API calls, for the container and for the host (`lib/proxmox.js`). It merges them with persisted player history (`lib/mcHistory.js`). The screen, `screens/Minecraft.jsx`, renders a player list plus 2×2 stat tiles and handles each part being missing on its own terms.

**Tech Stack:** Next.js 16.2.6 (Pages Router, `pages/api`), React 19, Node built-ins only (`node:net`, `node:https`, `node:fs`, `node:test`). No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-10-02-jkmc-panel-design.md`

## Global Constraints

- API routes are ESM: `import` only. `require()` throws at runtime (CLAUDE.md).
- No new npm dependencies. Tests use `node:test` + `node:assert/strict`, and run on the dev machine (Node 24).
- TLS to Proxmox is verified against `config/pve-root-ca.pem`. **Never** use `rejectUnauthorized: false` or `NODE_TLS_REJECT_UNAUTHORIZED`.
- The Proxmox token is read-only (`PVEAuditor`). The secret lives only in `.env.local` (Pi + dev machine) and must never be printed, logged, committed or returned in a response.
- Minecraft LAN address: `192.168.68.151`, Java port `25565`, exporter port `19565`. Proxmox: `https://192.168.68.150:8006`, node `pve`, container found by `name === 'minecraft'`.
- SLP timeout 3000ms, exporter timeout 3000ms, Proxmox timeout 5000ms. Panel refresh `30 * 1000`.
- History file `data/mc-history.json` (gitignored), written only when it changes, via an atomic tmp-then-rename write.
- Peak-today date uses the `America/Denver` timezone.
- No MSPT anywhere. The exporter's tick-seconds metric is the inter-tick interval on Paper.
- Don't touch the Cloudflare tunnel config, the router, the MC server or Proxmox beyond the token/ACL steps in Task 6.
- Visual language matches `screens/Portfolio.jsx`: `#000` background, `#111` cards with a 5px accent bar, `#9aa0a6` uppercase labels, Arial, green `#4caf50`, red `#f44336`, sizes in `vw`/`vh`.
- No `useState(new Date())`. The client clock starts as `null` and is set in `useEffect`.

## Review Focus

1. **SLP response hides the player sample while players are online.** Expected: the list falls back to the exporter's `mc_player_list`. Pinned in Task 4 (`resolvePlayers` tests).
2. **The MC server restarts, so the exporter's cumulative counters drop.** Expected: TPS falls back to the new lifetime average, never negative or above 20. Pinned in Task 2 (`computeTps` counter-reset test).
3. **The server accepts the TCP connection but replies slowly, in fragments or not at all.** Expected: fragments are reassembled, and silence rejects at the timeout instead of hanging the route. Pinned in Task 1 (split-chunk and timeout tests).
4. **The Pi loses power mid-write, so the history file is truncated or corrupt.** Expected: start from empty history, no crash. Pinned in Task 3 (corrupt-file load test).
5. **Midnight passes while players are online, or a player leaves.** Expected: peak resets to the current count on the new Denver date, and the leaver becomes "last seen". Pinned in Task 3 (rollover + leave tests).

---

## File Structure

| File | Responsibility |
| --- | --- |
| `lib/slp.js` (create) | Minecraft Server List Ping: VarInt codec, packet framing, `ping()` |
| `lib/mcMetrics.js` (create) | Prometheus text parser, TPS from counter changes, `scrape()` |
| `lib/mcHistory.js` (create) | Pure player-history update + atomic JSON load/save |
| `lib/mcPlayers.js` (create) | Normalize SLP/exporter player entries, Bedrock detection, fallback choice |
| `lib/proxmox.js` (create) | Read-only Proxmox client with CA-verified TLS, `getContainer()` |
| `lib/mcFormat.js` (create) | Pure display formatters used by the screen |
| `lib/__tests__/*.test.mjs` (create) | `node:test` unit tests |
| `pages/api/minecraft.js` (create) | Route: merges the three sources + history into the response contract |
| `screens/Minecraft.jsx` (create) | Panel UI |
| `pages/index.js` (modify) | Register panel, refresh rate, render |
| `screens/StatusBar.jsx` (modify) | `JKMC` segment |
| `config/settings.json` (modify) | `minecraft` block |
| `package.json` (modify) | `test` script |
| `.gitignore` (modify) | `/data/` |
| `CLAUDE.md`, `README.md` (modify) | Docs |

> **Spec deviation (intentional):** the spec's history shape `firstSeen: { [uuid]: epochMs }` becomes `online: { [uuid]: { name, since } }`, because setting `lastSeen` when a player leaves needs their name. Everything else follows the spec.

---

### Task 1: Server List Ping client (`lib/slp.js`) + test runner

**Files:**
- Modify: `package.json` (add `test` script)
- Create: `lib/slp.js`
- Test: `lib/__tests__/slp.test.mjs`

**Interfaces:**
- Produces: `writeVarInt(n: number) → Buffer`; `readVarInt(buf: Buffer, offset = 0) → { value, size } | null` (null = incomplete); `buildPacket(id: number, payload: Buffer) → Buffer`; `decodeStatusPacket(buf: Buffer) → string | null` (JSON string, or null if incomplete); `flattenMotd(desc: string | object) → string`; `parseStatusResponse(json: string) → { version: string, motd: string, playersOnline: number, playersMax: number, sample: Array<{ name: string, id: string }> }`; `ping({ host, port = 25565, timeoutMs = 3000 }) → Promise<same as parseStatusResponse>`.

- [ ] **Step 1: Add the test script to `package.json`**

Change the `"scripts"` block to:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "node --test \"lib/__tests__/*.test.mjs\""
  },
```

- [ ] **Step 2: Write the failing tests** in `lib/__tests__/slp.test.mjs`

```js
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module` / `ERR_MODULE_NOT_FOUND` for `../slp.js`.

- [ ] **Step 4: Implement `lib/slp.js`**

```js
import net from 'node:net';

export function writeVarInt(value) {
  const bytes = [];
  let v = value >>> 0;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v !== 0) b |= 0x80;
    bytes.push(b);
  } while (v !== 0);
  return Buffer.from(bytes);
}

// Returns { value, size } or null if buf ends mid-VarInt.
export function readVarInt(buf, offset = 0) {
  let value = 0;
  let shift = 0;
  let pos = offset;
  while (true) {
    if (pos >= buf.length) return null;
    const b = buf[pos++];
    value |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
    if (shift > 28) throw new Error('VarInt too long');
  }
  return { value, size: pos - offset };
}

export function buildPacket(id, payload) {
  const body = Buffer.concat([writeVarInt(id), payload]);
  return Buffer.concat([writeVarInt(body.length), body]);
}

// Returns the status JSON string, or null until the whole packet has arrived.
export function decodeStatusPacket(buf) {
  const len = readVarInt(buf, 0);
  if (!len || buf.length < len.size + len.value) return null;
  let off = len.size;
  const id = readVarInt(buf, off);
  off += id.size;
  if (id.value !== 0x00) throw new Error(`SLP: unexpected packet id ${id.value}`);
  const strLen = readVarInt(buf, off);
  off += strLen.size;
  return buf.subarray(off, off + strLen.value).toString('utf8');
}

export function flattenMotd(desc) {
  if (desc == null) return '';
  if (typeof desc === 'string') return desc.replace(/§./g, '');
  const own = flattenMotd(desc.text ?? '');
  const extra = Array.isArray(desc.extra) ? desc.extra.map(flattenMotd).join('') : '';
  return own + extra;
}

export function parseStatusResponse(json) {
  const s = JSON.parse(json);
  return {
    version: s.version?.name ?? '',
    motd: flattenMotd(s.description),
    playersOnline: s.players?.online ?? 0,
    playersMax: s.players?.max ?? 0,
    sample: Array.isArray(s.players?.sample) ? s.players.sample : [],
  };
}

function handshake(host, port) {
  const hostBuf = Buffer.from(host, 'utf8');
  const portBuf = Buffer.alloc(2);
  portBuf.writeUInt16BE(port);
  return buildPacket(0x00, Buffer.concat([
    writeVarInt(-1),               // protocol version: -1 = "just asking for status"
    writeVarInt(hostBuf.length), hostBuf,
    portBuf,
    writeVarInt(1),                // next state: status
  ]));
}

export function ping({ host, port = 25565, timeoutMs = 3000 }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let buf = Buffer.alloc(0);
    const socket = net.createConnection({ host, port });
    const finish = (err, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (err) reject(err); else resolve(val);
    };
    const timer = setTimeout(() => finish(new Error(`SLP timeout after ${timeoutMs}ms`)), timeoutMs);

    socket.on('connect', () => {
      socket.write(handshake(host, port));
      socket.write(buildPacket(0x00, Buffer.alloc(0)));
    });
    socket.on('data', chunk => {
      buf = Buffer.concat([buf, chunk]);
      try {
        const json = decodeStatusPacket(buf);
        if (json !== null) finish(null, parseStatusResponse(json));
      } catch (e) {
        finish(e);
      }
    });
    socket.on('error', e => finish(e));
    socket.on('close', () => finish(new Error('SLP: connection closed before response')));
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: all `slp.test.mjs` tests PASS. A `MODULE_TYPELESS_PACKAGE_JSON` warning is fine; don't add `"type": "module"`, because it would change how Next treats the project.

- [ ] **Step 6: Live smoke test against the real server**

Run: `node -e "import('./lib/slp.js').then(m => m.ping({ host: '192.168.68.151' })).then(r => console.log(r), e => console.error(e.message))"`
Expected: `{ version: '26.2', motd: 'JKMC', playersOnline: <n>, playersMax: 10, sample: [...] }`.

- [ ] **Step 7: Commit**

```bash
git add package.json lib/slp.js lib/__tests__/slp.test.mjs
git commit -m "feat(minecraft): hand-rolled Server List Ping client"
```

---

### Task 2: Exporter scrape + TPS (`lib/mcMetrics.js`)

**Files:**
- Create: `lib/mcMetrics.js`
- Test: `lib/__tests__/mcMetrics.test.mjs`

**Interfaces:**
- Produces: `parsePrometheus(text: string) → Map<string, Array<{ labels: object, value: number }>>`; `computeTps(prev: { sum, count } | null, curr: { sum, count }) → number | null`; `scrape({ url, timeoutMs = 3000 }) → Promise<{ tps: number | null, chunks: number, entities: number, players: Array<{ name, id }> }>`. `players` uses the same `{ name, id }` shape as the SLP `sample`.

- [ ] **Step 1: Write the failing tests** in `lib/__tests__/mcMetrics.test.mjs`

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `../mcMetrics.js`.

- [ ] **Step 3: Implement `lib/mcMetrics.js`**

```js
// Minimal Prometheus text-format parser: enough for the Paper exporter's output.
export function parsePrometheus(text) {
  const out = new Map();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([a-zA-Z_:][\w:]*)(?:\{(.*)\})?\s+(\S+)/);
    if (!m) continue;
    const [, name, labelStr, valStr] = m;
    const labels = {};
    if (labelStr) {
      for (const lm of labelStr.matchAll(/(\w+)="((?:[^"\\]|\\.)*)"/g)) {
        labels[lm[1]] = lm[2].replace(/\\(.)/g, '$1');
      }
    }
    if (!out.has(name)) out.set(name, []);
    out.get(name).push({ labels, value: Number(valStr) });
  }
  return out;
}

// Ticks-per-second from mc_server_tick_rate's cumulative sum/count.
export function computeTps(prev, curr) {
  if (prev && curr.count > prev.count && curr.sum >= prev.sum) {
    return (curr.sum - prev.sum) / (curr.count - prev.count);
  }
  return curr.count > 0 ? curr.sum / curr.count : null;
}

const sumOf = (m, name) => (m.get(name) ?? []).reduce((a, s) => a + s.value, 0);
const single = (m, name) => m.get(name)?.[0]?.value ?? 0;

// Previous counters, so TPS reflects the last poll interval rather than all-time.
let lastTick = null;

export async function scrape({ url, timeoutMs = 3000 }) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let text;
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) throw new Error(`exporter HTTP ${res.status}`);
    text = await res.text();
  } finally {
    clearTimeout(timer);
  }

  const m = parsePrometheus(text);
  const curr = { sum: single(m, 'mc_server_tick_rate_sum'), count: single(m, 'mc_server_tick_rate_count') };
  const tps = computeTps(lastTick, curr);
  lastTick = curr;

  return {
    tps,
    chunks: sumOf(m, 'mc_dimension_chunks_loaded'),
    entities: sumOf(m, 'mc_entities_total'),
    players: (m.get('mc_player_list') ?? [])
      .filter(s => s.value > 0)
      .map(s => ({ name: s.labels.name, id: s.labels.id })),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Live smoke test**

Run: `node -e "import('./lib/mcMetrics.js').then(m => m.scrape({ url: 'http://192.168.68.151:19565/metrics' })).then(r => console.log(r), e => console.error(e.message))"`
Expected: `tps` close to 20, `chunks` > 0, `entities` > 0, `players` matching who's online.

- [ ] **Step 6: Commit**

```bash
git add lib/mcMetrics.js lib/__tests__/mcMetrics.test.mjs
git commit -m "feat(minecraft): exporter scrape with TPS from counter deltas"
```

---

### Task 3: Player history (`lib/mcHistory.js`)

**Files:**
- Create: `lib/mcHistory.js`
- Modify: `.gitignore` (add `/data/`)
- Test: `lib/__tests__/mcHistory.test.mjs`

**Interfaces:**
- Consumes: player entries `{ name: string, uuid: string, bedrock: boolean }` (produced by Task 4's `normalizePlayer`; only `name` and `uuid` are read here).
- Produces: `emptyState() → { online: {}, peak: { date: null, count: 0 }, lastSeen: null }`; `localDate(nowMs, timeZone = 'America/Denver') → 'YYYY-MM-DD'`; `update(state, players, nowMs) → { state, changed: boolean }` (pure; `state.online[uuid] = { name, since }`); `peakToday(state, nowMs) → number`; `load(path = DEFAULT_PATH) → state`; `save(state, path = DEFAULT_PATH) → void`; `DEFAULT_PATH` = `<cwd>/data/mc-history.json`.

- [ ] **Step 1: Write the failing tests** in `lib/__tests__/mcHistory.test.mjs`

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `../mcHistory.js`.

- [ ] **Step 3: Implement `lib/mcHistory.js`**

```js
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const DEFAULT_PATH = join(process.cwd(), 'data', 'mc-history.json');

export function emptyState() {
  return { online: {}, peak: { date: null, count: 0 }, lastSeen: null };
}

export function localDate(nowMs, timeZone = 'America/Denver') {
  return new Date(nowMs).toLocaleDateString('en-CA', { timeZone });
}

// Pure: returns the next state and whether anything worth persisting changed.
export function update(state, players, nowMs) {
  const next = { online: {}, peak: { ...state.peak }, lastSeen: state.lastSeen };
  let changed = false;

  for (const p of players) {
    const prev = state.online[p.uuid];
    next.online[p.uuid] = { name: p.name, since: prev ? prev.since : nowMs };
    if (!prev) changed = true;
  }
  for (const [uuid, info] of Object.entries(state.online)) {
    if (!next.online[uuid]) {
      next.lastSeen = { name: info.name, at: nowMs };
      changed = true;
    }
  }

  const today = localDate(nowMs);
  if (next.peak.date !== today) {
    next.peak = { date: today, count: players.length };
    changed = true;
  } else if (players.length > next.peak.count) {
    next.peak.count = players.length;
    changed = true;
  }

  return { state: next, changed };
}

export function peakToday(state, nowMs) {
  return state.peak.date === localDate(nowMs) ? state.peak.count : 0;
}

export function load(path = DEFAULT_PATH) {
  try {
    const s = JSON.parse(readFileSync(path, 'utf8'));
    if (!s || typeof s.online !== 'object' || Array.isArray(s.online) || typeof s.peak !== 'object') {
      return emptyState();
    }
    return { online: s.online, peak: s.peak, lastSeen: s.lastSeen ?? null };
  } catch {
    return emptyState();
  }
}

// tmp-then-rename so a power cut can't leave a half-written file.
export function save(state, path = DEFAULT_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path + '.tmp', JSON.stringify(state));
  renameSync(path + '.tmp', path);
}
```

- [ ] **Step 4: Add `/data/` to `.gitignore`**

Append after the `config/credentials.json` line:

```
# runtime state (minecraft panel player history)
/data/
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/mcHistory.js lib/__tests__/mcHistory.test.mjs .gitignore
git commit -m "feat(minecraft): persisted player history (time online, daily peak, last seen)"
```

---

### Task 4: Player normalization (`lib/mcPlayers.js`)

**Files:**
- Create: `lib/mcPlayers.js`
- Test: `lib/__tests__/mcPlayers.test.mjs`

**Interfaces:**
- Consumes: SLP `sample` and exporter `players`, both `Array<{ name, id }>` (Tasks 1, 2).
- Produces: `normalizePlayer({ name, id }) → { name, uuid, bedrock } | null`; `resolvePlayers(sample, exporterPlayers | null, playersOnline) → Array<{ name, uuid, bedrock }>`.

- [ ] **Step 1: Write the failing tests** in `lib/__tests__/mcPlayers.test.mjs`

```js
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
  assert.deepEqual(resolvePlayers([], null, 2), []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `../mcPlayers.js`.

- [ ] **Step 3: Implement `lib/mcPlayers.js`**

```js
const FAKE_UUID = '00000000-0000-0000-0000-000000000000';
const FLOODGATE_UUID_PREFIX = '00000000-0000-0000-';

export function normalizePlayer({ name, id } = {}) {
  if (!name || !id || id === FAKE_UUID) return null;
  const bedrock = name.startsWith('.') || id.startsWith(FLOODGATE_UUID_PREFIX);
  return { name: name.replace(/^\./, ''), uuid: id, bedrock };
}

// SLP sample is authoritative; the exporter list covers servers that hide the sample.
export function resolvePlayers(sample, exporterPlayers, playersOnline) {
  if (playersOnline === 0) return [];
  const source = sample.length ? sample : (exporterPlayers ?? []);
  return source.map(normalizePlayer).filter(Boolean);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/mcPlayers.js lib/__tests__/mcPlayers.test.mjs
git commit -m "feat(minecraft): player normalization with Bedrock detection and exporter fallback"
```

---

### Task 5: Read-only Proxmox client (`lib/proxmox.js`), container + host

**Files:**
- Create: `lib/proxmox.js`
- Test: `lib/__tests__/proxmox.test.mjs`

**Interfaces:**
- Produces: `mapContainer(raw) → { status, cpuPct, cpus, memUsed, memMax, diskUsed, diskMax, uptime }` (all numbers except `status`); `findContainer(list, name) → raw | null`; `getContainer(name, { timeoutMs = 5000 } = {}) → Promise<mapContainer result>`; `mapHost(raw) → { cpuPct, cpus, memUsed, memMax, diskUsed, diskMax, uptime }` (from `/nodes/pve/status`: `cpu`, `cpuinfo.cpus`, `memory.{used,total}`, `rootfs.{used,total}`, `uptime`); `getHost({ timeoutMs = 5000 } = {}) → Promise<mapHost result>`. Reads env `PROXMOX_URL`, `PROXMOX_TOKEN_ID`, `PROXMOX_TOKEN_SECRET`, and the CA at `<cwd>/config/pve-root-ca.pem`.

- [ ] **Step 1: Write the failing tests** in `lib/__tests__/proxmox.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapContainer, findContainer, getContainer, mapHost, getHost } from '../proxmox.js';

const LIST = [
  { vmid: 102, name: 'claude-agent', status: 'running', cpu: 0.01, cpus: 2, mem: 1, maxmem: 2, disk: 1, maxdisk: 2, uptime: 5 },
  { vmid: 101, name: 'minecraft', status: 'running', cpu: 0.25, cpus: 4, mem: 5476083712, maxmem: 8589934592, disk: 8800000000, maxdisk: 21474836480, uptime: 273600 },
];

test('findContainer matches by name, not vmid', () => {
  assert.equal(findContainer(LIST, 'minecraft').vmid, 101);
  assert.equal(findContainer(LIST, 'nope'), null);
});

test('mapContainer converts cpu fraction to percent and coerces numbers', () => {
  assert.deepEqual(mapContainer({ ...LIST[1], mem: '5476083712' }), {
    status: 'running', cpuPct: 25, cpus: 4,
    memUsed: 5476083712, memMax: 8589934592,
    diskUsed: 8800000000, diskMax: 21474836480, uptime: 273600,
  });
});

test('mapHost flattens /nodes/pve/status', () => {
  const raw = {
    cpu: 0.12, uptime: 1036800, loadavg: ['0.5', '0.4', '0.3'],
    cpuinfo: { cpus: 8, model: 'x' },
    memory: { used: 19327352832, total: 33617092608, free: 1 },
    rootfs: { used: 40000000000, total: 100000000000, avail: 1 },
  };
  assert.deepEqual(mapHost(raw), {
    cpuPct: 12, cpus: 8, memUsed: 19327352832, memMax: 33617092608,
    diskUsed: 40000000000, diskMax: 100000000000, uptime: 1036800,
  });
});

test('getContainer/getHost reject without leaking anything when env is missing', async () => {
  const saved = { ...process.env };
  delete process.env.PROXMOX_URL;
  delete process.env.PROXMOX_TOKEN_ID;
  delete process.env.PROXMOX_TOKEN_SECRET;
  try {
    await assert.rejects(getContainer('minecraft'), /PROXMOX_\* env vars not set/);
    await assert.rejects(getHost(), /PROXMOX_\* env vars not set/);
  } finally { Object.assign(process.env, saved); }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `../proxmox.js`.

- [ ] **Step 3: Implement `lib/proxmox.js`**

```js
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Proxmox signs its node cert with its own CA; trust exactly that CA.
let _ca = null;
function ca() {
  if (!_ca) _ca = readFileSync(join(process.cwd(), 'config', 'pve-root-ca.pem'));
  return _ca;
}

export function findContainer(list, name) {
  return list.find(c => c.name === name) ?? null;
}

export function mapContainer(ct) {
  return {
    status: ct.status,
    cpuPct: Number(ct.cpu) * 100,   // Proxmox reports a fraction of the CT's allotted cpus
    cpus: Number(ct.cpus),
    memUsed: Number(ct.mem),
    memMax: Number(ct.maxmem),
    diskUsed: Number(ct.disk),
    diskMax: Number(ct.maxdisk),
    uptime: Number(ct.uptime),
  };
}

function getJson(path, timeoutMs) {
  const { PROXMOX_URL, PROXMOX_TOKEN_ID, PROXMOX_TOKEN_SECRET } = process.env;
  if (!PROXMOX_URL || !PROXMOX_TOKEN_ID || !PROXMOX_TOKEN_SECRET) {
    return Promise.reject(new Error('PROXMOX_* env vars not set'));
  }
  const url = new URL(`/api2/json${path}`, PROXMOX_URL);
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      ca: ca(),
      headers: { Authorization: `PVEAPIToken=${PROXMOX_TOKEN_ID}=${PROXMOX_TOKEN_SECRET}` },
      timeout: timeoutMs,
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { body += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`Proxmox HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(body).data); } catch { reject(new Error('Proxmox: invalid JSON')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`Proxmox timeout after ${timeoutMs}ms`)));
    req.on('error', reject);
  });
}

export async function getContainer(name, { timeoutMs = 5000 } = {}) {
  const list = await getJson('/nodes/pve/lxc', timeoutMs);
  const ct = findContainer(list ?? [], name);
  if (!ct) throw new Error(`Proxmox: container "${name}" not found`);
  return mapContainer(ct);
}

export function mapHost(st) {
  return {
    cpuPct: Number(st.cpu) * 100,   // fraction of all host cores
    cpus: Number(st.cpuinfo?.cpus),
    memUsed: Number(st.memory?.used),
    memMax: Number(st.memory?.total),
    diskUsed: Number(st.rootfs?.used),
    diskMax: Number(st.rootfs?.total),
    uptime: Number(st.uptime),
  };
}

export async function getHost({ timeoutMs = 5000 } = {}) {
  return mapHost(await getJson('/nodes/pve/status', timeoutMs));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/proxmox.js lib/__tests__/proxmox.test.mjs
git commit -m "feat(minecraft): read-only Proxmox client (container + host) with CA-pinned TLS"
```

---

### Task 6: Infrastructure: Proxmox token + CA cert (Pi and dev machine)

No code. Each command must keep the token secret out of the terminal output. **Use Windows OpenSSH** (`/c/Windows/System32/OpenSSH/ssh.exe`) for the Proxmox host, because Git Bash's `ssh` can't see the agent that holds Luke's key. Below, `WSSH=/c/Windows/System32/OpenSSH/ssh.exe`, `WSCP=/c/Windows/System32/OpenSSH/scp.exe`, `PI="-i $HOME/.ssh/id_ed25519_dashy swahekul@192.168.68.62"`.

**Files:** none in git. Writes to the Pi's `~/dashy-v2/.env.local` and `~/dashy-v2/config/pve-root-ca.pem`, and to the local `.env.local` and `config/pve-root-ca.pem`.

- [ ] **Step 1: Pre-flight (read-only).** Confirm the user doesn't already exist and the Pi is reachable:

```bash
$WSSH root@192.168.68.150 'pveum user list --output-format json' | grep -o '"userid":"[^"]*"'
$WSSH $PI 'grep -c "^PROXMOX_" ~/dashy-v2/.env.local || true'
```

Expected: no `dashy@pve` in the list, and a `0` count on the Pi. If either already exists, STOP and ask Luke.

- [ ] **Step 2: Create the user and read-only ACL**

```bash
$WSSH root@192.168.68.150 'pveum user add dashy@pve --comment "Dashy read-only" && pveum acl modify / --users dashy@pve --roles PVEAuditor && echo ok'
```

Expected: `ok`.

- [ ] **Step 3: Create the token and pipe it straight into the Pi's `.env.local`.** The secret goes host → pipe → Pi and is never printed. The `perl` call uses core `JSON::PP`, which is always present on PVE.

```bash
$WSSH root@192.168.68.150 'pveum user token add dashy@pve dashy --privsep 0 --output-format json | perl -MJSON::PP -e "local \$/; my \$j = decode_json(<STDIN>); print \"\\nPROXMOX_URL=https://192.168.68.150:8006\\nPROXMOX_TOKEN_ID=dashy\@pve!dashy\\nPROXMOX_TOKEN_SECRET=\$j->{value}\\n\""' \
  | $WSSH $PI 'cat >> ~/dashy-v2/.env.local && grep -c "^PROXMOX_" ~/dashy-v2/.env.local'
```

Expected: the only output is `3`. Verify without revealing the secret:

```bash
$WSSH $PI 'grep "^PROXMOX_" ~/dashy-v2/.env.local | sed "s/\(SECRET=\).*/\1<redacted>/"'
```

Expected: the URL, `PROXMOX_TOKEN_ID=dashy@pve!dashy`, and `PROXMOX_TOKEN_SECRET=<redacted>`.

- [ ] **Step 4: Copy the same three lines to the local dev `.env.local`** (Pi → local file, never printed):

```bash
$WSSH $PI 'grep "^PROXMOX_" ~/dashy-v2/.env.local' >> "C:/Users/lthaw/Documents/Personal Projects/dashy-v2/.env.local"
grep -c '^PROXMOX_' "C:/Users/lthaw/Documents/Personal Projects/dashy-v2/.env.local"
```

Expected: `3`.

- [ ] **Step 5: Copy the CA cert to both places**

```bash
$WSCP root@192.168.68.150:/etc/pve/pve-root-ca.pem "C:/Users/lthaw/Documents/Personal Projects/dashy-v2/config/pve-root-ca.pem"
$WSCP -i "$HOME/.ssh/id_ed25519_dashy" "C:/Users/lthaw/Documents/Personal Projects/dashy-v2/config/pve-root-ca.pem" swahekul@192.168.68.62:dashy-v2/config/pve-root-ca.pem
git -C "C:/Users/lthaw/Documents/Personal Projects/dashy-v2" check-ignore config/pve-root-ca.pem
```

Expected: the last command prints `config/pve-root-ca.pem` (ignored via `*.pem`).

- [ ] **Step 6: Verify TLS + token from the dev machine** using Task 5's code:

```bash
cd "C:/Users/lthaw/Documents/Personal Projects/dashy-v2" && node --env-file=.env.local -e "import('./lib/proxmox.js').then(m => Promise.all([m.getContainer('minecraft'), m.getHost()])).then(r => console.log(r), e => console.error(e.message))"
```

Expected: `[{ status: 'running', cpuPct: ..., ... }, { cpuPct: ..., cpus: <host cores>, memMax: <host RAM>, ... }]`. Every host number must be finite (not `NaN`). A `NaN` means the `/nodes/pve/status` field names differ on PVE 9.2, so fix `mapHost` to match the real payload (and its test) before moving on. A `self-signed certificate` error means the CA file is wrong: re-copy it, and don't disable verification. `Proxmox HTTP 401` means the token line is wrong.

- [ ] **Step 7: Prove the token is read-only, without attempting any write.** Never test by sending a power or config action: a misconfigured ACL would take the live server down. Instead, ask Proxmox which privileges the token actually has:

```bash
node --env-file=.env.local -e "const https=require('https'),fs=require('fs');https.get(process.env.PROXMOX_URL+'/api2/json/access/permissions',{ca:fs.readFileSync('config/pve-root-ca.pem'),headers:{Authorization:'PVEAPIToken='+process.env.PROXMOX_TOKEN_ID+'='+process.env.PROXMOX_TOKEN_SECRET}},r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>{const p=JSON.parse(b).data;const privs=new Set(Object.values(p).flatMap(o=>Object.keys(o)));const bad=[...privs].filter(x=>!/\.(Audit|Read)$/.test(x)&&x!=='Mapping.Use'&&!x.startsWith('SDN.Audit'));console.log('privs:',[...privs].sort().join(' '));console.log(bad.length?'NOT READ-ONLY: '+bad.join(' '):'read-only OK');});});"
```

Expected: `read-only OK`, with privileges like `Datastore.Audit Sys.Audit VM.Audit …`. If any non-Audit/Read privilege appears (for example `VM.PowerMgmt`), STOP, revoke the token (`pveum user token remove dashy@pve dashy`) and tell Luke.

Nothing to commit.

---

### Task 7: API route (`pages/api/minecraft.js`) + settings

**Files:**
- Create: `pages/api/minecraft.js`
- Modify: `config/settings.json` (add `minecraft` block)

**Interfaces:**
- Consumes: `ping` (Task 1), `scrape` (Task 2), `load`/`save`/`update`/`peakToday` (Task 3), `resolvePlayers` (Task 4), `getContainer`, `getHost` (Task 5).
- Produces: `GET /api/minecraft` →
  ```js
  {
    mc: { online: true, version, motd, playersOnline, playersMax,
          players: [{ name, uuid, bedrock, onlineSince }] } | { online: false },
    tps: { tps, chunks, entities } | null,
    ct: { status, cpuPct, cpus, memUsed, memMax, diskUsed, diskMax, uptime } | null,
    host: { cpuPct, cpus, memUsed, memMax, diskUsed, diskMax, uptime } | null,
    history: { peakToday: number, lastSeen: { name, at } | null },
  }
  ```
  `players` is sorted by `onlineSince` ascending (the longest-online player first).

- [ ] **Step 1: Add the settings block.** In `config/settings.json`, add a top-level key after `"gasPrices"` (keep the existing keys unchanged):

```json
  "minecraft": {
    "host": "192.168.68.151",
    "port": 25565,
    "metricsPort": 19565,
    "container": "minecraft"
  }
```

Remember the comma after the closing `}` of `gasPrices`. Validate with:
`node -e "console.log(require('./config/settings.json').minecraft)"`
Expected: the object prints.

- [ ] **Step 2: Implement `pages/api/minecraft.js`**

```js
import settings from '../../config/settings.json';
import { ping } from '../../lib/slp';
import { scrape } from '../../lib/mcMetrics';
import { getContainer, getHost } from '../../lib/proxmox';
import { resolvePlayers } from '../../lib/mcPlayers';
import { load, save, update, peakToday } from '../../lib/mcHistory';

let history = null;
// Log each failure once when it starts, not every 30s while it lasts.
const lastError = {};

function report(part, result) {
  const msg = result.status === 'rejected' ? (result.reason?.message ?? String(result.reason)) : null;
  if (msg && msg !== lastError[part]) console.error(`[minecraft] ${part}: ${msg}`);
  if (!msg && lastError[part]) console.log(`[minecraft] ${part}: recovered`);
  lastError[part] = msg;
}

export default async function handler(req, res) {
  const cfg = settings.minecraft;
  if (!cfg?.host) return res.status(503).json({ error: 'minecraft not configured' });

  const [slp, metrics, ct, host] = await Promise.allSettled([
    ping({ host: cfg.host, port: cfg.port }),
    scrape({ url: `http://${cfg.host}:${cfg.metricsPort}/metrics` }),
    getContainer(cfg.container),
    getHost(),
  ]);
  report('slp', slp);
  report('metrics', metrics);
  report('proxmox-ct', ct);
  report('proxmox-host', host);

  if (!history) history = load();
  const now = Date.now();

  let mc = { online: false };
  if (slp.status === 'fulfilled') {
    const s = slp.value;
    const exporterPlayers = metrics.status === 'fulfilled' ? metrics.value.players : null;
    const players = resolvePlayers(s.sample, exporterPlayers, s.playersOnline);

    const next = update(history, players, now);
    history = next.state;
    if (next.changed) {
      try { save(history); } catch (e) { console.error('[minecraft] history save:', e.message); }
    }

    mc = {
      online: true,
      version: s.version,
      motd: s.motd,
      playersOnline: s.playersOnline,
      playersMax: s.playersMax,
      players: players
        .map(p => ({ ...p, onlineSince: history.online[p.uuid].since }))
        .sort((a, b) => a.onlineSince - b.onlineSince),
    };
  }

  res.json({
    mc,
    tps: metrics.status === 'fulfilled'
      ? { tps: metrics.value.tps, chunks: metrics.value.chunks, entities: metrics.value.entities }
      : null,
    ct: ct.status === 'fulfilled' ? ct.value : null,
    host: host.status === 'fulfilled' ? host.value : null,
    history: { peakToday: peakToday(history, now), lastSeen: history.lastSeen },
  });
}
```

- [ ] **Step 3: Run it locally.** Start the dev server in the background (`npm run dev`, which picks up `.env.local`), then:

Run: `curl -s localhost:3000/api/minecraft`
Expected: `mc.online: true` with the correct version/players, `tps` filled (TPS near 20), `ct` filled (`status: "running"`), `host` filled (host `memMax` larger than the container's), and `history.peakToday` ≥ the current player count. Also confirm `data/mc-history.json` now exists and `git status` doesn't list it.

- [ ] **Step 4: Check that each part fails on its own.** Temporarily edit `config/settings.json`, one at a time, restoring after each:
  - `"metricsPort": 1` → expect `tps: null`, with `mc` and `ct` still filled, and a single `[minecraft] metrics:` log line across several requests.
  - `"container": "nope"` → expect `ct: null` but `host` still filled, with the log line `[minecraft] proxmox-ct: ... container "nope" not found`.
  - Temporarily rename `config/pve-root-ca.pem` → expect both `ct: null` and `host: null` (a CA read error, **not** a silent fallback to unverified TLS), with `mc`/`tps` still filled. Rename it back.
  - `"port": 1` → expect `mc: { online: false }`, with `history.lastSeen` intact, and the response arriving in < 6s.

  Restore `settings.json` and run `git diff config/settings.json` to confirm only the `minecraft` block was added.

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add pages/api/minecraft.js config/settings.json
git commit -m "feat(minecraft): /api/minecraft route merging SLP, exporter, Proxmox and history"
```

---

### Task 8: Screen + formatters + wiring

**Files:**
- Create: `lib/mcFormat.js`, `screens/Minecraft.jsx`
- Modify: `pages/index.js` (lines 1-12 imports, 14-20 `PANELS`, 28-41 `REFRESH_MS`, 55-60 initial `data`, 174-181 render)
- Modify: `screens/StatusBar.jsx` (lines 1-17)
- Test: `lib/__tests__/mcFormat.test.mjs`

**Interfaces:**
- Consumes: the `/api/minecraft` response contract from Task 7.
- Produces: `fmtDuration(ms) → string` (`'<1m'`, `'5m'`, `'1h12m'`, `'3d 4h'`); `fmtAgo(ms) → string` (`'just now'`, `'5m ago'`, `'2h ago'`, `'3d ago'`); `fmtGB(bytes) → string` (1 decimal); `tpsColor(tps) → hex | null` (`#4caf50` ≥19, `#ffc107` ≥15, `#f44336` below 15, `null` for null).

- [ ] **Step 1: Write the failing tests** in `lib/__tests__/mcFormat.test.mjs`

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `../mcFormat.js`.

- [ ] **Step 3: Implement `lib/mcFormat.js`**

```js
const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;

export function fmtDuration(ms) {
  if (ms < MIN) return '<1m';
  if (ms < HOUR) return `${Math.floor(ms / MIN)}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h${Math.floor((ms % HOUR) / MIN)}m`;
  return `${Math.floor(ms / DAY)}d ${Math.floor((ms % DAY) / HOUR)}h`;
}

export function fmtAgo(ms) {
  if (ms < MIN) return 'just now';
  if (ms < HOUR) return `${Math.floor(ms / MIN)}m ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h ago`;
  return `${Math.floor(ms / DAY)}d ago`;
}

export function fmtGB(bytes) {
  return (bytes / 1024 ** 3).toFixed(1);
}

export function tpsColor(tps) {
  if (tps == null) return null;
  if (tps >= 19) return '#4caf50';
  if (tps >= 15) return '#ffc107';
  return '#f44336';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Create `screens/Minecraft.jsx`**

```jsx
import { useState, useEffect } from 'react';
import { fmtDuration, fmtAgo, fmtGB, tpsColor } from '../lib/mcFormat';

const GREEN = '#4caf50';
const RED = '#f44336';
const GRAY = '#444';
const LABEL = { color: '#9aa0a6', fontSize: '1.8vw', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' };

function PanelLoading() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', paddingLeft: '4vw' }}>
      <span style={{ color: '#333', fontFamily: 'monospace', fontSize: '2vw', letterSpacing: '0.2em' }}>JKMC</span>
    </div>
  );
}

function Avatar({ player }) {
  const [failed, setFailed] = useState(false);
  const box = { width: '6vh', height: '6vh', borderRadius: '4px', flexShrink: 0 };
  if (player.bedrock || failed) return <div style={{ ...box, background: '#2a2a2a' }} />;
  return (
    <img
      src={`https://mc-heads.net/avatar/${player.uuid}/32`}
      alt=""
      onError={() => setFailed(true)}
      style={{ ...box, imageRendering: 'pixelated' }}
    />
  );
}

function PlayerRow({ player, now }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1vw', minWidth: 0 }}>
      <Avatar player={player} />
      <span style={{ color: '#fff', fontSize: '2.2vw', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {player.name}
      </span>
      {player.bedrock && (
        <span style={{ color: '#000', background: '#9aa0a6', fontSize: '1.3vw', fontWeight: 700, padding: '0 0.5vw', borderRadius: '3px' }}>BE</span>
      )}
      <span style={{ marginLeft: 'auto', color: '#9aa0a6', fontSize: '1.8vw', flexShrink: 0 }}>
        {now ? fmtDuration(now - player.onlineSince) : ''}
      </span>
    </div>
  );
}

function LastSeen({ lastSeen, now }) {
  if (!lastSeen || !now) return null;
  return (
    <div style={{ color: '#9aa0a6', fontSize: '1.8vw' }}>
      last seen: {lastSeen.name} · {fmtAgo(now - lastSeen.at)}
    </div>
  );
}

function Players({ mc, history, now }) {
  const card = { background: '#111', borderRadius: '8px', padding: '2vh 1.5vw', display: 'flex', flexDirection: 'column', gap: '1.5vh', minHeight: 0 };

  if (!mc.online) {
    return (
      <div style={{ ...card, justifyContent: 'center' }}>
        <div style={{ color: RED, fontSize: '4.5vw', fontWeight: 700, letterSpacing: '0.08em' }}>OFFLINE</div>
        <LastSeen lastSeen={history.lastSeen} now={now} />
      </div>
    );
  }
  if (mc.players.length === 0) {
    return (
      <div style={{ ...card, justifyContent: 'center' }}>
        <div style={{ color: '#fff', fontSize: '2.8vw', fontWeight: 500 }}>Nobody&apos;s on</div>
        <LastSeen lastSeen={history.lastSeen} now={now} />
      </div>
    );
  }
  return (
    <div style={{
      ...card,
      display: 'grid', alignContent: 'start', columnGap: '1.5vw',
      gridTemplateColumns: mc.players.length > 5 ? '1fr 1fr' : '1fr',
    }}>
      {mc.players.map(p => <PlayerRow key={p.uuid} player={p} now={now} />)}
    </div>
  );
}

function Tile({ label, value, sub, accent, bar }) {
  return (
    <div style={{ background: '#111', borderRadius: '8px', overflow: 'hidden', display: 'flex', minHeight: 0 }}>
      <div style={{ width: '5px', flexShrink: 0, background: accent ?? GRAY }} />
      <div style={{ flex: 1, padding: '0 1.5vw', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.6vh' }}>
        <div style={LABEL}>{label}</div>
        <div style={{ color: '#fff', fontSize: '3.5vw', fontWeight: 500, lineHeight: 1 }}>{value}</div>
        {bar != null && (
          <div style={{ height: '0.8vh', background: '#222', borderRadius: '2px' }}>
            <div style={{ width: `${Math.min(100, bar * 100)}%`, height: '100%', background: accent ?? GRAY, borderRadius: '2px' }} />
          </div>
        )}
        {sub && <div style={{ color: '#9aa0a6', fontSize: '1.6vw' }}>{sub}</div>}
      </div>
    </div>
  );
}

function Stats({ tps, ct, host }) {
  const dash = '—';
  const memFrac = ct ? ct.memUsed / ct.memMax : null;
  const hostMemFrac = host ? host.memUsed / host.memMax : null;
  const cpuSub = [ct && `${ct.cpus}c`, host && `host ${Math.round(host.cpuPct)}%`].filter(Boolean).join(' · ') || null;
  const ramSub = host ? `host ${fmtGB(host.memUsed)}/${fmtGB(host.memMax)}G` : null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '10px', minHeight: 0 }}>
      <Tile label="TPS" value={tps?.tps != null ? tps.tps.toFixed(1) : dash} accent={tpsColor(tps?.tps)} />
      <Tile label="CPU" value={ct ? `${Math.round(ct.cpuPct)}%` : dash} sub={cpuSub} accent={ct ? GREEN : null} />
      <Tile
        label="RAM"
        value={ct ? `${fmtGB(ct.memUsed)}/${fmtGB(ct.memMax)}G` : dash}
        sub={ramSub}
        bar={memFrac}
        accent={ct ? (memFrac > 0.9 || hostMemFrac > 0.9 ? RED : GREEN) : null}
      />
      <Tile
        label="World"
        value={tps ? `${tps.chunks} ch` : dash}
        sub={tps ? `${tps.entities} entities` : null}
        accent={tps ? GREEN : null}
      />
    </div>
  );
}

function Footer({ ct, host }) {
  const muted = { color: '#9aa0a6' };
  const alert = { color: RED, fontWeight: 700 };
  const pct = (used, max) => Math.round((used / max) * 100);

  let ctPart = <span style={{ color: '#555' }}>CT —</span>;
  if (ct) {
    const running = ct.status === 'running';
    ctPart = (
      <span style={running ? muted : alert}>
        {running ? `CT up ${fmtDuration(ct.uptime * 1000)}` : `CT ${ct.status.toUpperCase()}`} · disk {pct(ct.diskUsed, ct.diskMax)}%
      </span>
    );
  }

  let hostPart = <span style={{ color: '#555' }}>host —</span>;
  if (host) {
    const diskPct = pct(host.diskUsed, host.diskMax);
    hostPart = (
      <span style={diskPct > 90 ? alert : muted}>
        host up {fmtDuration(host.uptime * 1000)} · disk {diskPct}%
      </span>
    );
  }

  return (
    <div style={{ fontSize: '1.6vw', whiteSpace: 'nowrap', overflow: 'hidden' }}>
      {ctPart}<span style={muted}> · </span>{hostPart}
    </div>
  );
}

export default function Minecraft({ data }) {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  if (!data) return <PanelLoading />;
  const { mc, tps, ct, host, history } = data;

  return (
    <div style={{
      width: '100%', height: '100%', background: '#000',
      padding: '3vh 5vw', display: 'flex', flexDirection: 'column', gap: '1.5vh',
      fontFamily: 'Arial, Helvetica, sans-serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '1.5vw' }}>
        <span style={{ ...LABEL, fontSize: '2vw', letterSpacing: '0.12em' }}>JKMC</span>
        <span style={{ color: mc.online ? GREEN : RED, fontSize: '1.8vw', fontWeight: 700 }}>
          ● {mc.online ? 'ONLINE' : 'OFFLINE'}
        </span>
        {mc.online && <span style={{ color: '#9aa0a6', fontSize: '1.8vw' }}>{mc.version}</span>}
        <span style={{ marginLeft: 'auto', color: '#fff', fontSize: '2vw', fontWeight: 500 }}>
          {mc.online ? `${mc.playersOnline}/${mc.playersMax}` : ''}
          <span style={{ color: '#9aa0a6', fontWeight: 400 }}> · peak {history.peakToday}</span>
        </span>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', minHeight: 0 }}>
        <Players mc={mc} history={history} now={now} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1vh', minHeight: 0 }}>
          <div style={{ flex: 1, display: 'grid', minHeight: 0 }}><Stats tps={tps} ct={ct} host={host} /></div>
          <Footer ct={ct} host={host} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Wire the panel into `pages/index.js`**

Add the import after `import Camera from '../screens/Camera';`:

```js
import Minecraft from '../screens/Minecraft';
```

Change `PANELS` (lines 14-20) to:

```js
const PANELS = [
  'weather', 'calendar', 'gmail',
  // 'news-world', 'news-gaming', 'news-tech', 'news-sports', 'news-utah',
  // 'steam-sales', 'steam-releases',
  // 'stocks',
  'portfolio',
  'minecraft',
];
```

In `REFRESH_MS`, after `portfolio: 60 * 60 * 1000,` add:

```js
  minecraft:         30 * 1000,
```

In the initial `useState` data object, change `steamData: null, stocks: null, portfolio: null,` to:

```js
    steamData: null, stocks: null, portfolio: null, minecraft: null,
```

In the render block, after the `portfolio` line add:

```jsx
            {current === 'minecraft'      && <Minecraft     data={data.minecraft} />}
```

- [ ] **Step 7: Add the StatusBar segment** in `screens/StatusBar.jsx`

In `SEGMENT_MAP`, after `portfolio: { segment: 'PORTFOLIO' },` add:

```js
  minecraft:        { segment: 'JKMC' },
```

Change line 17 to:

```js
const SEGMENTS = ['WEATHER', 'CALENDAR', 'GMAIL', 'PORTFOLIO', 'JKMC', 'CAMERA'];
```

- [ ] **Step 8: Check visually at 800×480 locally.** With `npm run dev` running, use Playwright: resize to 800×480, open `http://localhost:3000`, and press `ArrowLeft` once (minecraft is last in the rotation, so going left from weather lands on it). Take a screenshot. Check:
  - The header, players and tiles all fit without overflow or clipping. The StatusBar shows `JKMC` highlighted.
  - Avatars load. Times show (`<1m`, `5m`, …).
  - The CPU/RAM tiles show `host …` sub-lines without clipping, and the footer fits on one line.
  - No hydration warnings in the browser console.
  Then temporarily set `"metricsPort": 1` and `"port": 1` in `settings.json`, reload, and screenshot the "—" tiles and the `OFFLINE` + "last seen" states. Restore `settings.json` and confirm with `git diff config/settings.json` that it's unchanged from the Task 7 commit.

  If anything overflows, adjust only `vw`/`vh` sizes in `Minecraft.jsx` and re-screenshot.

- [ ] **Step 9: Build check**

Run: `npm run build`
Expected: the build succeeds with no errors referencing `Minecraft.jsx` or `pages/api/minecraft.js`.

- [ ] **Step 10: Run all tests and commit**

```bash
npm test
git add lib/mcFormat.js lib/__tests__/mcFormat.test.mjs screens/Minecraft.jsx pages/index.js screens/StatusBar.jsx
git commit -m "feat(minecraft): JKMC panel screen, StatusBar segment and rotation wiring"
```

---

### Task 9: Docs, deploy and on-device verification

**Files:**
- Modify: `CLAUDE.md` (the `## Project` and `## Config Files` sections)
- Modify: `README.md`

- [ ] **Step 1: Update `CLAUDE.md`.** Replace the `## Project` section's opening line and bullet list (from "Passive auto-rotating…" through the "A **StatusBar**…" line) with:

```markdown
Passive auto-rotating Next.js 16.2.6 (Turbopack) dashboard for Raspberry Pi 3B+ (800×480). Active panels (`PANELS` in `pages/index.js`) cycle every 10s:

- **weather** — current temp/condition/wind + 4-slot hourly forecast cards (Open-Meteo)
- **calendar** — upcoming Google Calendar + Outlook ICS events grouped by date
- **gmail** — unread count + message previews (Google Gmail API)
- **portfolio** — SnapTrade account values with daily change
- **minecraft** — JKMC server: player list (avatars, time online, Bedrock badge, daily peak, last seen) + TPS, the `minecraft` LXC container's CPU/RAM/disk/uptime, and the Proxmox host's CPU/RAM/disk/uptime

Disabled but still in the code (commented out in `PANELS`): news-*, steam-*, stocks. The **camera** overlay toggles with Escape.

A **StatusBar** at the bottom highlights the active segment (WEATHER / CALENDAR / GMAIL / PORTFOLIO / JKMC / CAMERA).

### JKMC panel data sources (all LAN-only, fetched server-side by `/api/minecraft`)

- Server List Ping → `192.168.68.151:25565` (`lib/slp.js`)
- Prometheus exporter plugin (drewburr `prometheus-exporter-paper`) → `http://192.168.68.151:19565/metrics` (`lib/mcMetrics.js`). On Paper its tick-seconds metric is the inter-tick interval, **not MSPT**, so only TPS is shown.
- Proxmox API → `https://192.168.68.150:8006` (`/nodes/pve/lxc` + `/nodes/pve/status`), read-only `dashy@pve!dashy` token (`PVEAuditor`), TLS pinned to `config/pve-root-ca.pem` (`lib/proxmox.js`)
- Player history persists in `data/mc-history.json` (gitignored)
- Tests: `npm test` (node:test, `lib/__tests__/`)
```

In `## Config Files`, change the `settings.json` bullet to also mention the `minecraft` block, and add these two bullets:

```markdown
- `config/settings.json` — tracked in git, non-sensitive: lat/lon for Open-Meteo weather, `tickers`, `gasPrices.stations`, and `minecraft` (`host`, `port`, `metricsPort`, `container`) for the JKMC panel
- `.env.local` — also holds `PROXMOX_URL`, `PROXMOX_TOKEN_ID`, `PROXMOX_TOKEN_SECRET` (read-only Proxmox token; Pi + dev machine only, never commit or print)
- `config/pve-root-ca.pem` — gitignored (`*.pem`), copy of the Proxmox host's `/etc/pve/pve-root-ca.pem`; must be placed on the Pi by hand
```

- [ ] **Step 2: Update `README.md`.** Read it first. Add a `JKMC (Minecraft)` entry wherever the README lists panels, with one paragraph: what it shows, that it needs the `PROXMOX_*` env vars + `config/pve-root-ca.pem` (by hand, not in git) and the `minecraft` settings block, and that the routes are LAN-only. If the README lists env vars, add the three `PROXMOX_*` names there too (names only, no values). If the README gives the Pi as `.59`, correct it to `.62` (per CLAUDE.md, the address in use).

- [ ] **Step 3: Commit the docs**

```bash
git add CLAUDE.md README.md
git commit -m "docs: JKMC panel, current panel list, Proxmox env vars"
```

- [ ] **Step 4: Ask Luke before pushing.** The branch is `master`, and the Pi deploys from it. When he confirms, run `git push`.

- [ ] **Step 5: Deploy to the Pi** (from PowerShell, per CLAUDE.md), then reboot. Per project memory, a reboot is required for changes to apply:

```powershell
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 'export PATH=/home/swahekul/.nvm/versions/node/v20.20.2/bin:$PATH && cd ~/dashy-v2 && git pull && npm run build && sudo reboot'
```

Expected: the build succeeds, then the connection drops on reboot.

- [ ] **Step 6: Verify on the Pi** (after about 90s):

```bash
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 'curl -s localhost:3000/api/minecraft | head -c 600; echo; grep "\[minecraft\]" ~/dashy.log | tail -5'
```

Expected: JSON with `mc.online: true`, plus `tps`, `ct` and `host` filled. No recurring `[minecraft]` errors. (If `proxmox: ... certificate` errors show, the CA file on the Pi is missing or wrong, so repeat Task 6 Step 5.)

- [ ] **Step 7: Confirm the route isn't exposed through the tunnel**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://dashy.lukehaws.com/api/minecraft
ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 'cat /etc/cloudflared/config.yml'
```

Expected: `404`, and the ingress lists only the `/api/claude-notify` path rule plus the 404 catch-all. Read only; don't edit.

- [ ] **Step 8: Check on the real screen with Luke.** Ask him to look at the physical 800×480 display when JKMC rotates in: are the text sizes readable from across the room, do avatars load, and is the BE badge visible if a Bedrock friend is on? Apply any size tweaks to `screens/Minecraft.jsx`, commit, and redeploy with Steps 4-6.
