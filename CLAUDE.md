@AGENTS.md

## Project

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
- Proxmox API → `https://192.168.68.150:8006` (`/nodes/pve/lxc` + `/nodes/pve/status`), read-only `dashy@pve!dashy` token (`PVEAuditor`), TLS pinned to `config/pve-root-ca.pem` (`lib/proxmox.js`). Container CPU comes from the newest `rrddata` point, because the list endpoint's `cpu` is an instantaneous sample that often reads 0.
- Player history persists in `data/mc-history.json` (gitignored)
- Tests: `npm test` (node:test, `lib/__tests__/`)

## Config Files

- `config/credentials.json` — gitignored, Google OAuth secrets (client_id, client_secret, refresh_token)
- `config/settings.json` — tracked in git, non-sensitive: lat/lon for Open-Meteo weather, `tickers`, `gasPrices.stations`, and `minecraft` (`host`, `port`, `metricsPort`, `container`) for the JKMC panel
- `.env.local` — gitignored, `GOOGLE_MAPS_API_KEY` for the gas prices Places API
- `.env.local` — also holds `PROXMOX_URL`, `PROXMOX_TOKEN_ID`, `PROXMOX_TOKEN_SECRET` (read-only Proxmox token; Pi + dev machine only, never commit or print)
- `config/pve-root-ca.pem` — gitignored (`*.pem`), copy of the Proxmox host's `/etc/pve/pve-root-ca.pem`; must be placed on the Pi by hand

## Pi Deployment

- SSH: `ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62` (IP may change — check router DHCP list if unreachable; set static reservation to lock it down)
- Node via nvm: prefix commands with `export PATH=/home/swahekul/.nvm/versions/node/v20.20.2/bin:$PATH &&`
- Deploy from PowerShell (single quotes prevent $PATH expansion):
  `ssh -i ~/.ssh/id_ed25519_dashy swahekul@192.168.68.62 'export PATH=/home/swahekul/.nvm/versions/node/v20.20.2/bin:$PATH && cd ~/dashy-v2 && git pull && npm run build && pkill -f "node.*next"; npm start >> ~/dashy.log 2>&1 &'`
- Logs: `~/dashy.log` on Pi

### Claude Notify Hook

- Public endpoint: `https://dashy.lukehaws.com/api/claude-notify` (Cloudflare Tunnel `dashy-notify`, config at `/etc/cloudflared/config.yml` on the Pi, routes only this one path — everything else on that hostname 404s)
- Tunnel runs as a systemd service: `cloudflared` (check with `systemctl status cloudflared` on the Pi)
- `CLAUDE_NOTIFY_TOKEN` in the Pi's `.env.local` is the shared secret the hook script authenticates with — regenerate with `openssl rand -hex 32` if it ever leaks, and update it on every hook-side machine (see `docs/claude-notify-hook-agent-brief.md`)
- Pi is 64-bit (`aarch64`/Debian 13), so `cloudflared` was installed from the `cloudflared-linux-arm64` release asset, not `-arm`

## Gotchas

- **SSR hydration**: Never `useState(new Date())` — use `useState(null)` + useEffect to set client-side
- **setData + await**: Resolve before updater: `const json = await res.json(); setData(prev => ({ ...prev, [panel]: json }))`
- **API routes are ESM**: `import x from '...'` only — `require()` throws ReferenceError at runtime
- **googleapis timeout**: Second argument only: `client.method(params, { timeout: 8000 })` — silently ignored inside params
