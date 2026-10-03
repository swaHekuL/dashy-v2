# JKMC Panel — Design

**Date:** 2026-10-02
**Status:** Approved in brainstorming, pending spec review

## Goal

One new rotating Dashy panel, **JKMC**, that shows at a glance who is playing on Luke's Minecraft server (left half) and how healthy the server is (right half). Shown on the Pi's 800×480 screen in the existing rotate-every-10s style.

## Decisions (from brainstorming)

| Topic | Decision |
| --- | --- |
| Panel count | One panel, `minecraft`, StatusBar segment **JKMC** |
| Left half | Player list: head avatar, name, time online, Bedrock badge. Header shows `N/max · peak today`. Empty state: "Nobody's on" with the last player seen and how long ago |
| Right half | 2×2 stat tiles: **TPS**, **CPU**, **RAM**, **WORLD** (chunks + entities), plus a footer line with container uptime and disk % |
| Lag stat | TPS only. No MSPT: on Paper, the exporter measures the interval *between* ticks, not the work done in each tick, so a true MSPT figure isn't available (see "Exporter notes") |
| Host stats | Not shown. Only the `minecraft` container (CT 101) |
| Architecture | Option A: one API route plus small single-purpose helpers in `lib/` |
| Proxmox token | Created by Claude over SSH and piped directly into the Pi's `.env.local` (never echoed) |

## Network / data path

```
Pi kiosk browser ──localhost──> Next.js on Pi ──LAN──> 192.168.68.151:25565  (Server List Ping)
                                               ├─LAN──> 192.168.68.151:19565  (Prometheus exporter /metrics)
                                               └─LAN──> 192.168.68.150:8006   (Proxmox API, read-only token)
```

No tunnel is involved. The Cloudflare tunnel's ingress routes only `/api/claude-notify`, so `/api/minecraft` isn't reachable from the internet. Verify this in `/etc/cloudflared/config.yml` during deployment; don't change it.

## Components

### `lib/slp.js`: Minecraft Server List Ping
- `ping({ host, port, timeoutMs = 3000 }) → { version, motd, playersOnline, playersMax, sample: [{ name, id }] }`, which throws on timeout or error.
- Hand-rolled over `node:net`: handshake packet (protocol version `-1`, next state 1) + status request, then read the VarInt-length-prefixed JSON response. No npm dependency.
- Exports pure helpers (`writeVarInt`, `readVarInt`, `parseStatusResponse`) for unit tests.
- `motd` is flattened to plain text (the description can be a string or a chat-component object).

### `lib/mcMetrics.js`: exporter scrape + TPS
- `parsePrometheus(text) → Map<name, [{ labels, value }]>`: a minimal text-format parser that ignores `#` lines.
- `computeTps(prev, curr)`: `curr`/`prev` are `{ sum, count }` from `mc_server_tick_rate_{sum,count}`.
  - With a previous sample and `curr.count > prev.count`: `(curr.sum - prev.sum) / (curr.count - prev.count)`.
  - With no previous sample, or if the counters went backward (MC restarted): `curr.sum / curr.count` (lifetime average).
  - If `count` is 0: `null`.
- `scrape({ url, timeoutMs = 3000 }) → { tps, chunks, entities }`. `chunks` = sum of `mc_dimension_chunks_loaded`, `entities` = sum of `mc_entities_total`. The previous tick-rate counters are held at module scope.

