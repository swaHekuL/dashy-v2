<!-- Last updated: 2026-10-22 -->
# History charts (JKMC 72 h, Portfolio 30 d) — design

Status: **approved 2026-10-22; collector code built and tested; container CT 103 created (192.168.68.153), not yet deployed to.**

## Goal

Add sparkline history to two Dashy panels:

- **JKMC:** TPS, CPU, RAM and World (chunks) over the last **72 hours**.
- **Portfolio:** a total-portfolio chart and one chart per account over the last **30 days**, while keeping dollar **and** % change on every account.

Mockups (made-up data, not running code):

- JKMC option B: `assets/2026-10-22-jkmc-72h-mockup.png`
- Portfolio option D: `assets/2026-10-22-portfolio-30d-mockup.png`

## Decisions already made (Luke, 2026-10-22)

- History lives in a **new container on the Proxmox host**, not on the Pi. The Pi only reads, so there is no SD-card wear.
- **No Prometheus or Grafana.** A small custom collector plus SQLite.
- **Dashy fetches portfolio data itself and pushes it to the container.** The SnapTrade keys stay where they are now.
- The container's API is **LAN only**.
- Layouts: **JKMC option B** (one wide row per metric), **Portfolio option D** (total chart across the top, 4 account cards in a row below).
- Ranges: **72 h** for JKMC, **30 d** for Portfolio.

## Architecture

```
 Minecraft CT 101 :19565/metrics ─┐
 Proxmox API (read-only token) ───┼─> collector (new CT) ──> SQLite file
                                  │        │  ▲
                                  │        │  └── POST /ingest/portfolio  (Dashy, hourly)
 Pi: Dashy server routes ─────────┴── GET /series ────────────┘
 (/api/history/*)  <── browser on the Pi (same-origin, unchanged)
```

- **Collector** (one Node process, systemd service in the new container):
  - Every **30 s** polls the Minecraft exporter and the Proxmox API (container + host) and stores one row per metric. It reuses the existing `lib/mcMetrics.js` and `lib/proxmox.js` so the numbers match what the panel already shows.
  - Serves a small HTTP API (below).
- **Dashy** (Pi):
  - New route `pages/api/history.js` calls the collector with the token and returns thinned series to the browser. The browser never talks to the collector.
  - `pages/api/portfolio.js`, when it refreshes from SnapTrade (already cached for 1 h), pushes the per-account totals to `/ingest/portfolio`. A failed push is logged once and never breaks the portfolio response.
- **Why the collector polls Minecraft and Proxmox itself:** Dashy's browser polls every panel whether or not it is on screen, but only while the Pi is up. A server-side collector keeps recording through Pi reboots (every Dashy deploy needs one).

## Data

SQLite table:

```sql
CREATE TABLE samples (
  metric TEXT NOT NULL,
  ts     INTEGER NOT NULL,   -- unix seconds
  value  REAL NOT NULL,
  PRIMARY KEY (metric, ts)
);
```

| Metric | Source | Cadence |
| --- | --- | --- |
| `mc_tps`, `mc_chunks`, `mc_entities`, `mc_players` | Minecraft exporter + Server List Ping | 30 s |
| `ct_cpu_pct`, `ct_mem_used`, `ct_mem_max`, `ct_disk_used` | Proxmox (CT 101) | 30 s |
| `host_cpu_pct`, `host_mem_used`, `host_disk_used` | Proxmox (host) | 30 s |
| `pf_total:<accountId>` | Dashy push | about 1 h |

- Portfolio rows also record the account name (a small `accounts(id, name)` table, updated on each push) so the API can label series.
- **Missing data is stored as missing, not as zero.** If a poll fails, nothing is written. Charts show a gap or a flat join, not a false dip to 0.
- **Retention:** raw 30 s metrics pruned after **14 days** (a nightly job); portfolio rows kept indefinitely (4 accounts x 24 x 365 is about 35 k rows a year).
- **Size:** about 10 metrics x 2 rows a minute is roughly 2.9 k rows an hour. Over 14 days that is about 1 M rows, well under 100 MB.

## API (collector)

All requests need `Authorization: Bearer <token>`. The server binds to the container's LAN address only.

- `GET /series?metrics=mc_tps,ct_cpu_pct,...&hours=72&points=120`
  - Returns `{ from, to, series: { <metric>: [[ts, value], ...] } }`, thinned to about `points` values per series.
  - **Thinning rule:** split the range into equal buckets. Use the bucket **minimum** for `mc_tps` (so lag dips stay visible), the **maximum** for CPU, and the **average** for the rest.
- `GET /portfolio?days=30&points=120`
  - Returns `{ total: [[ts, value]...], accounts: { <id>: { name, series: [[ts, value]...] } } }`.
  - Buckets use the **last** value. The total sums accounts at each bucket and carries an account's last known value forward when one is missing.
- `POST /ingest/portfolio` with `{ ts, accounts: [{ id, name, value }] }` writes one row per account. It is idempotent per `(metric, ts)`.
- `GET /health` returns `{ ok, lastSampleAgeSec }`. The collector also exits non-zero if it cannot write, so systemd restarts it.

## Dashy changes

- `pages/api/history.js` (new): proxies `/series` and `/portfolio` with caching (30 s for JKMC, 5 min for portfolio). If the collector is unreachable it returns an empty result.
- `.env.local` on the Pi gets `HISTORY_URL` and `HISTORY_TOKEN`. **Never committed**, same handling as the other keys.
- `screens/Minecraft.jsx`: layout becomes option B. Each metric row keeps today's detail text (`4c · host 9%`, `host 41.0/64.0G`, `740 entities`) with a chart on the right. TPS charts use a fixed 0–20.5 scale, CPU 0–100 %, RAM 0–max.
- `screens/Portfolio.jsx`: layout becomes option D. The header shows the total with its dollar and % change. A 30-day total chart sits across the top, and each account card shows dollar change, % change and a mini chart.
- **Shared `Sparkline` component:** plain SVG, `preserveAspectRatio="none"`, `vector-effect="non-scaling-stroke"`, no chart library.
- **Chart rules:**
  - A series with fewer than 2 points shows "collecting…".
  - A range that is only partly filled draws from the first data point and labels the left edge honestly ("since Oct 24").
  - Portfolio mini charts use a minimum range of about 1 % of the value, so a tiny wobble does not look like a crash.
  - The line color follows the trend across the whole chart. Today's change keeps its own colored text.
- **When the collector is down or empty,** both panels render exactly as they do today, without charts.

## Container

- **CT 103 `history`**, Debian 13 LXC, 1 core, 512 MB RAM, 256 MB swap, 4 GB disk, `onboot`, fixed address **192.168.68.153** (Luke reserves it in the Deco app).
- Node 22 (built-in `node:sqlite`). Debian 13's own Node is older, so Node 22 is installed separately. The collector is in `collector/*.mjs`; tests: `npm run test:collector` under Node 22.
- The collector is a checkout of the public dashy-v2 repo (`collector/` folder plus the shared `lib/` files) run under systemd. Updating it means `git pull` and a service restart.
- A Proxmox snapshot is taken before first deploy and after each later change.

## Security

- **LAN only:** the collector listens on the LAN address, nothing is forwarded or put through the Cloudflare tunnel.
- **Token:** one random bearer token, stored in `.env.local` on the Pi and in the container's service environment, never in git or chat.
- **Proxmox access:** the collector needs read access to the Proxmox API. **Decided (Luke):** the collector reuses the Pi's existing read-only Proxmox token (low stakes). It is copied straight from the Pi's `.env.local` into the container's service environment, never displayed.
- **Portfolio data is sensitive.** The database holds account balances. It is covered by container snapshots and backups, so those stay private.
- The repo is public: no tokens, no account names or balances in code, tests or docs. Test fixtures use made-up numbers.

## Failure behavior

| Failure | Result |
| --- | --- |
| Exporter or Proxmox poll fails | That poll is skipped (no row). Logged once when it starts and once on recovery, like `pages/api/minecraft.js`. |
| Collector down | Dashy panels show no charts, everything else is unchanged. History has a gap for the downtime. |
| Portfolio push fails | Logged once. The next hourly push carries on, so only that one point is missing. |
| Pi down or rebooting | JKMC history keeps recording. Portfolio pushes pause because SnapTrade is only fetched by Dashy. |

## Testing

- **Unit tests** (`node --test`, Node 20 compatible for the Pi's shared code):
  - the thinning and bucket rules, including the TPS min-bucket rule
  - gaps and carried-forward totals
  - retention pruning
  - auth rejection
  - SQLite round trips
- **Dashy tests:** the proxy route's empty-result fallback, and the `Sparkline` point-to-path math.
- **Before deploy:** run the collector locally against the live exporter and Proxmox, and confirm rows appear.
- **Before the Pi deploy:** render the real panels with sample series (the same approach used for the before images) and compare to the mockups.

## Rollout order

1. Luke approves this spec.
2. Build and test the collector and the Dashy changes here, with no host access. Commit and push only when Luke asks.
3. Create the container. **This needs Luke's explicit yes in chat** (`ssh pve` is root on the host). The exact commands, size and address are shown first.
4. Deploy the collector, take a snapshot, and let it collect for a few hours.
5. Deploy Dashy to the Pi (`git pull && npm run build`, then `sudo reboot`, every time).
6. Charts fill in from the deploy day on. There is no historical backfill, so the JKMC chart takes 72 h to fill and the portfolio chart takes 30 days.

## Out of scope

- Grafana or any browsable dashboard.
- Alerts (for example, a message when TPS stays low).
- Backfilling history from before deploy.
- Charts on any other panel.

## Remote-button time views (follow-up)

One unused remote button will cycle the chart range (JKMC 6 h / 24 h / 72 h; portfolio 7 d / 30 d / 90 d), resetting to the default after the idle timeout. The button's `key` value is **unknown**: test with Luke at his desk before wiring it in. The collector already supports any range, so this is a Dashy-only change.

## Open items

- Remote button's key (test with Luke).
- Luke reserves 192.168.68.153 in the Deco app.