### `lib/proxmox.js`: read-only Proxmox client
- `getContainer(name) → { status, cpuPct, cpus, memUsed, memMax, diskUsed, diskMax, uptime }`.
- `GET {PROXMOX_URL}/api2/json/nodes/pve/lxc`, header `Authorization: PVEAPIToken={PROXMOX_TOKEN_ID}={PROXMOX_TOKEN_SECRET}`, then the entry where `name === 'minecraft'` (not hardcoded vmid 101).
- TLS: `node:https` with `ca` read from `config/pve-root-ca.pem`. **Never** `rejectUnauthorized: false` or `NODE_TLS_REJECT_UNAUTHORIZED`.
- `cpuPct = cpu * 100` (Proxmox reports a fraction of the container's allotted `cpus`). 5s timeout.
- The token secret never appears in thrown errors, logs, or responses.

### `lib/mcHistory.js`: player history
- Persisted at `data/mc-history.json` (gitignored; created on first write). Shape:
  `{ firstSeen: { [uuid]: epochMs }, peak: { date: 'YYYY-MM-DD', count }, lastSeen: { name, at } | null }`
- `update(state, onlinePlayers, now) → { state, changed }` is pure:
  - Adds `firstSeen` for newly online players and removes players who left. When a player leaves, `lastSeen` is set to them with `at = now`.
  - Uses the local date (America/Denver, the Pi's timezone). On a new date, the peak resets to the current count. Otherwise the peak is `max(peak, onlineCount)`.
- `load()` / `save()` are thin fs wrappers. The file is written only when `changed`, to limit SD-card writes. A missing or corrupt file means start from empty state.
- If the server is offline, history is not updated (players are kept, so a short blip doesn't reset their time online).

### `pages/api/minecraft.js`: route (ESM)
- Runs `ping`, `scrape` and `getContainer` with `Promise.allSettled`. Each part fails independently.
- Bedrock detection: the name starts with `.` (Floodgate prefix) or the UUID starts with `00000000-0000-0000-`. The display name has the leading `.` stripped.
- Response:
  ```js
  {
    mc:   { online: true, version, motd, playersOnline, playersMax,
            players: [{ name, uuid, bedrock, onlineSince }] } | { online: false },
    tps:  { tps, chunks, entities } | null,
    ct:   { status, cpuPct, cpus, memUsed, memMax, diskUsed, diskMax, uptime } | null,
    history: { peakToday, lastSeen: { name, at } | null },
  }
  ```
- Errors are logged server-side as `[minecraft] <part>: <message>` (no secrets) and sent to the client as `null` / `{ online: false }`.
- Config: host/ports come from `config/settings.json` under `minecraft: { host: "192.168.68.151", port: 25565, metricsPort: 19565, container: "minecraft" }`.

### `screens/Minecraft.jsx`: the screen
Matches the existing visual language (see `screens/Portfolio.jsx`): black background, `#111` cards with a 5px accent bar, gray uppercase labels in Arial, green `#4caf50` / red `#f44336`, sizes in `vw`/`vh`.

- **Header row:** `JKMC` · status dot + `ONLINE`/`OFFLINE` · version, with `N/max · peak P` on the right.
- **Left half:** player rows, one per player: 32px avatar (`https://mc-heads.net/avatar/<uuid>/32`, loaded by the browser; Bedrock players get a generic icon and a `BE` badge instead) · name · time online (`5m`, `1h12m`). Max players is 10, so no scrolling or truncation is needed.
  - Online, but no players: "Nobody's on" + "last seen: <name> · <ago>".
  - Offline: a large red `OFFLINE` + "last seen: …".
- **Right half:** a 2×2 tile grid:
  - **TPS:** value to 1 decimal. Accent green ≥19, yellow ≥15, red otherwise.
  - **CPU:** `cpuPct`% with "of N cores".
  - **RAM:** `used/max` in GB with a bar.
  - **WORLD:** `chunks` ch / `entities` ent.
  - Missing data → "—" with a gray accent.
- **Footer:** `CT up 3d 4h · disk 41%`. It turns red when `ct.status !== 'running'`.
- "Time online" and "ago" are computed client-side from epoch values. The current time is set in `useEffect` (no `useState(new Date())`, per the SSR hydration gotcha).
- Loading state: the `PanelLoading` pattern with the text `JKMC`.

### Wiring
- `pages/index.js`: add `'minecraft'` to `PANELS`, `minecraft: 30 * 1000` to `REFRESH_MS`, and `minecraft: null` to the initial `data`. The default `fetchPanel` path (`/api/minecraft`) needs no changes.
- `screens/StatusBar.jsx`: `minecraft: { segment: 'JKMC' }` in `SEGMENT_MAP`. Add `'JKMC'` to `SEGMENTS` (before `CAMERA`).
- `.gitignore`: add `/data/`. (`config/pve-root-ca.pem` is already covered by `*.pem`.)

## Exporter notes (verified 2026-10-02)

- Plugin: `prometheus-exporter-paper` v1.4.2 from github.com/drewburr/minecraft-prometheus-exporter, installed in CT 101 with snapshot `pre-metrics` taken. `web.listen_address: 192.168.68.151`, port 19565, not port-forwarded. The bind change takes effect on the next MC restart (currently `*:19565`).
- Metrics: `mc_server_tick_rate_{bucket,count,sum,created}`, `mc_server_tick_seconds_*`, `mc_dimension_tick_seconds_*`, `mc_dimension_chunks_loaded{id,name}`, `mc_entities_total{dim,dim_id,type}`, `mc_player_list{id,name}`.
- On Paper, `mc_server_tick_seconds` is the inter-tick interval (`PrometheusExporterPlugin.java`: "Measure server tick time as the interval between consecutive ticks"), and `mc_dimension_tick_seconds` copies the same value under one `"server"` series. Neither is work-per-tick, so the panel shows no MSPT. TPS from `mc_server_tick_rate` is accurate (capped at 20).

## Setup steps (one-time, on infrastructure)

1. **Proxmox token** (over SSH via `/c/Windows/System32/OpenSSH/ssh.exe root@192.168.68.150`):
   `pveum user add dashy@pve`, `pveum acl modify / --users dashy@pve --roles PVEAuditor`, then `pveum user token add dashy@pve dashy --privsep 0 --output-format json`, piped (for example via `jq -r .value`) straight into an SSH append to the Pi's `~/dashy-v2/.env.local`. The secret is never printed. Also append `PROXMOX_URL=https://192.168.68.150:8006` and `PROXMOX_TOKEN_ID=dashy@pve!dashy`.
2. **CA cert:** copy `/etc/pve/pve-root-ca.pem` from the host to the Pi's `~/dashy-v2/config/pve-root-ca.pem` (and to the local dev checkout).
3. Neither is in git. Both are documented in CLAUDE.md.

## Testing

- No test runner exists. Add `"test": "node --test"` and use the built-in `node:test` + `node:assert` (no new dependency). Tests go in `lib/__tests__/`.
- Unit tests for the pure logic: VarInt encode/decode, `parseStatusResponse` (string and component MOTD, missing sample), `parsePrometheus`, `computeTps` (first poll, normal change, counter reset, zero count), `mcHistory.update` (join, leave → lastSeen, peak, date rollover, offline no-op).
- Live checks before deploy: from the dev machine, `curl localhost:3000/api/minecraft` returns all three sections filled. Then stop the network or point at a wrong port to confirm each part degrades on its own.
- After deploy: check on the real 800×480 screen (online with players, nobody on, and how it looks when the exporter is unavailable). From outside the LAN, confirm `https://dashy.lukehaws.com/api/minecraft` returns 404.

## Docs

- CLAUDE.md: replace the stale 12-panel list with the current rotation (weather, calendar, gmail, portfolio, minecraft, plus the camera overlay), and add the `PROXMOX_*` env vars, `config/pve-root-ca.pem`, the `minecraft` block in `settings.json`, and `data/mc-history.json`.
- README: add the panel and its setup steps.

## Out of scope

Host-level Proxmox stats, the claude-agent container, sparklines/rrddata, MSPT, any Proxmox write/power actions, and any changes to the tunnel, router, or MC server config.
